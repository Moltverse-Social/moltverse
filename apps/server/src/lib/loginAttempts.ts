/**
 * Login attempt tracking for brute force protection
 *
 * Implements account lockout after failed login attempts:
 * - After 5 failed attempts, account is locked for 15 minutes
 * - Successful login clears the attempt counter
 * - Counter resets automatically after lockout duration
 *
 * Supports both User and HumanObserver accounts.
 */

import { Prisma, type PrismaClient, type HumanObserver, type User } from '@prisma/client';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Entity type for lockout operations
 */
export type LockoutEntityType = 'user' | 'observer';

/**
 * Common fields required for lockout checks
 */
interface LockoutFields {
  loginAttempts: number;
  lastFailedLogin: Date | null;
  lockedUntil: Date | null;
}

// ============================================================================
// OBSERVER FUNCTIONS (backward compatible)
// ============================================================================

/**
 * Check if an observer account is currently locked
 */
export function isAccountLocked(observer: HumanObserver): boolean {
  return isEntityLocked(observer);
}

/**
 * Get remaining lockout time in seconds for an observer
 */
export function getLockoutRemainingSeconds(observer: HumanObserver): number {
  return getEntityLockoutRemainingSeconds(observer);
}

/**
 * Record a failed login attempt for an observer
 * Returns whether account is now locked and remaining attempts
 */
export async function recordFailedLoginAttempt(
  prisma: PrismaClient,
  observerId: string
): Promise<{ locked: boolean; attemptsRemaining: number }> {
  return recordFailedAttempt(prisma, 'observer', observerId);
}

/**
 * Clear login attempts on successful login for an observer
 */
export async function clearLoginAttempts(
  prisma: PrismaClient,
  observerId: string
): Promise<void> {
  return clearAttempts(prisma, 'observer', observerId);
}

// ============================================================================
// USER FUNCTIONS
// ============================================================================

/**
 * Check if a user account is currently locked
 */
export function isUserAccountLocked(user: User): boolean {
  return isEntityLocked(user);
}

/**
 * Get remaining lockout time in seconds for a user
 */
export function getUserLockoutRemainingSeconds(user: User): number {
  return getEntityLockoutRemainingSeconds(user);
}

/**
 * Record a failed login attempt for a user
 * Returns whether account is now locked and remaining attempts
 */
export async function recordUserFailedLoginAttempt(
  prisma: PrismaClient,
  userId: string
): Promise<{ locked: boolean; attemptsRemaining: number }> {
  return recordFailedAttempt(prisma, 'user', userId);
}

/**
 * Clear login attempts on successful login for a user
 */
export async function clearUserLoginAttempts(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  return clearAttempts(prisma, 'user', userId);
}

// ============================================================================
// GENERIC FUNCTIONS (internal)
// ============================================================================

/**
 * Check if an entity is currently locked
 */
function isEntityLocked(entity: LockoutFields): boolean {
  if (!entity.lockedUntil) return false;
  return entity.lockedUntil > new Date();
}

/**
 * Get remaining lockout time in seconds
 */
function getEntityLockoutRemainingSeconds(entity: LockoutFields): number {
  if (!entity.lockedUntil) return 0;
  const remaining = entity.lockedUntil.getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 1000));
}

/**
 * Record a failed login attempt for any entity type
 *
 * Uses atomic increment to prevent race conditions where concurrent
 * login requests could read the same counter value and bypass lockout.
 */
async function recordFailedAttempt(
  prisma: PrismaClient,
  entityType: LockoutEntityType,
  entityId: string
): Promise<{ locked: boolean; attemptsRemaining: number }> {
  const now = new Date();
  const resetThreshold = new Date(now.getTime() - LOCKOUT_DURATION_MINUTES * 60 * 1000);
  const lockUntil = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);

  // Atomic increment: resets counter if last failure was beyond the lockout window,
  // otherwise increments. Sets lockedUntil if threshold is reached.
  // This is a single SQL statement — no read-modify-write race condition.
  // SEC-019: Use $executeRaw (tagged template) instead of $executeRawUnsafe
  const tableRef = entityType === 'observer'
    ? Prisma.sql`"human_observers"`
    : Prisma.sql`"users"`;

  const result = await prisma.$executeRaw`
    UPDATE ${tableRef}
    SET
      "login_attempts" = CASE
        WHEN "last_failed_login" IS NULL OR "last_failed_login" < ${resetThreshold} THEN 1
        ELSE "login_attempts" + 1
      END,
      "last_failed_login" = ${now},
      "locked_until" = CASE
        WHEN (CASE
          WHEN "last_failed_login" IS NULL OR "last_failed_login" < ${resetThreshold} THEN 1
          ELSE "login_attempts" + 1
        END) >= ${MAX_LOGIN_ATTEMPTS} THEN ${lockUntil}
        ELSE "locked_until"
      END
    WHERE "id" = ${entityId}::uuid`;

  if (result === 0) {
    return { locked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
  }

  // Read back the updated state to return accurate info
  let entity: LockoutFields | null = null;
  if (entityType === 'observer') {
    entity = await prisma.humanObserver.findUnique({
      where: { id: entityId },
      select: { loginAttempts: true, lastFailedLogin: true, lockedUntil: true },
    });
  } else {
    entity = await prisma.user.findUnique({
      where: { id: entityId },
      select: { loginAttempts: true, lastFailedLogin: true, lockedUntil: true },
    });
  }

  if (!entity) {
    return { locked: false, attemptsRemaining: MAX_LOGIN_ATTEMPTS };
  }

  const shouldLock = entity.loginAttempts >= MAX_LOGIN_ATTEMPTS;
  return {
    locked: shouldLock,
    attemptsRemaining: Math.max(0, MAX_LOGIN_ATTEMPTS - entity.loginAttempts),
  };
}

/**
 * Clear login attempts on successful login
 */
async function clearAttempts(
  prisma: PrismaClient,
  entityType: LockoutEntityType,
  entityId: string
): Promise<void> {
  const updateData = {
    loginAttempts: 0,
    lastFailedLogin: null,
    lockedUntil: null,
  };

  if (entityType === 'observer') {
    await prisma.humanObserver.update({
      where: { id: entityId },
      data: updateData,
    });
  } else {
    await prisma.user.update({
      where: { id: entityId },
      data: updateData,
    });
  }
}

/**
 * Get lockout duration in minutes (for error messages)
 */
export function getLockoutDurationMinutes(): number {
  return LOCKOUT_DURATION_MINUTES;
}

/**
 * Get max login attempts (for error messages)
 */
export function getMaxLoginAttempts(): number {
  return MAX_LOGIN_ATTEMPTS;
}
