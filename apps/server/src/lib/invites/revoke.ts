/**
 * Invite revocation — Fase 11.
 *
 * Soft-kill an `InviteCode` so the public check + redeem endpoints
 * treat it as 404 (`reason: 'revoked'`). Implemented as a race-safe
 * `updateMany` whose WHERE clause includes the precondition predicates
 * — a parallel admin attempting the same revoke leaves
 * `updated.count === 0` and we report `already_revoked` instead of
 * spuriously claiming success.
 *
 * Already-redeemed codes are left untouched: the redemption is a
 * permanent binding (observer ↔ code) and a soft kill at this point
 * doesn't undo the access grant. Callers receive `already_redeemed`
 * so the UI can show the right copy.
 */

import type { PrismaClient } from '@prisma/client';

import { createChildLogger } from '../logger.js';
import { normalizeInviteCode } from './code.js';

const log = createChildLogger({ module: 'invites-revoke' });

export interface RevokeInviteInput {
  code: string;
  revokedByObserverId: string;
  now?: Date;
}

export type RevokeInviteResult =
  | { status: 'ok'; canonicalCode: string; revokedAt: Date }
  | { status: 'not_found' }
  | { status: 'already_redeemed' }
  | { status: 'already_revoked' };

export async function revokeInvite(
  prisma: PrismaClient,
  input: RevokeInviteInput,
): Promise<RevokeInviteResult> {
  let canonicalCode: string;
  try {
    canonicalCode = normalizeInviteCode(input.code);
  } catch {
    return { status: 'not_found' };
  }

  const now = input.now ?? new Date();
  const updated = await prisma.inviteCode.updateMany({
    where: {
      code: canonicalCode,
      redeemedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: now, revokedByObserverId: input.revokedByObserverId },
  });

  if (updated.count === 1) {
    log.info(
      { code: canonicalCode, revokedByObserverId: input.revokedByObserverId },
      'Invite code revoked',
    );
    return { status: 'ok', canonicalCode, revokedAt: now };
  }

  // updated.count === 0 — figure out why so the caller can show the
  // right error. PK is the code itself, so > 1 is impossible.
  const row = await prisma.inviteCode.findUnique({
    where: { code: canonicalCode },
    select: { redeemedAt: true, revokedAt: true },
  });
  if (row === null) return { status: 'not_found' };
  if (row.redeemedAt !== null) return { status: 'already_redeemed' };
  if (row.revokedAt !== null) return { status: 'already_revoked' };
  // Should be unreachable — predicates above cover the row state space.
  return { status: 'not_found' };
}
