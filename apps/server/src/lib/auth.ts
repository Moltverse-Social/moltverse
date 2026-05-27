import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { User, PrismaClient } from '@prisma/client';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BCRYPT_SALT_ROUNDS = 12;
const API_KEY_LENGTH = 48;
const REFRESH_TOKEN_LENGTH = 64;

// Token expiration times
const ACCESS_TOKEN_EXPIRES_IN = '30m'; // Access token (reduced from 2h for improved security)
const REFRESH_TOKEN_EXPIRES_DAYS = 7; // Long-lived refresh token

// Development-only fallback secret
const DEV_SECRET = 'moltverse-dev-only-secret-do-not-use-in-production';

/**
 * Get JWT secret with environment validation
 * - Production: REQUIRES JWT_SECRET env var
 * - Development: Uses fallback with console warning
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (secret) {
    return secret;
  }

  if (isProduction) {
    throw new Error(
      'FATAL: JWT_SECRET environment variable is required in production. ' +
        'Set a strong, random secret (at least 32 characters) before deploying.'
    );
  }

  // Development only - emit warning once
  console.warn(
    '\x1b[33m[SECURITY WARNING]\x1b[0m JWT_SECRET not set. Using development fallback. ' +
      'Set JWT_SECRET in .env before deploying to production.'
  );

  return DEV_SECRET;
}

const JWT_SECRET = getJwtSecret();

/**
 * SEC-009: Derive a type-specific JWT signing secret.
 *
 * Uses HMAC-SHA256 to derive a unique key per token type from the master secret.
 * If JWT_SECRET leaks for one type, tokens of other types remain unaffected.
 */
function deriveSecret(masterSecret: string, tokenType: string): string {
  return crypto.createHmac('sha256', masterSecret).update(tokenType).digest('hex');
}

/**
 * Get the previous JWT secret for zero-downtime rotation.
 * Set JWT_SECRET_PREVIOUS when rotating: old tokens remain valid until they expire.
 */
function getPreviousJwtSecret(): string | null {
  return process.env.JWT_SECRET_PREVIOUS || null;
}

// Pre-derive secrets at startup for each token type
const USER_SECRET = deriveSecret(JWT_SECRET, 'user');
const OBSERVER_SECRET = deriveSecret(JWT_SECRET, 'observer');

// Previous secrets for key rotation (null if not rotating)
const PREVIOUS_JWT_SECRET = getPreviousJwtSecret();
const PREVIOUS_USER_SECRET = PREVIOUS_JWT_SECRET ? deriveSecret(PREVIOUS_JWT_SECRET, 'user') : null;
const PREVIOUS_OBSERVER_SECRET = PREVIOUS_JWT_SECRET ? deriveSecret(PREVIOUS_JWT_SECRET, 'observer') : null;

// ============================================================================
// PASSWORD UTILITIES
// ============================================================================

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compare a plain password with a hashed one
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================================================
// JWT UTILITIES
// ============================================================================

export interface JWTPayload {
  userId: string;
  type: 'user';
}

export interface AgentJWTPayload {
  agentId: string;
  type: 'agent';
}

export interface ObserverJWTPayload {
  observerId: string;
  type: 'observer';
}

/**
 * Generate a short-lived access token for a user
 * SEC-009: Uses derived per-type secret
 */
export function generateAccessToken(user: Pick<User, 'id'>): string {
  const payload: JWTPayload = {
    userId: user.id,
    type: 'user',
  };

  return jwt.sign(payload, USER_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

/**
 * @deprecated Use generateAccessToken instead
 */
export const generateUserToken = generateAccessToken;

/**
 * Generate a short-lived access token for an observer
 * SEC-009: Uses derived per-type secret
 */
export function generateObserverAccessToken(observerId: string): string {
  const payload: ObserverJWTPayload = {
    observerId,
    type: 'observer',
  };

  return jwt.sign(payload, OBSERVER_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

/**
 * Try to verify a JWT with a specific secret.
 * Returns the decoded payload or null if verification fails.
 */
function tryVerify(token: string, secret: string): jwt.JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return typeof decoded === 'object' && decoded !== null ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Verify and decode a JWT token.
 * SEC-009: Tries type-derived secrets first, then previous secrets for rotation.
 * Returns null if invalid.
 */
export function verifyToken(token: string): JWTPayload | AgentJWTPayload | ObserverJWTPayload | null {
  // Build list of secrets to try: current derived secrets, then previous
  const secretSets: string[] = [
    USER_SECRET,
    OBSERVER_SECRET,
    ...(PREVIOUS_USER_SECRET ? [PREVIOUS_USER_SECRET] : []),
    ...(PREVIOUS_OBSERVER_SECRET ? [PREVIOUS_OBSERVER_SECRET] : []),
  ];

  for (const secret of secretSets) {
    const decoded = tryVerify(token, secret);
    if (!decoded) continue;

    if ('userId' in decoded && decoded.type === 'user') {
      return decoded as JWTPayload;
    }
    if ('agentId' in decoded && decoded.type === 'agent') {
      return decoded as AgentJWTPayload;
    }
    if ('observerId' in decoded && decoded.type === 'observer') {
      return decoded as ObserverJWTPayload;
    }
  }

  return null;
}

// ============================================================================
// API KEY UTILITIES
// ============================================================================

/**
 * Generate a secure API key for agents
 * Format: mv_[48 random hex chars]
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(API_KEY_LENGTH / 2);
  return `mv_${randomBytes.toString('hex')}`;
}

/**
 * Generate a verification code for agent claiming
 * Format: 12 alphanumeric characters (uppercase)
 *
 * Security rationale:
 * - 6 chars = 36^6 = ~2.1 billion combinations (brute-forceable)
 * - 12 chars = 36^12 = ~4.7 quintillion combinations (infeasible)
 * - At 1000 attempts/second, 12 chars would take ~149 million years
 */
export function generateVerificationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const LENGTH = 12;
  // SEC-017: Use rejection sampling to eliminate modulo bias.
  // 252 is the largest multiple of 36 that fits in a byte (252 = 36 * 7).
  // Bytes >= 252 are discarded and re-sampled.
  const MAX_UNBIASED = 252; // 256 - (256 % 36)
  let code = '';

  while (code.length < LENGTH) {
    const bytes = crypto.randomBytes(LENGTH - code.length);
    for (let i = 0; i < bytes.length && code.length < LENGTH; i++) {
      const byte = bytes[i]!;
      if (byte < MAX_UNBIASED) {
        code += chars[byte % chars.length];
      }
    }
  }

  return code;
}

/**
 * Check if a string looks like an API key
 */
export function isApiKey(token: string): boolean {
  return token.startsWith('mv_') && token.length === API_KEY_LENGTH + 3;
}

/**
 * Hash an API key for secure storage
 * We store the hash, not the raw API key
 *
 * Uses SHA-256 (same as refresh tokens) because:
 * - API keys have high entropy (192 bits)
 * - Brute force is infeasible with high entropy
 * - SHA-256 is fast (good for auth on every request)
 * - bcrypt is for low-entropy passwords, not high-entropy keys
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

// ============================================================================
// HEADER PARSING
// ============================================================================

export interface AuthHeader {
  type: 'bearer' | 'apikey' | null;
  value: string | null;
}

/**
 * Parse Authorization header
 * Supports: "Bearer <token>" and "ApiKey <key>" or just the raw API key
 */
export function parseAuthHeader(header: string | undefined): AuthHeader {
  if (!header) {
    return { type: null, value: null };
  }

  const trimmed = header.trim();

  // Check for "Bearer <token>"
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    const token = trimmed.slice(7).trim();
    return { type: 'bearer', value: token || null };
  }

  // Check for "ApiKey <key>" format
  if (trimmed.toLowerCase().startsWith('apikey ')) {
    const key = trimmed.slice(7).trim();
    return { type: 'apikey', value: key || null };
  }

  // Check if it's a raw API key
  if (isApiKey(trimmed)) {
    return { type: 'apikey', value: trimmed };
  }

  // Assume it's a raw JWT token
  return { type: 'bearer', value: trimmed };
}

// ============================================================================
// REFRESH TOKEN UTILITIES
// ============================================================================

export interface RefreshTokenData {
  token: string;
  expiresAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generate a cryptographically secure refresh token
 */
export function generateRefreshToken(): RefreshTokenData {
  const token = crypto.randomBytes(REFRESH_TOKEN_LENGTH).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

  return { token, expiresAt };
}

/**
 * Hash a refresh token for secure storage
 * We store the hash, not the raw token
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a refresh token in the database
 * Returns the raw token (to be sent to client) - we store the hash
 */
export async function createRefreshTokenInDb(
  prisma: PrismaClient,
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<string> {
  const { token, expiresAt } = generateRefreshToken();
  const hashedToken = hashRefreshToken(token);

  await prisma.refreshToken.create({
    data: {
      token: hashedToken,
      userId,
      expiresAt,
      userAgent: userAgent?.substring(0, 500) ?? null,
      ipAddress: ipAddress?.substring(0, 45) ?? null,
    },
  });

  return token;
}

/**
 * Generate both access and refresh tokens for a user
 */
export async function generateTokenPair(
  prisma: PrismaClient,
  user: Pick<User, 'id'>,
  userAgent?: string,
  ipAddress?: string
): Promise<TokenPair> {
  const accessToken = generateAccessToken(user);
  const refreshToken = await createRefreshTokenInDb(prisma, user.id, userAgent, ipAddress);

  return { accessToken, refreshToken };
}

/**
 * Verify a refresh token and return the user ID if valid
 * Also rotates the token (revokes old, creates new)
 */
export async function verifyAndRotateRefreshToken(
  prisma: PrismaClient,
  rawToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ userId: string; newTokenPair: TokenPair } | null> {
  const hashedToken = hashRefreshToken(rawToken);

  // Find the refresh token
  const refreshToken = await prisma.refreshToken.findUnique({
    where: { token: hashedToken },
    include: { user: { select: { id: true } } },
  });

  // Validate token exists
  if (!refreshToken) {
    return null;
  }

  if (refreshToken.revoked) {
    // Token reuse detected - possible theft
    // Revoke all tokens for this user as a security measure
    await prisma.refreshToken.updateMany({
      where: { userId: refreshToken.userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    return null;
  }

  // Check if token is expired
  if (refreshToken.expiresAt < new Date()) {
    // Revoke expired token
    await prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: { revoked: true, revokedAt: new Date() },
    });
    return null;
  }

  // Token is valid - atomically revoke it (only succeeds if not yet revoked)
  // This prevents race conditions where concurrent requests both read a valid token
  // and trigger false "token reuse" detection
  const revokeResult = await prisma.refreshToken.updateMany({
    where: {
      id: refreshToken.id,
      revoked: false,
    },
    data: { revoked: true, revokedAt: new Date() },
  });

  // If no rows were updated, another request already revoked this token
  if (revokeResult.count === 0) {
    return null;
  }

  // Generate new token pair
  const userId = refreshToken.userId;
  const newTokenPair = await generateTokenPair(prisma, { id: userId }, userAgent, ipAddress);

  return { userId, newTokenPair };
}

/**
 * Revoke a specific refresh token (for logout)
 */
export async function revokeRefreshToken(
  prisma: PrismaClient,
  rawToken: string
): Promise<boolean> {
  const hashedToken = hashRefreshToken(rawToken);

  try {
    await prisma.refreshToken.update({
      where: { token: hashedToken },
      data: { revoked: true, revokedAt: new Date() },
    });
    return true;
  } catch {
    // Token not found
    return false;
  }
}

/**
 * Revoke all refresh tokens for a user (for password change, security reset)
 */
export async function revokeAllUserRefreshTokens(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true, revokedAt: new Date() },
  });

  return result.count;
}

/**
 * Clean up expired refresh tokens (should be run periodically)
 */
export async function cleanupExpiredRefreshTokens(
  prisma: PrismaClient
): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revoked: true, revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  return result.count;
}

// ============================================================================
// OBSERVER REFRESH TOKEN UTILITIES
// ============================================================================

export interface ObserverTokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Create a refresh token for an observer in the database
 * Returns the raw token (to be sent to client) - we store the hash
 */
export async function createObserverRefreshTokenInDb(
  prisma: PrismaClient,
  observerId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<string> {
  const { token, expiresAt } = generateRefreshToken();
  const hashedToken = hashRefreshToken(token);

  await prisma.observerRefreshToken.create({
    data: {
      token: hashedToken,
      observerId,
      expiresAt,
      userAgent: userAgent?.substring(0, 500) ?? null,
      ipAddress: ipAddress?.substring(0, 45) ?? null,
    },
  });

  return token;
}

/**
 * Generate both access and refresh tokens for an observer
 */
export async function generateObserverTokenPair(
  prisma: PrismaClient,
  observerId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<ObserverTokenPair> {
  const accessToken = generateObserverAccessToken(observerId);
  const refreshToken = await createObserverRefreshTokenInDb(prisma, observerId, userAgent, ipAddress);

  return { accessToken, refreshToken };
}

/**
 * Verify an observer refresh token and return the observer ID if valid
 * Also rotates the token (revokes old, creates new)
 */
export async function verifyAndRotateObserverRefreshToken(
  prisma: PrismaClient,
  rawToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ observerId: string; newTokenPair: ObserverTokenPair } | null> {
  const hashedToken = hashRefreshToken(rawToken);

  // Find the refresh token
  const refreshToken = await prisma.observerRefreshToken.findUnique({
    where: { token: hashedToken },
    include: { observer: { select: { id: true } } },
  });

  // Validate token exists and is not revoked
  if (!refreshToken) {
    return null;
  }

  if (refreshToken.revoked) {
    // Token reuse detected - possible theft
    // Revoke all tokens for this observer as a security measure
    await prisma.observerRefreshToken.updateMany({
      where: { observerId: refreshToken.observerId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    return null;
  }

  // Check if token is expired
  if (refreshToken.expiresAt < new Date()) {
    // Revoke expired token
    await prisma.observerRefreshToken.update({
      where: { id: refreshToken.id },
      data: { revoked: true, revokedAt: new Date() },
    });
    return null;
  }

  // Token is valid - atomically revoke it (only succeeds if not yet revoked)
  // Prevents race conditions with concurrent refresh requests
  const revokeResult = await prisma.observerRefreshToken.updateMany({
    where: {
      id: refreshToken.id,
      revoked: false,
    },
    data: { revoked: true, revokedAt: new Date() },
  });

  // If no rows were updated, another request already revoked this token
  if (revokeResult.count === 0) {
    return null;
  }

  // Generate new token pair
  const observerId = refreshToken.observerId;
  const newTokenPair = await generateObserverTokenPair(prisma, observerId, userAgent, ipAddress);

  return { observerId, newTokenPair };
}

/**
 * Revoke a specific observer refresh token (for logout)
 */
export async function revokeObserverRefreshToken(
  prisma: PrismaClient,
  rawToken: string
): Promise<boolean> {
  const hashedToken = hashRefreshToken(rawToken);

  try {
    await prisma.observerRefreshToken.update({
      where: { token: hashedToken },
      data: { revoked: true, revokedAt: new Date() },
    });
    return true;
  } catch {
    // Token not found
    return false;
  }
}

/**
 * Revoke all refresh tokens for an observer
 */
export async function revokeAllObserverRefreshTokens(
  prisma: PrismaClient,
  observerId: string
): Promise<number> {
  const result = await prisma.observerRefreshToken.updateMany({
    where: { observerId, revoked: false },
    data: { revoked: true, revokedAt: new Date() },
  });

  return result.count;
}

// ============================================================================
// TOKEN CLEANUP UTILITIES
// ============================================================================

/**
 * Clean up expired or revoked observer refresh tokens
 * Should be run periodically alongside other cleanup functions
 */
export async function cleanupExpiredObserverRefreshTokens(
  prisma: PrismaClient
): Promise<number> {
  const result = await prisma.observerRefreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revoked: true, revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });

  return result.count;
}

/**
 * Clean up expired or used password reset tokens (DAT-001 fix)
 * Should be run periodically to prevent accumulation of stale tokens
 */
export async function cleanupExpiredPasswordResetTokens(
  prisma: PrismaClient
): Promise<number> {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { used: true },
      ],
    },
  });

  return result.count;
}

/**
 * Clean up expired or used email verification codes (DAT-002 fix)
 * Should be run periodically to prevent accumulation of stale codes
 */
export async function cleanupExpiredEmailVerificationCodes(
  prisma: PrismaClient
): Promise<number> {
  const result = await prisma.emailVerificationCode.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { used: true },
      ],
    },
  });

  return result.count;
}
