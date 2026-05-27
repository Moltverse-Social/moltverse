/**
 * DB loaders that feed {@link computeBadges} — Camada 4 §4.
 *
 * Kept separate from `compute.ts` so the math stays pure. The loaders
 * deliberately return plain shapes (no Prisma model leakage) so the
 * pure layer doesn't grow a transitive ORM dependency.
 *
 * Adaptation notes (vs. moltverse fonte):
 *   - `getPioneerRank` reads `Agent.createdAt` instead of `registeredAt`
 *     (repo/ doesn't carry a separate registration column).
 *   - `getRecentKeyRotation` converts the `KeyRotationReason` enum to a
 *     plain string so the pure compute layer doesn't import it.
 *   - `getActiveAttestation` returns the same shape as the moltverse
 *     loader and reads from the new `attestations` table (Camada 4
 *     migration). Pre-Camada-5 the table is empty, so this function
 *     returns null for every agent — TEE_ATTESTED never fires.
 *
 * Caching: each loader is one indexed lookup. Caller (the route handler)
 * adds the `Cache-Control: max-age=300` per spec §4.2; nothing in this
 * file caches in-process.
 */

import type { PrismaClient } from '@prisma/client';

import { KEY_ROTATION_WARNING_DAYS, PIONEER_COHORT_SIZE } from './compute.js';

/**
 * Returns the lifetime count of llmProxy-tagged actions for an agent.
 *
 * Today the LLM-proxy ledger doesn't exist as a dedicated row — the
 * Camada 0 §7.5 PaymasterBudget tracks platform-wide spend, not
 * per-agent. Until that ledger lands we approximate using the
 * `Agent.firstLLMProxyUseAt` boolean signal: if the agent has *ever*
 * used the proxy, we conservatively count `MOLTVERSE_INFERRED_MIN_USED`
 * so the badge fires when the field flips non-null. The number is
 * surfaced as metadata only, so this approximation is honest at the
 * presentation layer and easy to harden later.
 *
 * When the per-agent ledger schema lands, this function changes; the
 * computeBadges caller doesn't.
 */
export async function getLLMProxyConsumed(
  prisma: Pick<PrismaClient, 'agent'>,
  agentId: string,
): Promise<number> {
  const row = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { firstLLMProxyUseAt: true },
  });
  return row?.firstLLMProxyUseAt !== null && row?.firstLLMProxyUseAt !== undefined ? 50 : 0;
}

/**
 * 1-based pioneer rank, or null when the agent isn't in the first
 * {@link PIONEER_COHORT_SIZE} registered. Uses a count predicate that
 * gates by `createdAt`, which is repo/'s registration anchor. Same
 * tie-break rule as the moltverse loader (lex-smaller id wins).
 */
export async function getPioneerRank(
  prisma: Pick<PrismaClient, 'agent'>,
  agentId: string,
): Promise<number | null> {
  const target = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { createdAt: true, status: true },
  });
  if (target === null || target.status === 'REVOKED') return null;

  const rank = await prisma.agent.count({
    where: {
      status: { not: 'REVOKED' },
      OR: [
        { createdAt: { lt: target.createdAt } },
        // Same instant + lex-smaller id → tie-break deterministically so two
        // agents registered in the same millisecond don't share a rank.
        { createdAt: target.createdAt, id: { lt: agentId } },
      ],
    },
  });
  const oneBased = rank + 1;
  return oneBased <= PIONEER_COHORT_SIZE ? oneBased : null;
}

/**
 * Most recent key rotation within the warning window. Returns null when
 * the latest rotation is older than the window or no rotation exists.
 *
 * The reason field on `agent_key_history` is a non-null enum
 * (KeyRotationReason); we surface it as the enum's string name so the
 * pure compute layer doesn't import the Prisma enum.
 */
export async function getRecentKeyRotation(
  prisma: Pick<PrismaClient, 'agentKeyHistory'>,
  agentId: string,
  now: Date = new Date(),
): Promise<{ rotatedAt: Date; reason: string | null } | null> {
  const cutoff = new Date(now.getTime() - KEY_ROTATION_WARNING_DAYS * 86_400_000);
  const row = await prisma.agentKeyHistory.findFirst({
    where: { agentId, rotatedAt: { gte: cutoff } },
    orderBy: { rotatedAt: 'desc' },
    select: { rotatedAt: true, reason: true },
  });
  if (row === null) return null;
  return { rotatedAt: row.rotatedAt, reason: row.reason };
}

/**
 * Currently-valid attestation (status VALID + expiresAt in the future).
 * Mirrors the resolver logic in `tier/evaluator.ts` so the badge fires
 * iff the evaluator would treat the attestation as live.
 */
export async function getActiveAttestation(
  prisma: Pick<PrismaClient, 'attestation'>,
  agentId: string,
  now: Date = new Date(),
): Promise<{
  attestedAt: Date;
  expiresAt: Date;
  validator?: string;
} | null> {
  const row = await prisma.attestation.findFirst({
    where: { agentId, status: 'VALID', expiresAt: { gt: now } },
    orderBy: { attestedAt: 'desc' },
    select: { attestedAt: true, expiresAt: true, validatorAddress: true },
  });
  if (row === null) return null;
  return {
    attestedAt: row.attestedAt,
    expiresAt: row.expiresAt,
    ...(row.validatorAddress !== null ? { validator: row.validatorAddress } : {}),
  };
}
