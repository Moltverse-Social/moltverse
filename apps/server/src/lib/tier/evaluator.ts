/**
 * Tier evaluator — Camada 4 §3.4.
 *
 * Single entry point: {@link evaluateAgentTier}. Loads everything the rules
 * need, runs both promotion + demotion, applies the winning transition
 * inside a transaction, and emits an audit row.
 *
 * Two safety properties:
 *
 *  - **Demotion wins ties.** If both an automatic promotion AND a demotion
 *    are eligible (rare — e.g. score rebounds the same day a TEE expires),
 *    the demotion is applied. Bias toward fail-closed.
 *
 *  - **Cooldown gates automatic transitions** but is bypassed for the
 *    critical reasons declared by {@link isCooldownBypassReason}. Admin
 *    overrides also bypass; those flow through a different entry point
 *    (manual override route, deferred to Fase 10-12).
 *
 * Rules logic is in `rules.ts`; this file owns DB I/O + audit only.
 *
 * Adaptation notes (vs. moltverse fonte):
 *   - Reads `agent.createdAt` as the registration anchor (repo/ has no
 *     separate `registeredAt` column).
 *   - Coerces a nullable `agent.behaviorScore` to the INSUFFICIENT_DATA
 *     fallback (0.55) so the rules can run unconditionally — that score
 *     bucket is below every promotion threshold and above every demotion
 *     threshold, so unscored agents stay put.
 *   - On-chain phase flag is read from `process.env.ERC8004_ONCHAIN_ACTIVE`
 *     instead of a typed env module (env.ts hasn't been extended yet for
 *     Camada 4-only config).
 */

import type { PrismaClient, TransitionReason } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { INSUFFICIENT_DATA_SCORE } from '../behavior/score-formula.js';
import { createChildLogger } from '../logger.js';

import {
  evaluateDemotion,
  evaluatePromotion,
  isCooldownBypassReason,
  isInCooldown,
  TIER_TRANSITION_COOLDOWN_DAYS,
  type AgentTierSnapshot,
  type AttestationSnapshot,
  type AttestationStatus,
  type RulesContext,
  type ScoreSnapshot,
} from './rules.js';

const log = createChildLogger({ module: 'tier-evaluator' });
const EVALUATOR_VERSION = 'cron-tier-evaluator';

function isOnChainPhaseActive(): boolean {
  return process.env.ERC8004_ONCHAIN_ACTIVE === 'true';
}

// ---------------------------------------------------------------------------
// Attestation status resolver
// ---------------------------------------------------------------------------

/**
 * Translate the latest persisted Attestation row to the lean status the
 * rules consume. Falls back to 'NONE' when no attestation row exists or
 * when the latest row is in a non-actionable lifecycle state
 * (PENDING_VERIFICATION, SUPERSEDED, REVOKED). Auto-expires a VALID row
 * whose expiresAt is in the past — keeps the rules' EXPIRED branch
 * reachable even when the background attestation worker (Camada 5)
 * hasn't flipped the DB row yet.
 */
export async function resolveAttestationStatus(
  prisma: Pick<PrismaClient, 'attestation'>,
  agentId: string,
  now: Date = new Date(),
): Promise<AttestationSnapshot> {
  const row = await prisma.attestation.findFirst({
    where: { agentId },
    orderBy: { attestedAt: 'desc' },
    select: { status: true, expiresAt: true },
  });
  if (row === null) return { status: 'NONE', expiresAt: null };

  // Auto-expire on read so the evaluator doesn't depend on a separate
  // expiry sweeper. The DB row itself is left untouched — the
  // attestation worker is the writer of record.
  if (row.status === 'VALID' && row.expiresAt.getTime() <= now.getTime()) {
    return { status: 'EXPIRED', expiresAt: row.expiresAt };
  }

  const mapped: Record<typeof row.status, AttestationStatus> = {
    PENDING_VERIFICATION: 'NONE',
    SUPERSEDED: 'NONE',
    REVOKED: 'NONE',
    VALID: 'VALID',
    EXPIRED: 'EXPIRED',
    INVALID: 'INVALID',
  };
  return { status: mapped[row.status], expiresAt: row.expiresAt };
}

// ---------------------------------------------------------------------------
// Critical-flag presence
// ---------------------------------------------------------------------------

export async function hasUnresolvedCriticalFlag(
  prisma: Pick<PrismaClient, 'behaviorFlag'>,
  agentId: string,
): Promise<boolean> {
  const row = await prisma.behaviorFlag.findFirst({
    where: { agentId, severity: 'CRITICAL', resolvedAt: null },
    select: { id: true },
  });
  return row !== null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type EvaluationOutcome =
  | { state: 'no_change'; reason: 'criteria_unmet' | 'in_cooldown' }
  | {
      state: 'transition';
      fromTier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
      toTier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
      reason: 'promotion' | 'demotion';
      transitionId: string;
    };

export interface EvaluateOptions {
  now?: Date;
  triggerSource?: string;
}

/**
 * Evaluate one agent and apply at most one transition. Returns the
 * outcome so the cron loop can keep counts for telemetry.
 *
 * Skips silently when the agent is not found (raced with a cascade
 * delete) or has REVOKED status (terminal — no point evaluating).
 */
export async function evaluateAgentTier(
  prisma: PrismaClient,
  agentId: string,
  options: EvaluateOptions = {},
): Promise<EvaluationOutcome> {
  const now = options.now ?? new Date();
  const triggerSource = options.triggerSource ?? EVALUATOR_VERSION;

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      tier: true,
      status: true,
      createdAt: true,
      tierChangedAt: true,
      actionsCount: true,
      tokenId: true,
      behaviorScore: true,
    },
  });
  if (agent === null) {
    return { state: 'no_change', reason: 'criteria_unmet' };
  }
  if (agent.status === 'REVOKED') {
    return { state: 'no_change', reason: 'criteria_unmet' };
  }

  const snapshot: AgentTierSnapshot = {
    tier: agent.tier,
    status: agent.status,
    registeredAt: agent.createdAt,
    tierUpdatedAt: agent.tierChangedAt,
    actionsCount: agent.actionsCount,
    tokenId: agent.tokenId,
  };
  const score: ScoreSnapshot = {
    score: agent.behaviorScore ?? INSUFFICIENT_DATA_SCORE,
  };

  const [attestation, hasCritical] = await Promise.all([
    resolveAttestationStatus(prisma, agentId, now),
    hasUnresolvedCriticalFlag(prisma, agentId),
  ]);

  const ctx: RulesContext = {
    onChainPhaseActive: isOnChainPhaseActive(),
    hasCriticalFlag: hasCritical,
    now,
  };

  const demotion = evaluateDemotion(snapshot, score, attestation, ctx);
  const promotion = evaluatePromotion(snapshot, score, attestation, ctx);

  // Demotion wins — fail-closed.
  if (demotion.proposedToTier !== null && demotion.reason !== null) {
    const canBypass = isCooldownBypassReason(demotion.reason);
    if (isInCooldown(snapshot, now) && !canBypass) {
      return { state: 'no_change', reason: 'in_cooldown' };
    }
    return await applyTransition(prisma, {
      agentId,
      fromTier: snapshot.tier,
      toTier: demotion.proposedToTier,
      reason: demotion.reason,
      triggerSource,
      now,
      checks: demotion.checks,
    });
  }

  if (promotion.proposedToTier !== null) {
    if (isInCooldown(snapshot, now)) {
      return { state: 'no_change', reason: 'in_cooldown' };
    }
    return await applyTransition(prisma, {
      agentId,
      fromTier: snapshot.tier,
      toTier: promotion.proposedToTier,
      reason: 'PROMOTION_AUTOMATIC',
      triggerSource,
      now,
      checks: promotion.checks,
    });
  }

  return { state: 'no_change', reason: 'criteria_unmet' };
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------

interface ApplyTransitionInput {
  agentId: string;
  fromTier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  toTier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  reason: TransitionReason;
  triggerSource: string;
  now: Date;
  checks: unknown[];
}

async function applyTransition(
  prisma: PrismaClient,
  input: ApplyTransitionInput,
): Promise<EvaluationOutcome> {
  const cooldownExpiresAt = new Date(
    input.now.getTime() + TIER_TRANSITION_COOLDOWN_DAYS * 24 * 60 * 60 * 1_000,
  );
  const isPromotion = input.reason === 'PROMOTION_AUTOMATIC';

  const result = await prisma.$transaction(async (tx) => {
    await tx.agent.update({
      where: { id: input.agentId },
      data: {
        tier: input.toTier,
        tierChangedAt: input.now,
      },
    });
    const trans = await tx.agentTierTransition.create({
      data: {
        agentId: input.agentId,
        fromTier: input.fromTier,
        toTier: input.toTier,
        reason: input.reason,
        triggerSource: input.triggerSource,
        // Cast through JSON since `checks[*].detail` carries `unknown`
        // values that Prisma's InputJsonValue type doesn't model
        // directly. The runtime shape is plain serialisable JSON.
        metadata: { checks: input.checks } as Prisma.InputJsonValue,
        cooldownExpiresAt,
      },
      select: { id: true },
    });
    return trans.id;
  });

  log.info(
    {
      agentId: input.agentId,
      fromTier: input.fromTier,
      toTier: input.toTier,
      reason: input.reason,
      transitionId: result,
    },
    isPromotion ? 'Agent promoted' : 'Agent demoted',
  );

  return {
    state: 'transition',
    fromTier: input.fromTier,
    toTier: input.toTier,
    reason: isPromotion ? 'promotion' : 'demotion',
    transitionId: result,
  };
}
