/**
 * Authentication tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma } from './setup.js';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyToken,
  generateApiKey,
  isApiKey,
  hashApiKey,
  generateVerificationCode,
  generateRefreshToken,
  hashRefreshToken,
  createRefreshTokenInDb,
  verifyAndRotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from '../lib/auth.js';
import { createTestUser } from './helpers/index.js';

describe('Password utilities', () => {
  it('should hash a password', async () => {
    const password = 'Test123456';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true); // bcrypt hash prefix
  });

  it('should verify correct password', async () => {
    const password = 'Test123456';
    const hash = await hashPassword(password);
    const isValid = await comparePassword(password, hash);

    expect(isValid).toBe(true);
  });

  it('should reject wrong password', async () => {
    const password = 'Test123456';
    const hash = await hashPassword(password);
    const isValid = await comparePassword('WrongPassword', hash);

    expect(isValid).toBe(false);
  });
});

describe('JWT utilities', () => {
  it('should generate access token for user', () => {
    const token = generateAccessToken({ id: 'test-user-id' });

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3); // JWT has 3 parts
  });

  it('should verify valid token', () => {
    const userId = 'test-user-id';
    const token = generateAccessToken({ id: userId });
    const payload = verifyToken(token);

    expect(payload).toBeDefined();
    expect(payload?.type).toBe('user');
    expect((payload as { userId: string }).userId).toBe(userId);
  });

  it('should return null for invalid token', () => {
    const payload = verifyToken('invalid.token.here');

    expect(payload).toBeNull();
  });

  it('should return null for empty token', () => {
    const payload = verifyToken('');

    expect(payload).toBeNull();
  });
});

describe('API Key utilities', () => {
  it('should generate API key with correct format', () => {
    const apiKey = generateApiKey();

    expect(apiKey).toBeDefined();
    expect(apiKey.startsWith('mv_')).toBe(true);
    expect(apiKey.length).toBe(51); // mv_ + 48 chars
  });

  it('should identify valid API key', () => {
    const apiKey = generateApiKey();

    expect(isApiKey(apiKey)).toBe(true);
  });

  it('should reject invalid API key', () => {
    expect(isApiKey('invalid-key')).toBe(false);
    expect(isApiKey('mv_short')).toBe(false);
    expect(isApiKey('')).toBe(false);
  });

  it('should hash API key deterministically', () => {
    const apiKey = generateApiKey();
    const hash1 = hashApiKey(apiKey);
    const hash2 = hashApiKey(apiKey);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different API keys', () => {
    const apiKey1 = generateApiKey();
    const apiKey2 = generateApiKey();
    const hash1 = hashApiKey(apiKey1);
    const hash2 = hashApiKey(apiKey2);

    expect(hash1).not.toBe(hash2);
  });

  it('should produce 64-char hex hash', () => {
    const apiKey = generateApiKey();
    const hash = hashApiKey(apiKey);

    expect(hash).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });
});

describe('Verification code utilities', () => {
  it('should generate 12 character verification code', () => {
    const code = generateVerificationCode();

    expect(code).toBeDefined();
    expect(code.length).toBe(12);
    expect(/^[A-Z0-9]+$/.test(code)).toBe(true);
  });
});

describe('Refresh token utilities', () => {
  it('should generate refresh token with expiration', () => {
    const { token, expiresAt } = generateRefreshToken();

    expect(token).toBeDefined();
    expect(token.length).toBe(128); // 64 bytes = 128 hex chars
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should hash refresh token deterministically', () => {
    const token = 'test-token-value';
    const hash1 = hashRefreshToken(token);
    const hash2 = hashRefreshToken(token);

    expect(hash1).toBe(hash2);
  });
});

describe('Refresh token database operations', () => {
  beforeEach(async () => {
    await testPrisma.refreshToken.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should create refresh token in database', async () => {
    const { user } = await createTestUser();
    const token = await createRefreshTokenInDb(testPrisma, user.id);

    expect(token).toBeDefined();
    expect(token.length).toBe(128);

    // Token should be stored as hash
    const stored = await testPrisma.refreshToken.findFirst({
      where: { userId: user.id },
    });
    expect(stored).toBeDefined();
    expect(stored?.token).not.toBe(token); // Stored value is hashed
  });

  it('should verify and rotate refresh token', async () => {
    const { user } = await createTestUser();
    const originalToken = await createRefreshTokenInDb(testPrisma, user.id);

    const result = await verifyAndRotateRefreshToken(testPrisma, originalToken);

    expect(result).toBeDefined();
    expect(result?.userId).toBe(user.id);
    expect(result?.newTokenPair.accessToken).toBeDefined();
    expect(result?.newTokenPair.refreshToken).toBeDefined();
    expect(result?.newTokenPair.refreshToken).not.toBe(originalToken);

    // Original token should be revoked
    const originalInDb = await testPrisma.refreshToken.findFirst({
      where: { token: hashRefreshToken(originalToken) },
    });
    expect(originalInDb?.revoked).toBe(true);
  });

  it('should return null for invalid refresh token', async () => {
    const result = await verifyAndRotateRefreshToken(testPrisma, 'invalid-token');

    expect(result).toBeNull();
  });

  it('should revoke refresh token', async () => {
    const { user } = await createTestUser();
    const token = await createRefreshTokenInDb(testPrisma, user.id);

    const revoked = await revokeRefreshToken(testPrisma, token);

    expect(revoked).toBe(true);

    // Token should be marked as revoked
    const stored = await testPrisma.refreshToken.findFirst({
      where: { token: hashRefreshToken(token) },
    });
    expect(stored?.revoked).toBe(true);
  });

  it('should revoke all user refresh tokens', async () => {
    const { user } = await createTestUser();

    // Create multiple tokens
    await createRefreshTokenInDb(testPrisma, user.id);
    await createRefreshTokenInDb(testPrisma, user.id);
    await createRefreshTokenInDb(testPrisma, user.id);

    const count = await revokeAllUserRefreshTokens(testPrisma, user.id);

    expect(count).toBe(3);

    // All tokens should be revoked
    const tokens = await testPrisma.refreshToken.findMany({
      where: { userId: user.id },
    });
    expect(tokens.every((t) => t.revoked)).toBe(true);
  });
});
