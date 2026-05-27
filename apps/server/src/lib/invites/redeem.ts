/**
 * Beta-invite check + redeem core — pure-ish helpers around the
 * `InviteCode` table.
 *
 * Both functions return a discriminated result instead of throwing —
 * the caller (GraphQL resolver) formats the result for the API
 * surface. Keeping these pure lets us reuse the same logic from
 * future admin batch operations, the CLI, and the resolvers without
 * dragging Fastify or Yoga types into the core.
 *
 * Race-safety: `redeemInvite` performs the binding with a single
 * `updateMany` whose WHERE clause includes the precondition predicates
 * (`redeemedAt: null`, `revokedAt: null`, `expiresAt` window). A
 * parallel attempt that beats this one to the row leaves
 * `updated.count === 0`, which is surfaced as `already_redeemed`
 * rather than spuriously claiming success.
 */

import type { PrismaClient } from '@prisma/client';

import { normalizeInviteCode } from './code.js';

export type CheckInviteResult =
  | { status: 'valid'; canonicalCode: string; expiresAt: Date | null }
  | { status: 'not_found' }
  | { status: 'revoked' }
  | { status: 'redeemed' }
  | { status: 'expired' };

export type RedeemInviteResult =
  | { status: 'ok'; canonicalCode: string; redeemedAt: Date }
  | { status: 'already_redeemed_by_observer'; existingCode: string }
  | { status: 'not_found' }
  | { status: 'revoked' }
  | { status: 'already_redeemed' }
  | { status: 'expired' }
  | { status: 'invariant_violation' };

export async function checkInvite(
  prisma: PrismaClient,
  rawCode: string,
): Promise<CheckInviteResult> {
  let code: string;
  try {
    code = normalizeInviteCode(rawCode);
  } catch {
    // Don't reveal "your code is malformed vs. doesn't exist" — uniform
    // `not_found` keeps the endpoint useless as a structure oracle.
    return { status: 'not_found' };
  }

  const row = await prisma.inviteCode.findUnique({
    where: { code },
    // Deliberately NOT selecting `emailTo` — including it in this
    // anonymous-friendly response would leak the recipient's email to
    // anyone holding a valid code.
    select: { redeemedAt: true, revokedAt: true, expiresAt: true },
  });
  if (row === null) return { status: 'not_found' };
  if (row.revokedAt !== null) return { status: 'revoked' };
  if (row.redeemedAt !== null) return { status: 'redeemed' };
  if (row.expiresAt !== null && row.expiresAt < new Date()) return { status: 'expired' };
  return { status: 'valid', canonicalCode: code, expiresAt: row.expiresAt };
}

export async function redeemInvite(
  prisma: PrismaClient,
  rawCode: string,
  observerId: string,
): Promise<RedeemInviteResult> {
  let canonicalCode: string;
  try {
    canonicalCode = normalizeInviteCode(rawCode);
  } catch {
    return { status: 'not_found' };
  }

  // Did the calling observer already redeem something? The unique index
  // would catch this at the update step, but the dedicated check helps
  // the UI render the right message.
  const existingForObserver = await prisma.inviteCode.findFirst({
    where: { redeemedByObserverId: observerId },
    select: { code: true },
  });
  if (existingForObserver !== null) {
    return {
      status: 'already_redeemed_by_observer',
      existingCode: existingForObserver.code,
    };
  }

  const now = new Date();
  const updated = await prisma.inviteCode.updateMany({
    where: {
      code: canonicalCode,
      redeemedAt: null,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: { redeemedAt: now, redeemedByObserverId: observerId },
  });

  if (updated.count === 1) {
    return { status: 'ok', canonicalCode, redeemedAt: now };
  }

  if (updated.count === 0) {
    const row = await prisma.inviteCode.findUnique({
      where: { code: canonicalCode },
      select: { revokedAt: true, redeemedAt: true, expiresAt: true },
    });
    if (row === null) return { status: 'not_found' };
    if (row.revokedAt !== null) return { status: 'revoked' };
    if (row.redeemedAt !== null) return { status: 'already_redeemed' };
    if (row.expiresAt !== null && row.expiresAt < now) return { status: 'expired' };
    return { status: 'invariant_violation' };
  }

  // updated.count > 1 is impossible: `code` is the PK.
  return { status: 'invariant_violation' };
}
