/**
 * GraphQL resolvers for human observers
 */

import crypto from 'crypto';
import type { HumanObserver } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import type { GraphQLContext } from '../context.js';
import {
  verifyAndRotateObserverRefreshToken,
  revokeObserverRefreshToken,
  revokeAllObserverRefreshTokens,
  generateObserverTokenPair,
  hashPassword,
  comparePassword,
  hashRefreshToken,
} from '../../lib/auth.js';
import {
  clearObserverAuthCookies,
  setObserverAuthCookies,
  getObserverRefreshTokenFromCookies,
} from '../../lib/cookies.js';
import { sendPasswordResetEmail, sendEmailVerificationEmail, isEmailServiceConfigured } from '../../lib/email.js';
import { throwValidationError, throwAuthError, isObserverAdmin } from '../../lib/guards.js';
import { validateInput, email as emailSchema, password as passwordSchema } from '../../lib/validation.js';
import {
  isAccountLocked,
  getLockoutRemainingSeconds,
  recordFailedLoginAttempt,
  clearLoginAttempts,
  getLockoutDurationMinutes,
} from '../../lib/loginAttempts.js';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

export interface RegisterObserverInput {
  name: string;
  email: string;
  password: string;
}

export interface SetupObserverAccountInput {
  email: string;
  password: string;
}

export interface ObserverLoginInput {
  email: string;
  password: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const registerObserverInputSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long').trim(),
  email: emailSchema,
  password: passwordSchema,
});

const setupAccountInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const resetPasswordInputSchema = z.object({
  token: z.string().length(64, 'Invalid reset token'),
  password: passwordSchema,
});

// ============================================================================
// CONSTANTS
// ============================================================================

const PASSWORD_RESET_TOKEN_EXPIRY_HOURS = 1;
const EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES = 15;
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Generate a cryptographically secure 8-digit verification code
 * 8 digits = 90,000,000 combinations (vs 900,000 for 6 digits)
 * Makes brute force attacks significantly harder
 */
function generateVerificationCode(): string {
  // Generate random number between 10000000 and 99999999
  const randomBytes = crypto.randomBytes(4);
  const randomNumber = randomBytes.readUInt32BE(0);
  const code = 10000000 + (randomNumber % 90000000);
  return code.toString();
}

// ============================================================================
// QUERIES
// ============================================================================

export const observerQueries = {
  /**
   * Get the currently authenticated observer
   */
  observerMe(_: unknown, __: unknown, ctx: GraphQLContext) {
    return ctx.currentObserver;
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const observerMutations = {
  /**
   * Register as an observer using email and password (no agent required)
   */
  async registerObserver(
    _: unknown,
    { input }: { input: RegisterObserverInput },
    ctx: GraphQLContext
  ) {
    const validated = validateInput(registerObserverInputSchema, input);

    // Check email uniqueness upfront
    const existingObserver = await ctx.prisma.humanObserver.findUnique({
      where: { email: validated.email },
    });
    if (existingObserver) {
      throwValidationError('This email is already in use');
    }

    const hashedPassword = await hashPassword(validated.password);
    const now = new Date();

    let observer;
    try {
      observer = await ctx.prisma.humanObserver.create({
        data: {
          displayName: validated.name,
          email: validated.email,
          passwordHash: hashedPassword,
          passwordChangedAt: now,
          emailVerified: false,
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
        },
      });
    } catch (error) {
      // Handle race condition on email uniqueness (Prisma P2002)
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throwValidationError('This email is already in use');
      }
      throw error;
    }

    // Send email verification automatically
    const verificationCode = generateVerificationCode();
    const verificationExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

    await ctx.prisma.emailVerificationCode.create({
      data: {
        code: verificationCode,
        email: validated.email,
        observerId: observer.id,
        expiresAt: verificationExpiresAt,
      },
    });

    sendEmailVerificationEmail(
      validated.email,
      verificationCode,
      observer.displayName
    ).catch((err) => {
      console.error('[Observer] Failed to send verification email on registration:', err);
    });

    // Generate tokens and set cookies
    const userAgent = ctx.req.headers['user-agent'];
    const ipAddress = ctx.req.ip;
    const tokenPair = await generateObserverTokenPair(
      ctx.prisma,
      observer.id,
      typeof userAgent === 'string' ? userAgent : undefined,
      ipAddress
    );

    setObserverAuthCookies(ctx.reply, tokenPair.accessToken, tokenPair.refreshToken);

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      observer,
    };
  },

  /**
   * Logout the current observer
   */
  async observerLogout(_: unknown, __: unknown, ctx: GraphQLContext) {
    // Get refresh token from cookie
    const cookies = (ctx.req as FastifyRequest & { cookies?: Record<string, string> }).cookies ?? {};
    const refreshToken = getObserverRefreshTokenFromCookies(cookies);

    if (refreshToken) {
      await revokeObserverRefreshToken(ctx.prisma, refreshToken);
    }

    // Clear cookies
    clearObserverAuthCookies(ctx.reply);

    return true;
  },

  /**
   * Refresh observer access token
   */
  async observerRefreshToken(_: unknown, __: unknown, ctx: GraphQLContext) {
    const cookies = (ctx.req as FastifyRequest & { cookies?: Record<string, string> }).cookies ?? {};
    const refreshToken = getObserverRefreshTokenFromCookies(cookies);

    if (!refreshToken) {
      clearObserverAuthCookies(ctx.reply);
      return null;
    }

    const userAgent = ctx.req.headers['user-agent'];
    const ipAddress = ctx.req.ip;

    const result = await verifyAndRotateObserverRefreshToken(
      ctx.prisma,
      refreshToken,
      typeof userAgent === 'string' ? userAgent : undefined,
      ipAddress
    );

    if (!result) {
      clearObserverAuthCookies(ctx.reply);
      return null;
    }

    // Fetch observer
    const observer = await ctx.prisma.humanObserver.findUnique({
      where: { id: result.observerId },
    });

    if (!observer) {
      clearObserverAuthCookies(ctx.reply);
      return null;
    }

    // Set new cookies
    setObserverAuthCookies(
      ctx.reply,
      result.newTokenPair.accessToken,
      result.newTokenPair.refreshToken
    );

    return {
      accessToken: result.newTokenPair.accessToken,
      refreshToken: result.newTokenPair.refreshToken,
      observer,
    };
  },

  /**
   * Set up email/password for observer account
   * Called after claiming an agent when requiresAccountSetup is true.
   * Automatically sends a verification email to the provided address.
   */
  async setupObserverAccount(
    _: unknown,
    { input }: { input: SetupObserverAccountInput },
    ctx: GraphQLContext
  ) {
    // Require authenticated observer
    if (!ctx.currentObserver) {
      throwAuthError('You must be logged in to set up your account');
    }

    // Prevent re-setup if already configured (requires password reset flow)
    if (ctx.currentObserver.email && ctx.currentObserver.passwordHash) {
      throwValidationError(
        'Account is already set up. Use password reset to update credentials.'
      );
    }

    // Validate input
    const validated = validateInput(setupAccountInputSchema, input);

    // Check if email is already taken by another observer
    const existingObserver = await ctx.prisma.humanObserver.findUnique({
      where: { email: validated.email },
    });

    if (existingObserver && existingObserver.id !== ctx.currentObserver.id) {
      throwValidationError('This email is already in use');
    }

    // Hash password and update observer
    const hashedPassword = await hashPassword(validated.password);
    const now = new Date();

    let updatedObserver;
    try {
      updatedObserver = await ctx.prisma.humanObserver.update({
        where: { id: ctx.currentObserver.id },
        data: {
          email: validated.email,
          passwordHash: hashedPassword,
          passwordChangedAt: now,
          emailVerified: false, // Reset verification status when email changes
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
        },
      });
    } catch (error) {
      // Handle race condition on email uniqueness (Prisma P2002)
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throwValidationError('This email is already in use');
      }
      throw error;
    }

    // Revoke all existing refresh tokens (new ones generated below)
    await revokeAllObserverRefreshTokens(ctx.prisma, ctx.currentObserver.id);

    // Send verification email automatically with 8-digit code
    const verificationCode = generateVerificationCode();
    const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Delete any existing verification codes for this observer
    await ctx.prisma.emailVerificationCode.deleteMany({
      where: { observerId: updatedObserver.id },
    });

    // Create new verification code
    await ctx.prisma.emailVerificationCode.create({
      data: {
        code: verificationCode,
        email: validated.email,
        observerId: updatedObserver.id,
        expiresAt: verificationExpiresAt,
      },
    });

    // Send verification email (fire and forget - don't block response)
    sendEmailVerificationEmail(
      validated.email,
      verificationCode,
      updatedObserver.displayName
    ).catch((err) => {
      console.error('[Observer] Failed to send verification email:', err);
    });

    // Generate new tokens
    const userAgent = ctx.req.headers['user-agent'];
    const ipAddress = ctx.req.ip;
    const tokenPair = await generateObserverTokenPair(
      ctx.prisma,
      updatedObserver.id,
      typeof userAgent === 'string' ? userAgent : undefined,
      ipAddress
    );

    // Set cookies
    setObserverAuthCookies(ctx.reply, tokenPair.accessToken, tokenPair.refreshToken);

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      observer: updatedObserver,
    };
  },

  /**
   * Login as observer using email and password
   */
  async observerLogin(
    _: unknown,
    { input }: { input: ObserverLoginInput },
    ctx: GraphQLContext
  ) {
    // Validate input
    const validated = validateInput(loginInputSchema, input);

    // Find observer by email
    const observer = await ctx.prisma.humanObserver.findUnique({
      where: { email: validated.email },
    });

    // Generic error message to prevent email enumeration
    const invalidCredentialsError = 'Invalid email or password';

    if (!observer || !observer.passwordHash) {
      throwAuthError(invalidCredentialsError);
    }

    // Check if account is locked
    if (isAccountLocked(observer)) {
      const remainingSeconds = getLockoutRemainingSeconds(observer);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      throwAuthError(
        `Account temporarily locked. Try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}.`
      );
    }

    // Verify password
    const passwordValid = await comparePassword(validated.password, observer.passwordHash);
    if (!passwordValid) {
      // Record failed attempt
      const { locked } = await recordFailedLoginAttempt(ctx.prisma, observer.id);

      if (locked) {
        throwAuthError(
          `Account locked due to too many failed attempts. Try again in ${getLockoutDurationMinutes()} minutes.`
        );
      }

      throwAuthError(invalidCredentialsError);
    }

    // Clear login attempts on successful login
    await clearLoginAttempts(ctx.prisma, observer.id);

    // Generate tokens
    const userAgent = ctx.req.headers['user-agent'];
    const ipAddress = ctx.req.ip;
    const tokenPair = await generateObserverTokenPair(
      ctx.prisma,
      observer.id,
      typeof userAgent === 'string' ? userAgent : undefined,
      ipAddress
    );

    // Set cookies
    setObserverAuthCookies(ctx.reply, tokenPair.accessToken, tokenPair.refreshToken);

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      observer,
    };
  },

  /**
   * Request a password reset email
   * Always returns true to prevent email enumeration
   */
  async requestPasswordReset(
    _: unknown,
    { email }: { email: string },
    ctx: GraphQLContext
  ) {
    // Validate email format
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      // Still return true to prevent enumeration
      return true;
    }

    // Find observer by email
    const observer = await ctx.prisma.humanObserver.findUnique({
      where: { email: emailResult.data },
    });

    // If observer exists and email service is configured, send reset email
    if (observer && isEmailServiceConfigured()) {
      // Generate a secure token
      const token = crypto.randomBytes(32).toString('hex');
      const hashedToken = hashRefreshToken(token);

      // Calculate expiry
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + PASSWORD_RESET_TOKEN_EXPIRY_HOURS);

      // Delete any existing reset tokens for this observer
      await ctx.prisma.passwordResetToken.deleteMany({
        where: { observerId: observer.id },
      });

      // Create new reset token
      await ctx.prisma.passwordResetToken.create({
        data: {
          token: hashedToken,
          observerId: observer.id,
          expiresAt,
        },
      });

      // Send reset email (fire and forget - don't block response)
      sendPasswordResetEmail(observer.email!, token, observer.displayName).catch((err) => {
        console.error('[Observer] Failed to send password reset email:', err);
      });
    }

    // Always return true to prevent email enumeration
    return true;
  },

  /**
   * Reset password using token from email
   */
  async resetPassword(
    _: unknown,
    { input }: { input: ResetPasswordInput },
    ctx: GraphQLContext
  ) {
    // Validate input
    const validated = validateInput(resetPasswordInputSchema, input);

    // Hash the token to find in database
    const hashedToken = hashRefreshToken(validated.token);

    // Find the reset token
    const resetToken = await ctx.prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
      include: { observer: true },
    });

    // Generic error for security
    const invalidTokenError = 'Invalid or expired reset link. Please request a new one.';

    if (!resetToken) {
      throwValidationError(invalidTokenError);
    }

    // Check if token is used
    if (resetToken.used) {
      throwValidationError(invalidTokenError);
    }

    // Check if token is expired
    if (resetToken.expiresAt < new Date()) {
      // Mark as used to prevent future attempts
      await ctx.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });
      throwValidationError(invalidTokenError);
    }

    // Hash the new password
    const hashedPassword = await hashPassword(validated.password);

    // Update password with timestamp, mark token as used, and revoke all tokens in transaction
    // The passwordChangedAt field is used to invalidate tokens issued before the change
    await ctx.prisma.$transaction([
      ctx.prisma.humanObserver.update({
        where: { id: resetToken.observerId },
        data: {
          passwordHash: hashedPassword,
          passwordChangedAt: new Date(),
          // Clear lockout on successful password reset
          loginAttempts: 0,
          lastFailedLogin: null,
          lockedUntil: null,
        },
      }),
      ctx.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
      // Revoke all refresh tokens for security
      ctx.prisma.observerRefreshToken.updateMany({
        where: { observerId: resetToken.observerId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ]);

    return true;
  },

  /**
   * Send email verification code to current observer
   */
  async sendEmailVerification(_: unknown, __: unknown, ctx: GraphQLContext) {
    if (!ctx.currentObserver) {
      throwAuthError('You must be logged in');
    }

    if (!ctx.currentObserver.email) {
      throwValidationError('No email set for this account');
    }

    if (ctx.currentObserver.emailVerified) {
      throwValidationError('Email already verified');
    }

    // Check for rate limiting - max 3 codes per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCodes = await ctx.prisma.emailVerificationCode.count({
      where: {
        observerId: ctx.currentObserver.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentCodes >= 3) {
      throwValidationError('Too many verification requests. Please wait before requesting a new code.');
    }

    // Generate 8-digit code
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000);

    // Delete existing codes for this observer
    await ctx.prisma.emailVerificationCode.deleteMany({
      where: { observerId: ctx.currentObserver.id },
    });

    // Create new code
    await ctx.prisma.emailVerificationCode.create({
      data: {
        code,
        email: ctx.currentObserver.email,
        observerId: ctx.currentObserver.id,
        expiresAt,
      },
    });

    // Send email
    await sendEmailVerificationEmail(
      ctx.currentObserver.email,
      code,
      ctx.currentObserver.displayName
    );

    return true;
  },

  /**
   * Verify email using 8-digit code
   */
  async verifyEmail(
    _: unknown,
    { code }: { code: string },
    ctx: GraphQLContext
  ) {
    // Must be logged in
    if (!ctx.currentObserver) {
      throwAuthError('You must be logged in');
    }

    // Validate code format (8 digits)
    if (!/^\d{8}$/.test(code)) {
      throwValidationError('Invalid verification code format');
    }

    // Find verification code for this observer (match current email for defense in depth)
    const verificationCode = await ctx.prisma.emailVerificationCode.findFirst({
      where: {
        observerId: ctx.currentObserver.id,
        email: ctx.currentObserver.email ?? '',
        used: false,
      },
      include: { observer: true },
    });

    const invalidError = 'Invalid or expired verification code';

    if (!verificationCode) {
      throwValidationError(invalidError);
    }

    // Check max attempts
    if (verificationCode.attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      // Delete the code after too many attempts
      await ctx.prisma.emailVerificationCode.delete({
        where: { id: verificationCode.id },
      });
      throwValidationError('Too many failed attempts. Please request a new code.');
    }

    // Check if expired
    if (verificationCode.expiresAt < new Date()) {
      await ctx.prisma.emailVerificationCode.delete({
        where: { id: verificationCode.id },
      });
      throwValidationError('Verification code has expired. Please request a new code.');
    }

    // Check if code matches (SEC-015: constant-time comparison)
    const codeMatches = verificationCode.code.length === code.length &&
      crypto.timingSafeEqual(Buffer.from(verificationCode.code), Buffer.from(code));
    if (!codeMatches) {
      // Increment attempts
      await ctx.prisma.emailVerificationCode.update({
        where: { id: verificationCode.id },
        data: { attempts: { increment: 1 } },
      });
      const remainingAttempts = EMAIL_VERIFICATION_MAX_ATTEMPTS - verificationCode.attempts - 1;
      throwValidationError(
        `Invalid code. ${remainingAttempts} attempt${remainingAttempts !== 1 ? 's' : ''} remaining.`
      );
    }

    // Code is valid - verify email and delete code
    await ctx.prisma.$transaction([
      ctx.prisma.humanObserver.update({
        where: { id: verificationCode.observerId },
        data: { emailVerified: true },
      }),
      ctx.prisma.emailVerificationCode.delete({
        where: { id: verificationCode.id },
      }),
    ]);

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const observerFieldResolvers = {
  HumanObserver: {
    /**
     * Get agents linked to this observer's Twitter handle.
     * Email-only observers (open registration) have no Twitter handle — no linked agents.
     */
    async linkedAgents(observer: HumanObserver, _: unknown, ctx: GraphQLContext) {
      if (!observer.twitterHandle) return [];

      return ctx.prisma.agent.findMany({
        where: {
          twitterHandle: observer.twitterHandle,
          claimed: true,
        },
      });
    },

    /**
     * Whether the observer has completed account setup (has email and password)
     */
    hasAccountSetup(observer: HumanObserver): boolean {
      return !!observer.email && !!observer.passwordHash;
    },

    /**
     * Whether the observer's email has been verified
     */
    emailVerified(observer: HumanObserver): boolean {
      return observer.emailVerified;
    },

    /**
     * Whether the observer is an admin (based on ADMIN_OBSERVER_IDS env var)
     * Only visible on own profile for security
     */
    isAdmin(observer: HumanObserver, _: unknown, ctx: GraphQLContext): boolean | null {
      // Only expose admin status on own profile
      if (!ctx.currentObserver || ctx.currentObserver.id !== observer.id) {
        return null;
      }
      return isObserverAdmin(observer.id);
    },
  },
};
