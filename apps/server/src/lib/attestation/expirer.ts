/**
 * Attestation expiry sweep — Camada 5 §5.6.
 *
 * Flips `VALID` rows whose `expiresAt` is in the past to `EXPIRED`.
 * The Camada 4 tier evaluator picks up the `EXPIRED` status on its
 * next pass and applies the 14-day grace before demoting GOLD→SILVER.
 *
 * The sweep is idempotent — repeated calls are no-ops for rows
 * already past the transition. It's also bounded (no take cap) on
 * purpose: the population that crosses expiry on any given hour is
 * tiny (one row per agent every 90 days), so an unbounded
 * `updateMany` is cheaper than paginated reads.
 */

import type { PrismaClient } from '@prisma/client';

import { createChildLogger } from '../logger.js';

const log = createChildLogger({ module: 'attestation-expirer' });

export interface SweepResult {
  /** Number of rows flipped VALID → EXPIRED. */
  expired: number;
}

export async function runAttestationExpirySweep(
  prisma: Pick<PrismaClient, 'attestation'>,
  now: Date = new Date(),
): Promise<SweepResult> {
  const result = await prisma.attestation.updateMany({
    where: { status: 'VALID', expiresAt: { lt: now } },
    data: { status: 'EXPIRED' },
  });
  if (result.count > 0) {
    log.info({ expired: result.count, cutoff: now.toISOString() }, 'Attestation expiry sweep');
  } else {
    log.debug({ cutoff: now.toISOString() }, 'Attestation expiry sweep (nothing to do)');
  }
  return { expired: result.count };
}
