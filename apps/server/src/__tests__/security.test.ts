/**
 * Security feature tests
 *
 * Tests for:
 * - Login lockout (brute force protection)
 * - Email verification tokens
 * - Password policy (special character requirement)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testPrisma } from './setup.js';
import {
  createTestObserver,
  createTestObserverWithLockout,
  createTestEmailVerificationCode,
} from './helpers/index.js';
import {
  isAccountLocked,
  getLockoutRemainingSeconds,
  recordFailedLoginAttempt,
  clearLoginAttempts,
  getLockoutDurationMinutes,
} from '../lib/loginAttempts.js';
import { password as passwordSchema } from '../lib/validation.js';

// Mock the prisma singleton so getUserFromToken/getObserverFromToken use testPrisma.
// vi.mock is hoisted above static imports, so we use an async factory with a
// dynamic ESM import (vitest transforms `./setup.js` to the .ts source).
vi.mock('../lib/prisma.js', async () => {
  const { testPrisma: tp } = await import('./setup.js');
  return { prisma: tp };
});

// ============================================================================
// LOGIN LOCKOUT TESTS
// ============================================================================

describe('Login lockout - isAccountLocked', () => {
  beforeEach(async () => {
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should return false when lockedUntil is null', async () => {
    const { observer } = await createTestObserver({
      email: 'notlocked@example.com',
      password: 'Test1234!',
    });

    expect(isAccountLocked(observer)).toBe(false);
  });

  it('should return false when lockedUntil is in the past', async () => {
    const pastDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    const { observer } = await createTestObserverWithLockout({
      email: 'expired@example.com',
      password: 'Test1234!',
      lockedUntil: pastDate,
    });

    expect(isAccountLocked(observer)).toBe(false);
  });

  it('should return true when lockedUntil is in the future', async () => {
    const futureDate = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
    const { observer } = await createTestObserverWithLockout({
      email: 'locked@example.com',
      password: 'Test1234!',
      lockedUntil: futureDate,
    });

    expect(isAccountLocked(observer)).toBe(true);
  });
});

describe('Login lockout - getLockoutRemainingSeconds', () => {
  beforeEach(async () => {
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should return 0 when lockedUntil is null', async () => {
    const { observer } = await createTestObserver({
      email: 'nolock@example.com',
      password: 'Test1234!',
    });

    expect(getLockoutRemainingSeconds(observer)).toBe(0);
  });

  it('should return 0 when lockedUntil is in the past', async () => {
    const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute ago
    const { observer } = await createTestObserverWithLockout({
      email: 'pastlock@example.com',
      password: 'Test1234!',
      lockedUntil: pastDate,
    });

    expect(getLockoutRemainingSeconds(observer)).toBe(0);
  });

  it('should return positive seconds when lockedUntil is in the future', async () => {
    const futureDate = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
    const { observer } = await createTestObserverWithLockout({
      email: 'futurelock@example.com',
      password: 'Test1234!',
      lockedUntil: futureDate,
    });

    const remaining = getLockoutRemainingSeconds(observer);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(5 * 60);
  });
});

describe('Login lockout - recordFailedLoginAttempt', () => {
  beforeEach(async () => {
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should increment login attempts on first failure', async () => {
    const { observer } = await createTestObserver({
      email: 'first@example.com',
      password: 'Test1234!',
    });

    const result = await recordFailedLoginAttempt(testPrisma, observer.id);

    expect(result.locked).toBe(false);
    expect(result.attemptsRemaining).toBe(4); // 5 max - 1 attempt = 4 remaining

    const updated = await testPrisma.humanObserver.findUnique({
      where: { id: observer.id },
    });
    expect(updated?.loginAttempts).toBe(1);
    expect(updated?.lastFailedLogin).not.toBeNull();
  });

  it('should increment attempts for subsequent failures', async () => {
    const { observer } = await createTestObserverWithLockout({
      email: 'multi@example.com',
      password: 'Test1234!',
      loginAttempts: 3,
      lastFailedLogin: new Date(),
    });

    const result = await recordFailedLoginAttempt(testPrisma, observer.id);

    expect(result.locked).toBe(false);
    expect(result.attemptsRemaining).toBe(1); // 5 max - 4 attempts = 1 remaining

    const updated = await testPrisma.humanObserver.findUnique({
      where: { id: observer.id },
    });
    expect(updated?.loginAttempts).toBe(4);
  });

  it('should lock account after 5 failed attempts', async () => {
    const { observer } = await createTestObserverWithLockout({
      email: 'lockme@example.com',
      password: 'Test1234!',
      loginAttempts: 4,
      lastFailedLogin: new Date(),
    });

    const result = await recordFailedLoginAttempt(testPrisma, observer.id);

    expect(result.locked).toBe(true);
    expect(result.attemptsRemaining).toBe(0);

    const updated = await testPrisma.humanObserver.findUnique({
      where: { id: observer.id },
    });
    expect(updated?.loginAttempts).toBe(5);
    expect(updated?.lockedUntil).not.toBeNull();
    expect(updated?.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('should reset attempts if last failure was too long ago', async () => {
    const oldDate = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago (> 15 min lockout)
    const { observer } = await createTestObserverWithLockout({
      email: 'reset@example.com',
      password: 'Test1234!',
      loginAttempts: 4,
      lastFailedLogin: oldDate,
    });

    const result = await recordFailedLoginAttempt(testPrisma, observer.id);

    expect(result.locked).toBe(false);
    expect(result.attemptsRemaining).toBe(4); // Reset to 1, so 4 remaining

    const updated = await testPrisma.humanObserver.findUnique({
      where: { id: observer.id },
    });
    expect(updated?.loginAttempts).toBe(1); // Reset to 1
  });

  it('should return default values for non-existent observer', async () => {
    const result = await recordFailedLoginAttempt(
      testPrisma,
      '00000000-0000-0000-0000-000000000000'
    );

    expect(result.locked).toBe(false);
    expect(result.attemptsRemaining).toBe(5);
  });
});

describe('Login lockout - clearLoginAttempts', () => {
  beforeEach(async () => {
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should clear all lockout fields on successful login', async () => {
    const futureDate = new Date(Date.now() + 15 * 60 * 1000);
    const { observer } = await createTestObserverWithLockout({
      email: 'clearme@example.com',
      password: 'Test1234!',
      loginAttempts: 5,
      lastFailedLogin: new Date(),
      lockedUntil: futureDate,
    });

    await clearLoginAttempts(testPrisma, observer.id);

    const updated = await testPrisma.humanObserver.findUnique({
      where: { id: observer.id },
    });
    expect(updated?.loginAttempts).toBe(0);
    expect(updated?.lastFailedLogin).toBeNull();
    expect(updated?.lockedUntil).toBeNull();
  });
});

describe('Login lockout - getLockoutDurationMinutes', () => {
  it('should return 15 minutes', () => {
    expect(getLockoutDurationMinutes()).toBe(15);
  });
});

// ============================================================================
// EMAIL VERIFICATION CODE TESTS
// ============================================================================

describe('Email verification codes', () => {
  beforeEach(async () => {
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should create 8-digit email verification code', async () => {
    const email = 'verify@example.com';
    const { observer } = await createTestObserver({ email, password: 'Test1234!' });
    const { verificationCode, code } = await createTestEmailVerificationCode(
      observer.id,
      email
    );

    expect(verificationCode).toBeDefined();
    expect(verificationCode.observerId).toBe(observer.id);
    expect(verificationCode.email).toBe(email);
    expect(verificationCode.used).toBe(false);
    expect(verificationCode.attempts).toBe(0);
    expect(verificationCode.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Code should be 8 digits (security enhancement from 6 digits)
    expect(code).toMatch(/^\d{8}$/);
    expect(verificationCode.code).toBe(code);
  });

  it('should find code by observer and code', async () => {
    const email = 'findcode@example.com';
    const { observer } = await createTestObserver({ email, password: 'Test1234!' });
    const { code } = await createTestEmailVerificationCode(observer.id, email);

    const foundCode = await testPrisma.emailVerificationCode.findFirst({
      where: { observerId: observer.id, code },
    });

    expect(foundCode).toBeDefined();
    expect(foundCode?.observerId).toBe(observer.id);
  });

  it('should track failed attempts', async () => {
    const email = 'attempts@example.com';
    const { observer } = await createTestObserver({ email, password: 'Test1234!' });
    const { verificationCode } = await createTestEmailVerificationCode(observer.id, email);

    // Increment attempts
    await testPrisma.emailVerificationCode.update({
      where: { id: verificationCode.id },
      data: { attempts: { increment: 1 } },
    });

    const updated = await testPrisma.emailVerificationCode.findUnique({
      where: { id: verificationCode.id },
    });
    expect(updated?.attempts).toBe(1);
  });

  it('should detect expired code', async () => {
    const email = 'expiredcode@example.com';
    const { observer } = await createTestObserver({ email, password: 'Test1234!' });
    const { verificationCode } = await createTestEmailVerificationCode(observer.id, email, {
      expiresInMinutes: -1, // Already expired
    });

    expect(verificationCode.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('should verify email when code is valid', async () => {
    const email = 'verifyemail@example.com';
    const { observer } = await createTestObserver({ email, password: 'Test1234!' });
    const { verificationCode } = await createTestEmailVerificationCode(observer.id, email);

    // Verify email and delete code
    await testPrisma.$transaction([
      testPrisma.humanObserver.update({
        where: { id: observer.id },
        data: { emailVerified: true },
      }),
      testPrisma.emailVerificationCode.delete({
        where: { id: verificationCode.id },
      }),
    ]);

    const updatedObserver = await testPrisma.humanObserver.findUnique({
      where: { id: observer.id },
    });
    expect(updatedObserver?.emailVerified).toBe(true);

    const deletedCode = await testPrisma.emailVerificationCode.findUnique({
      where: { id: verificationCode.id },
    });
    expect(deletedCode).toBeNull();
  });

  it('should delete old codes when creating new one', async () => {
    const email = 'multicode@example.com';
    const { observer } = await createTestObserver({ email, password: 'Test1234!' });

    // Create first code
    await createTestEmailVerificationCode(observer.id, email);

    const countBefore = await testPrisma.emailVerificationCode.count({
      where: { observerId: observer.id },
    });
    expect(countBefore).toBe(1);

    // Delete old codes and create new one (simulating sendEmailVerification behavior)
    await testPrisma.emailVerificationCode.deleteMany({
      where: { observerId: observer.id },
    });
    await createTestEmailVerificationCode(observer.id, email);

    const countAfter = await testPrisma.emailVerificationCode.count({
      where: { observerId: observer.id },
    });
    expect(countAfter).toBe(1);
  });
});

describe('Email verification - emailVerified field', () => {
  beforeEach(async () => {
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should default to false for new observer', async () => {
    const { observer } = await createTestObserver({
      email: 'newuser@example.com',
      password: 'Test1234!',
    });

    expect(observer.emailVerified).toBe(false);
  });

  it('should be true after verification', async () => {
    const { observer } = await createTestObserver({
      email: 'toverify@example.com',
      password: 'Test1234!',
    });

    await testPrisma.humanObserver.update({
      where: { id: observer.id },
      data: { emailVerified: true },
    });

    const updated = await testPrisma.humanObserver.findUnique({
      where: { id: observer.id },
    });
    expect(updated?.emailVerified).toBe(true);
  });
});

// ============================================================================
// PASSWORD POLICY TESTS
// ============================================================================

describe('Password policy - special character requirement', () => {
  it('should reject password without special character', () => {
    const result = passwordSchema.safeParse('Test1234');
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.errors.map((e) => e.message);
      expect(errors).toContain('Password must contain at least one special character');
    }
  });

  it('should accept password with special character', () => {
    const validPasswords = [
      'Test1234!',
      'Test1234@',
      'Test1234#',
      'Test1234$',
      'Test1234%',
      'Test1234^',
      'Test1234&',
      'Test1234*',
      'Test1234(',
      'Test1234)',
      'Test1234-',
      'Test1234_',
      'Test1234=',
      'Test1234+',
      'Test1234[',
      'Test1234]',
      'Test1234{',
      'Test1234}',
      'Test1234|',
      'Test1234\\',
      'Test1234:',
      'Test1234;',
      "Test1234'",
      'Test1234"',
      'Test1234<',
      'Test1234>',
      'Test1234,',
      'Test1234.',
      'Test1234?',
      'Test1234/',
      'Test1234~',
      'Test1234`',
    ];

    for (const password of validPasswords) {
      const result = passwordSchema.safeParse(password);
      expect(result.success).toBe(true);
    }
  });

  it('should still require uppercase letter', () => {
    const result = passwordSchema.safeParse('test1234!');
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.errors.map((e) => e.message);
      expect(errors).toContain('Password must contain at least one uppercase letter');
    }
  });

  it('should still require lowercase letter', () => {
    const result = passwordSchema.safeParse('TEST1234!');
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.errors.map((e) => e.message);
      expect(errors).toContain('Password must contain at least one lowercase letter');
    }
  });

  it('should still require number', () => {
    const result = passwordSchema.safeParse('TestTest!');
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.errors.map((e) => e.message);
      expect(errors).toContain('Password must contain at least one number');
    }
  });

  it('should still require minimum 8 characters', () => {
    const result = passwordSchema.safeParse('Te1!');
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.errors.map((e) => e.message);
      expect(errors).toContain('Password must be at least 8 characters');
    }
  });
});

// ============================================================================
// TOKEN INVALIDATION TESTS
// ============================================================================

import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import { __testExports as contextTestExports } from '../graphql/context.js';

const { getUserFromToken, getObserverFromToken } = contextTestExports;

// JWT secret must match the one in auth.ts
const JWT_SECRET = process.env.JWT_SECRET || 'moltverse-dev-only-secret-do-not-use-in-production';

// SEC-009: auth.ts derives a type-specific signing secret per token type.
// Tests must sign with the SAME derived secrets, otherwise verifyToken rejects.
const USER_SECRET = createHmac('sha256', JWT_SECRET).update('user').digest('hex');
const OBSERVER_SECRET = createHmac('sha256', JWT_SECRET).update('observer').digest('hex');

describe('Token invalidation - getUserFromToken', () => {
  beforeEach(async () => {
    await testPrisma.refreshToken.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('should return user when passwordChangedAt is null', async () => {
    // Create user without passwordChangedAt
    const hashedPassword = await import('../lib/auth.js').then(m => m.hashPassword('Test1234!'));
    const user = await testPrisma.user.create({
      data: {
        email: 'no-password-change@example.com',
        name: 'Test User',
        password: hashedPassword,
        passwordChangedAt: null,
        createdAt: new Date(),
      },
    });

    // Create a token with current iat
    const token = jwt.sign(
      { userId: user.id, type: 'user' },
      USER_SECRET,
      { expiresIn: '30m' }
    );

    const result = await getUserFromToken(token);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(user.id);
  });

  it('should return user when token iat is after passwordChangedAt', async () => {
    // Password was changed 1 hour ago
    const passwordChangedAt = new Date(Date.now() - 60 * 60 * 1000);

    const hashedPassword = await import('../lib/auth.js').then(m => m.hashPassword('Test1234!'));
    const user = await testPrisma.user.create({
      data: {
        email: 'recent-token@example.com',
        name: 'Test User',
        password: hashedPassword,
        passwordChangedAt,
        createdAt: new Date(),
      },
    });

    // Create a token issued NOW (after password change)
    const token = jwt.sign(
      { userId: user.id, type: 'user' },
      USER_SECRET,
      { expiresIn: '30m' }
    );

    const result = await getUserFromToken(token);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(user.id);
  });

  it('should return null when token iat is before passwordChangedAt', async () => {
    // Create user
    const hashedPassword = await import('../lib/auth.js').then(m => m.hashPassword('Test1234!'));
    const user = await testPrisma.user.create({
      data: {
        email: 'old-token@example.com',
        name: 'Test User',
        password: hashedPassword,
        // Password will be changed AFTER token is issued
        passwordChangedAt: null,
        createdAt: new Date(),
      },
    });

    // Create a token issued 2 hours ago
    const twoHoursAgoSeconds = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
    const token = jwt.sign(
      { userId: user.id, type: 'user', iat: twoHoursAgoSeconds },
      USER_SECRET,
      { expiresIn: '24h' } // Long expiry so it doesn't expire
    );

    // Now update user to have passwordChangedAt 1 hour ago (after token was issued)
    const passwordChangedAt = new Date(Date.now() - 60 * 60 * 1000);
    await testPrisma.user.update({
      where: { id: user.id },
      data: { passwordChangedAt },
    });

    // Token should be invalid because it was issued before password change
    const result = await getUserFromToken(token);
    expect(result).toBeNull();
  });

  it('should return null for non-existent user', async () => {
    const token = jwt.sign(
      { userId: '00000000-0000-0000-0000-000000000000', type: 'user' },
      USER_SECRET,
      { expiresIn: '30m' }
    );

    const result = await getUserFromToken(token);
    expect(result).toBeNull();
  });

  it('should return null for invalid token', async () => {
    const result = await getUserFromToken('invalid-token');
    expect(result).toBeNull();
  });

  it('should return null for expired token', async () => {
    const hashedPassword = await import('../lib/auth.js').then(m => m.hashPassword('Test1234!'));
    const user = await testPrisma.user.create({
      data: {
        email: 'expired-token@example.com',
        name: 'Test User',
        password: hashedPassword,
        createdAt: new Date(),
      },
    });

    // Create an expired token
    const token = jwt.sign(
      { userId: user.id, type: 'user' },
      USER_SECRET,
      { expiresIn: '-1h' } // Already expired
    );

    const result = await getUserFromToken(token);
    expect(result).toBeNull();
  });
});

describe('Token invalidation - getObserverFromToken', () => {
  beforeEach(async () => {
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should return observer when passwordChangedAt is null and not locked', async () => {
    const { observer } = await createTestObserver({
      email: 'observer-no-change@example.com',
      password: 'Test1234!',
    });

    const token = jwt.sign(
      { observerId: observer.id, type: 'observer' },
      OBSERVER_SECRET,
      { expiresIn: '30m' }
    );

    const result = await getObserverFromToken(token);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(observer.id);
  });

  it('should return observer when token iat is after passwordChangedAt', async () => {
    // Password was changed 1 hour ago
    const passwordChangedAt = new Date(Date.now() - 60 * 60 * 1000);

    const { observer } = await createTestObserver({
      email: 'observer-recent@example.com',
      password: 'Test1234!',
    });

    // Update to set passwordChangedAt
    await testPrisma.humanObserver.update({
      where: { id: observer.id },
      data: { passwordChangedAt },
    });

    // Create a token issued NOW (after password change)
    const token = jwt.sign(
      { observerId: observer.id, type: 'observer' },
      OBSERVER_SECRET,
      { expiresIn: '30m' }
    );

    const result = await getObserverFromToken(token);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(observer.id);
  });

  it('should return null when token iat is before passwordChangedAt', async () => {
    const { observer } = await createTestObserver({
      email: 'observer-old-token@example.com',
      password: 'Test1234!',
    });

    // Create a token issued 2 hours ago
    const twoHoursAgoSeconds = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
    const token = jwt.sign(
      { observerId: observer.id, type: 'observer', iat: twoHoursAgoSeconds },
      OBSERVER_SECRET,
      { expiresIn: '24h' }
    );

    // Update passwordChangedAt to 1 hour ago (after token was issued)
    const passwordChangedAt = new Date(Date.now() - 60 * 60 * 1000);
    await testPrisma.humanObserver.update({
      where: { id: observer.id },
      data: { passwordChangedAt },
    });

    // Token should be invalid
    const result = await getObserverFromToken(token);
    expect(result).toBeNull();
  });

  it('should return null when observer account is locked', async () => {
    // Create observer with account locked for 15 more minutes
    const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    const { observer } = await createTestObserverWithLockout({
      email: 'observer-locked@example.com',
      password: 'Test1234!',
      lockedUntil,
    });

    // Create a valid token
    const token = jwt.sign(
      { observerId: observer.id, type: 'observer' },
      OBSERVER_SECRET,
      { expiresIn: '30m' }
    );

    // Token should be rejected because account is locked
    const result = await getObserverFromToken(token);
    expect(result).toBeNull();
  });

  it('should return observer when lockout has expired', async () => {
    // Create observer with lockout that expired 1 minute ago
    const lockedUntil = new Date(Date.now() - 60 * 1000);
    const { observer } = await createTestObserverWithLockout({
      email: 'observer-unlocked@example.com',
      password: 'Test1234!',
      lockedUntil,
    });

    // Create a valid token
    const token = jwt.sign(
      { observerId: observer.id, type: 'observer' },
      OBSERVER_SECRET,
      { expiresIn: '30m' }
    );

    // Token should be accepted because lockout has expired
    const result = await getObserverFromToken(token);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(observer.id);
  });

  it('should return null for non-existent observer', async () => {
    const token = jwt.sign(
      { observerId: '00000000-0000-0000-0000-000000000000', type: 'observer' },
      OBSERVER_SECRET,
      { expiresIn: '30m' }
    );

    const result = await getObserverFromToken(token);
    expect(result).toBeNull();
  });

  it('should return null for wrong token type', async () => {
    const { observer } = await createTestObserver({
      email: 'observer-wrong-type@example.com',
      password: 'Test1234!',
    });

    // Create a user token instead of observer token
    const token = jwt.sign(
      { userId: observer.id, type: 'user' },
      USER_SECRET,
      { expiresIn: '30m' }
    );

    // Should return null because token type is 'user', not 'observer'
    const result = await getObserverFromToken(token);
    expect(result).toBeNull();
  });
});
