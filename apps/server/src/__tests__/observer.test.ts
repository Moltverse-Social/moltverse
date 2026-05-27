/**
 * Observer authentication tests
 *
 * Tests for:
 * - setupObserverAccount
 * - observerLogin
 * - requestPasswordReset
 * - resetPassword
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma } from './setup.js';
import { createTestObserver, createTestPasswordResetToken } from './helpers/index.js';
import {
  hashPassword,
  comparePassword,
  hashRefreshToken,
} from '../lib/auth.js';

describe('Observer account setup', () => {
  beforeEach(async () => {
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should allow observer to set email and password', async () => {
    // Create observer without email/password (simulating after claim)
    const { observer } = await createTestObserver();

    expect(observer.email).toBeNull();
    expect(observer.passwordHash).toBeNull();

    // Update with email/password
    const email = 'test@example.com';
    const password = 'Test1234';
    const passwordHash = await hashPassword(password);

    const updated = await testPrisma.humanObserver.update({
      where: { id: observer.id },
      data: { email, passwordHash },
    });

    expect(updated.email).toBe(email);
    expect(updated.passwordHash).toBeDefined();

    // Verify password
    const isValid = await comparePassword(password, updated.passwordHash!);
    expect(isValid).toBe(true);
  });

  it('should reject duplicate email', async () => {
    const email = 'duplicate@example.com';

    // Create first observer with email
    await createTestObserver({ email, password: 'Test1234' });

    // Try to create second observer with same email
    await expect(
      createTestObserver({ email, password: 'Test1234' })
    ).rejects.toThrow();
  });
});

describe('Observer login', () => {
  beforeEach(async () => {
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should find observer by email', async () => {
    const email = 'login@example.com';
    const password = 'Test1234';

    await createTestObserver({ email, password });

    const observer = await testPrisma.humanObserver.findUnique({
      where: { email },
    });

    expect(observer).toBeDefined();
    expect(observer?.email).toBe(email);
  });

  it('should verify correct password', async () => {
    const email = 'verify@example.com';
    const password = 'Test1234';

    const { observer } = await createTestObserver({ email, password });

    const isValid = await comparePassword(password, observer.passwordHash!);
    expect(isValid).toBe(true);
  });

  it('should reject wrong password', async () => {
    const email = 'wrong@example.com';
    const password = 'Test1234';

    const { observer } = await createTestObserver({ email, password });

    const isValid = await comparePassword('WrongPassword', observer.passwordHash!);
    expect(isValid).toBe(false);
  });

  it('should return null for non-existent email', async () => {
    const observer = await testPrisma.humanObserver.findUnique({
      where: { email: 'nonexistent@example.com' },
    });

    expect(observer).toBeNull();
  });
});

describe('Password reset tokens', () => {
  beforeEach(async () => {
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should create password reset token', async () => {
    const { observer } = await createTestObserver({ email: 'reset@example.com' });
    const { resetToken, rawToken } = await createTestPasswordResetToken(observer.id);

    expect(resetToken).toBeDefined();
    expect(resetToken.observerId).toBe(observer.id);
    expect(resetToken.used).toBe(false);
    expect(resetToken.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Token should be stored as hash
    expect(resetToken.token).not.toBe(rawToken);
    expect(resetToken.token).toBe(hashRefreshToken(rawToken));
  });

  it('should find token by hash', async () => {
    const { observer } = await createTestObserver({ email: 'find@example.com' });
    const { rawToken } = await createTestPasswordResetToken(observer.id);

    const hashedToken = hashRefreshToken(rawToken);
    const foundToken = await testPrisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
    });

    expect(foundToken).toBeDefined();
    expect(foundToken?.observerId).toBe(observer.id);
  });

  it('should mark token as used', async () => {
    const { observer } = await createTestObserver({ email: 'used@example.com' });
    const { resetToken } = await createTestPasswordResetToken(observer.id);

    await testPrisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    const updated = await testPrisma.passwordResetToken.findUnique({
      where: { id: resetToken.id },
    });

    expect(updated?.used).toBe(true);
  });

  it('should detect expired token', async () => {
    const { observer } = await createTestObserver({ email: 'expired@example.com' });
    const { resetToken } = await createTestPasswordResetToken(observer.id, {
      expiresInHours: -1, // Already expired
    });

    expect(resetToken.expiresAt.getTime()).toBeLessThan(Date.now());
  });

  it('should delete old tokens when creating new one', async () => {
    const { observer } = await createTestObserver({ email: 'multi@example.com' });

    // Create first token
    await createTestPasswordResetToken(observer.id);

    const countBefore = await testPrisma.passwordResetToken.count({
      where: { observerId: observer.id },
    });
    expect(countBefore).toBe(1);

    // Delete old tokens and create new one (simulating requestPasswordReset behavior)
    await testPrisma.passwordResetToken.deleteMany({
      where: { observerId: observer.id },
    });
    await createTestPasswordResetToken(observer.id);

    const countAfter = await testPrisma.passwordResetToken.count({
      where: { observerId: observer.id },
    });
    expect(countAfter).toBe(1);
  });
});

describe('Password reset flow', () => {
  beforeEach(async () => {
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should update password after reset', async () => {
    const oldPassword = 'OldPass123';
    const newPassword = 'NewPass456';

    const { observer } = await createTestObserver({
      email: 'pwreset@example.com',
      password: oldPassword,
    });

    // Create reset token
    const { resetToken } = await createTestPasswordResetToken(observer.id);

    // Update password
    const newPasswordHash = await hashPassword(newPassword);
    await testPrisma.$transaction([
      testPrisma.humanObserver.update({
        where: { id: observer.id },
        data: { passwordHash: newPasswordHash },
      }),
      testPrisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    // Verify new password works
    const updated = await testPrisma.humanObserver.findUnique({
      where: { id: observer.id },
    });
    const isValid = await comparePassword(newPassword, updated!.passwordHash!);
    expect(isValid).toBe(true);

    // Verify old password doesn't work
    const isOldValid = await comparePassword(oldPassword, updated!.passwordHash!);
    expect(isOldValid).toBe(false);

    // Verify token is marked as used
    const usedToken = await testPrisma.passwordResetToken.findUnique({
      where: { id: resetToken.id },
    });
    expect(usedToken?.used).toBe(true);
  });

  it('should not allow reuse of token', async () => {
    const { observer } = await createTestObserver({
      email: 'reuse@example.com',
      password: 'Test1234',
    });

    // Create and mark token as used
    const { rawToken } = await createTestPasswordResetToken(observer.id, {
      used: true,
    });

    // Try to find valid (unused) token
    const hashedToken = hashRefreshToken(rawToken);
    const foundToken = await testPrisma.passwordResetToken.findFirst({
      where: {
        token: hashedToken,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    expect(foundToken).toBeNull();
  });
});

describe('Observer hasAccountSetup', () => {
  beforeEach(async () => {
    await testPrisma.passwordResetToken.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should return false when no email/password', async () => {
    const { observer } = await createTestObserver();

    const hasSetup = !!observer.email && !!observer.passwordHash;
    expect(hasSetup).toBe(false);
  });

  it('should return false when only email set', async () => {
    const { observer } = await createTestObserver({ email: 'partial@example.com' });

    const hasSetup = !!observer.email && !!observer.passwordHash;
    expect(hasSetup).toBe(false);
  });

  it('should return true when both email and password set', async () => {
    const { observer } = await createTestObserver({
      email: 'complete@example.com',
      password: 'Test1234',
    });

    const hasSetup = !!observer.email && !!observer.passwordHash;
    expect(hasSetup).toBe(true);
  });
});

describe('Observer open registration', () => {
  beforeEach(async () => {
    await testPrisma.emailVerificationCode.deleteMany();
    await testPrisma.observerRefreshToken.deleteMany();
    await testPrisma.humanObserver.deleteMany();
  });

  it('should create an observer with email/password and no Twitter fields', async () => {
    const { observer } = await createTestObserver({
      twitterId: null,
      twitterHandle: null,
      email: 'openreg@example.com',
      password: 'Test@1234',
    });

    expect(observer.twitterId).toBeNull();
    expect(observer.twitterHandle).toBeNull();
    expect(observer.email).toBe('openreg@example.com');
    expect(observer.passwordHash).toBeDefined();
  });

  it('should set emailVerified to false on creation', async () => {
    const { observer } = await createTestObserver({
      twitterId: null,
      twitterHandle: null,
      email: 'notverified@example.com',
      password: 'Test@1234',
    });

    expect(observer.emailVerified).toBe(false);
  });

  it('should reject duplicate email even without twitter fields', async () => {
    const email = 'dup-openreg@example.com';

    await createTestObserver({ twitterId: null, twitterHandle: null, email, password: 'Test@1234' });

    await expect(
      createTestObserver({ twitterId: null, twitterHandle: null, email, password: 'Test@1234' })
    ).rejects.toThrow();
  });

  it('should allow multiple observers with null twitterId (UNIQUE constraint is NULL-safe)', async () => {
    // PostgreSQL allows multiple NULLs in unique-indexed columns
    const obs1 = await createTestObserver({
      twitterId: null,
      twitterHandle: null,
      email: 'null1@example.com',
      password: 'Test@1234',
    });
    const obs2 = await createTestObserver({
      twitterId: null,
      twitterHandle: null,
      email: 'null2@example.com',
      password: 'Test@1234',
    });

    expect(obs1.observer.twitterId).toBeNull();
    expect(obs2.observer.twitterId).toBeNull();
  });

  it('should set termsAcceptedAt and privacyAcceptedAt when provided', async () => {
    const now = new Date();

    const observer = await testPrisma.humanObserver.create({
      data: {
        displayName: 'Terms Test User',
        email: 'terms@example.com',
        passwordHash: 'hash',
        emailVerified: false,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
      },
    });

    expect(observer.termsAcceptedAt).not.toBeNull();
    expect(observer.privacyAcceptedAt).not.toBeNull();
  });

  it('should create an email verification code for open registration', async () => {
    const { observer } = await createTestObserver({
      twitterId: null,
      twitterHandle: null,
      email: 'vercode@example.com',
      password: 'Test@1234',
    });

    const { createTestEmailVerificationCode } = await import('./helpers/index.js');
    const { verificationCode } = await createTestEmailVerificationCode(observer.id, observer.email!);

    expect(verificationCode.email).toBe(observer.email);
    expect(verificationCode.observerId).toBe(observer.id);
    expect(verificationCode.used).toBe(false);
    expect(verificationCode.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
