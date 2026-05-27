/**
 * Attestation invalidator — Camada 5 / Fase 11.
 *
 * Admin-initiated revocation of an `Attestation` row. Parallel to (and
 * distinct from) the worker's automatic `EXPIRED` flip: this path sets
 * `status=REVOKED` + populates `invalidatedAt` + `invalidatedReason`
 * so the audit trail records *why* the admin pulled it.
 *
 * Idempotent on already-revoked rows (returns `already_revoked`).
 * Refuses to flip terminal `SUPERSEDED` (newer VALID attestation has
 * replaced this one — revoking it is a no-op) and `INVALID` (the
 * verifier already rejected it for a verification reason — admin
 * stomping on that masks the real cause).
 *
 * No tier impact in this function — the cron tier-evaluator picks up
 * the status change on its next pass and may demote GOLD→SILVER per
 * the rules in `lib/tier/rules.ts`. We deliberately don't cascade
 * here: the eval cron is the source of truth for tier movement so
 * admin actions reuse the same code path.
 */

import type { AttestationStatus, PrismaClient } from '@prisma/client';

import { createChildLogger } from '../logger.js';

const log = createChildLogger({ module: 'attestation-invalidator' });

export interface InvalidateAttestationInput {
  attestationId: string;
  reason: string;
  adminUserId: string;
  now?: Date;
}

export type InvalidateAttestationResult =
  | {
      status: 'ok';
      attestationId: string;
      agentId: string;
      previousStatus: AttestationStatus;
    }
  | { status: 'not_found' }
  | { status: 'already_revoked' }
  | { status: 'cannot_invalidate'; reason: 'superseded' | 'invalid_verification' };

export async function invalidateAttestationByAdmin(
  prisma: PrismaClient,
  input: InvalidateAttestationInput,
): Promise<InvalidateAttestationResult> {
  const now = input.now ?? new Date();

  const row = await prisma.attestation.findUnique({
    where: { id: input.attestationId },
    select: { id: true, agentId: true, status: true },
  });
  if (row === null) return { status: 'not_found' };

  if (row.status === 'REVOKED') return { status: 'already_revoked' };
  if (row.status === 'SUPERSEDED') {
    return { status: 'cannot_invalidate', reason: 'superseded' };
  }
  if (row.status === 'INVALID') {
    return { status: 'cannot_invalidate', reason: 'invalid_verification' };
  }

  await prisma.attestation.update({
    where: { id: input.attestationId },
    data: {
      status: 'REVOKED',
      invalidatedAt: now,
      invalidatedReason: input.reason,
    },
  });

  log.info(
    {
      attestationId: input.attestationId,
      agentId: row.agentId,
      previousStatus: row.status,
      adminUserId: input.adminUserId,
    },
    'Attestation revoked by admin',
  );

  return {
    status: 'ok',
    attestationId: input.attestationId,
    agentId: row.agentId,
    previousStatus: row.status,
  };
}
