import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context.js';
import {
  hashPassword,
  comparePassword,
  generateTokenPair,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from '../../lib/auth.js';
import {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromCookies,
} from '../../lib/cookies.js';
import { validateInput, createUserInput, loginInput } from '../../lib/validation.js';
import { AuthErrorCode, throwConflictError, requireUser, requireWriteAccess } from '../../lib/guards.js';
import {
  isUserAccountLocked,
  getUserLockoutRemainingSeconds,
  recordUserFailedLoginAttempt,
  clearUserLoginAttempts,
  getLockoutDurationMinutes,
} from '../../lib/loginAttempts.js';
import type { FastifyRequest } from 'fastify';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateUserArgs {
  input: {
    name: string;
    email: string;
    password: string;
  };
}

export interface LoginArgs {
  input: {
    email: string;
    password: string;
  };
}

export interface RefreshTokenArgs {
  refreshToken?: string;
}

export interface LogoutArgs {
  refreshToken?: string;
}

/**
 * Extract user agent and IP from request
 */
function getRequestMetadata(ctx: GraphQLContext): { userAgent: string | undefined; ipAddress: string | undefined } {
  const ua = ctx.req.headers['user-agent'];
  const userAgent = typeof ua === 'string' ? ua : undefined;
  const ipAddress = ctx.req.ip;
  return { userAgent, ipAddress };
}

// ============================================================================
// MUTATIONS
// ============================================================================

export const authMutations = {
  /**
   * Create a new user account
   */
  async createUser(_: unknown, { input }: CreateUserArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);

    // Validate input
    const validated = validateInput(createUserInput, input);

    // Normalize email
    const email = validated.email.toLowerCase().trim();

    // Check if email already exists
    const existingUser = await ctx.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      // SECURITY: Generic error message to prevent email enumeration
      // An attacker cannot determine if an email is already registered
      throwConflictError('Unable to create account with this email');
    }

    // Hash password
    const hashedPassword = await hashPassword(validated.password);

    // Create user
    const now = new Date();
    const user = await ctx.prisma.user.create({
      data: {
        name: validated.name.trim(),
        email,
        password: hashedPassword,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Generate token pair
    const { userAgent, ipAddress } = getRequestMetadata(ctx);
    const { accessToken, refreshToken } = await generateTokenPair(
      ctx.prisma,
      user,
      userAgent,
      ipAddress
    );

    // Set HTTP-only cookies for web clients
    setAuthCookies(ctx.reply, accessToken, refreshToken);

    return {
      accessToken,
      refreshToken,
      token: accessToken, // deprecated, for backwards compatibility
      user,
    };
  },

  /**
   * Login with email and password
   * Implements brute force protection with account lockout
   */
  async login(_: unknown, { input }: LoginArgs, ctx: GraphQLContext) {
    // Validate input
    const validated = validateInput(loginInput, input);

    // Normalize email
    const email = validated.email.toLowerCase().trim();

    // Generic error message to prevent email enumeration
    const invalidCredentialsError = 'Invalid email or password';

    // Find user
    const user = await ctx.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.password) {
      throw new GraphQLError(invalidCredentialsError, {
        extensions: { code: AuthErrorCode.UNAUTHENTICATED },
      });
    }

    // Check if account is locked (brute force protection)
    if (isUserAccountLocked(user)) {
      const remainingSeconds = getUserLockoutRemainingSeconds(user);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      throw new GraphQLError(
        `Account temporarily locked. Try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`,
        { extensions: { code: AuthErrorCode.UNAUTHENTICATED } }
      );
    }

    // Verify password
    const validPassword = await comparePassword(validated.password, user.password);

    if (!validPassword) {
      // Record failed attempt
      const { locked } = await recordUserFailedLoginAttempt(ctx.prisma, user.id);

      if (locked) {
        throw new GraphQLError(
          `Account locked due to too many failed attempts. Try again in ${getLockoutDurationMinutes()} minutes.`,
          { extensions: { code: AuthErrorCode.UNAUTHENTICATED } }
        );
      }

      throw new GraphQLError(invalidCredentialsError, {
        extensions: { code: AuthErrorCode.UNAUTHENTICATED },
      });
    }

    // Clear login attempts on successful login
    await clearUserLoginAttempts(ctx.prisma, user.id);

    // Generate token pair
    const { userAgent, ipAddress } = getRequestMetadata(ctx);
    const { accessToken, refreshToken } = await generateTokenPair(
      ctx.prisma,
      user,
      userAgent,
      ipAddress
    );

    // Set HTTP-only cookies for web clients
    setAuthCookies(ctx.reply, accessToken, refreshToken);

    return {
      accessToken,
      refreshToken,
      token: accessToken, // deprecated, for backwards compatibility
      user,
    };
  },

  /**
   * Refresh access token using a valid refresh token
   * Implements token rotation for security
   *
   * Can receive refresh token from:
   * 1. HTTP-only cookie (web clients - preferred)
   * 2. GraphQL argument (API clients/legacy)
   */
  async refreshToken(_: unknown, { refreshToken: argRefreshToken }: RefreshTokenArgs, ctx: GraphQLContext) {
    // Try to get refresh token from cookie first, then fall back to argument
    const cookies = (ctx.req as FastifyRequest & { cookies?: Record<string, string> }).cookies ?? {};
    const cookieRefreshToken = getRefreshTokenFromCookies(cookies);
    const refreshToken = cookieRefreshToken || argRefreshToken;

    if (!refreshToken || refreshToken.trim() === '') {
      throw new GraphQLError('Refresh token is required', {
        extensions: { code: AuthErrorCode.UNAUTHENTICATED },
      });
    }

    const { userAgent, ipAddress } = getRequestMetadata(ctx);
    const result = await verifyAndRotateRefreshToken(
      ctx.prisma,
      refreshToken,
      userAgent,
      ipAddress
    );

    if (!result) {
      // Clear cookies on invalid refresh token
      clearAuthCookies(ctx.reply);
      throw new GraphQLError('Invalid or expired refresh token', {
        extensions: { code: AuthErrorCode.UNAUTHENTICATED },
      });
    }

    // Fetch the user
    const user = await ctx.prisma.user.findUnique({
      where: { id: result.userId },
    });

    if (!user) {
      clearAuthCookies(ctx.reply);
      throw new GraphQLError('User not found', {
        extensions: { code: AuthErrorCode.UNAUTHENTICATED },
      });
    }

    // Set new HTTP-only cookies for web clients
    setAuthCookies(ctx.reply, result.newTokenPair.accessToken, result.newTokenPair.refreshToken);

    return {
      accessToken: result.newTokenPair.accessToken,
      refreshToken: result.newTokenPair.refreshToken,
      token: result.newTokenPair.accessToken, // deprecated
      user,
    };
  },

  /**
   * Logout and revoke the refresh token
   *
   * Can receive refresh token from:
   * 1. HTTP-only cookie (web clients - preferred)
   * 2. GraphQL argument (API clients/legacy)
   */
  async logout(_: unknown, { refreshToken: argRefreshToken }: LogoutArgs, ctx: GraphQLContext) {
    // Try to get refresh token from cookie first, then fall back to argument
    const cookies = (ctx.req as FastifyRequest & { cookies?: Record<string, string> }).cookies ?? {};
    const cookieRefreshToken = getRefreshTokenFromCookies(cookies);
    const refreshToken = cookieRefreshToken || argRefreshToken;

    if (refreshToken) {
      // Revoke specific refresh token
      await revokeRefreshToken(ctx.prisma, refreshToken);
    }

    // Always clear cookies for web clients
    clearAuthCookies(ctx.reply);

    // Always return true - logout should not fail
    return true;
  },

  /**
   * Logout from all devices by revoking all refresh tokens
   * Requires authentication
   */
  async logoutAll(_: unknown, __: unknown, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const user = requireUser(ctx);
    const revokedCount = await revokeAllUserRefreshTokens(ctx.prisma, user.id);
    return revokedCount;
  },
};
