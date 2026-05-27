/**
 * Tier dispute resolver — Camada 4 / Fase 11.
 *
 * Admin closes an OPEN `TierDispute` with one of two outcomes:
 *
 *  - **UPHELD** → the original transition stands. We just stamp the
 *    dispute row with `status=REJECTED`, `resolvedByUserId`,
 *    `resolvedAt`, `resolutionReason`. No tier movement.
 *
 *  - **OVERTURNED** → the original transition was wrong. We stamp
 *    `status=ACCEPTED` AND apply a reverse transition: `agent.tier ←
 *    transition.fromTier`. A new `AgentTierTransition` row records the
 *    reversal (reason `PROMOTION_MANUAL`/`DEMOTION_MANUAL` based on
 *    direction; `metadata.disputeId` ties the audit to this resolution).
 *
 * Constraints:
 *
 *  - The dispute MUST reference a specific transition (`transitionId`
 *    not null). Free-form disputes against the current tier as a whole
 *    can't be OVERTURNED safely — we don't know which tier to revert
 *    to. Callers should reject those disputes via UPHELD with a
 *    reasoning note.
 *  - Agent tier MUST still be `transition.toTier` at resolution time.
 *    If the agent has since been moved by the cron or another override,
 *    overturning the old transition would silently undo the later one.
 *    We surface this as `inconsistent_state` for the admin to inspect.
 *  - Already-resolved disputes (status !== OPEN) return
 *    `already_resolved`.
 *
 * Everything inside a single `$transaction` — dispute stamp + (if
 * overturning) agent.update + transition.create — so the admin never
 * observes a half-resolved state.
 */

import type { AgentTier, Prisma, PrismaClient } from '@prisma/client';

import { createChildLogger } from '../logger.js';
import { TIER_TRANSITION_COOLDOWN_DAYS } from './rules.js';

const log = createChildLogger({ module: 'tier-dispute-resolver' });

const TIER_RANK: Record<AgentTier, number> = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 3,
};

const TRIGGER_SOURCE_OVERTURN = 'admin_dispute_overturned';
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

export type DisputeResolution = 'UPHELD' | 'OVERTURNED';

export interface ResolveTierDisputeInput {
  disputeId: string;
  resolution: DisputeResolution;
  resolutionReason: string;
  adminUserId: string;
  now?: Date;
}

export type ResolveTierDisputeResult =
  | {
      status: 'ok';
      disputeId: string;
      agentId: string;
      finalDisputeStatus: 'REJECTED' | 'ACCEPTED';
      /** Set only when resolution=OVERTURNED — the new reversal transition. */
      newTransitionId: string | null;
      revertedTo: AgentTier | null;
    }
  | { status: 'not_found' }
  | { status: 'already_resolved'; currentStatus: 'ACCEPTED' | 'REJECTED' }
  | { status: 'invalid_input'; reason: 'no_transition_reference' | 'agent_missing' | 'transition_missing' }
  | { status: 'inconsistent_state'; agentTier: AgentTier; expectedTier: AgentTier };

export async function resolveTierDispute(
  prisma: PrismaClient,
  input: ResolveTierDisputeInput,
): Promise<ResolveTierDisputeResult> {
  const now = input.now ?? new Date();

  const dispute = await prisma.tierDispute.findUnique({
    where: { id: input.disputeId },
    select: {
      id: true,
      agentId: true,
      transitionId: true,
      status: true,
    },
  });
  if (dispute === null) return { status: 'not_found' };
  if (dispute.status !== 'OPEN') {
    return {
      status: 'already_resolved',
      currentStatus: dispute.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
    };
  }

  // UPHELD — no tier movement, just close the dispute.
  if (input.resolution === 'UPHELD') {
    await prisma.tierDispute.update({
      where: { id: input.disputeId },
      data: {
        status: 'REJECTED',
        resolvedByUserId: input.adminUserId,
        resolvedAt: now,
        resolutionReason: input.resolutionReason,
      },
    });
    log.info(
      {
        disputeId: input.disputeId,
        agentId: dispute.agentId,
        finalStatus: 'REJECTED',
        adminUserId: input.adminUserId,
      },
      'Tier dispute resolved UPHELD',
    );
    return {
      status: 'ok',
      disputeId: input.disputeId,
      agentId: dispute.agentId,
      finalDisputeStatus: 'REJECTED',
      newTransitionId: null,
      revertedTo: null,
    };
  }

  // OVERTURNED — needs a specific transition to revert.
  if (dispute.transitionId === null) {
    return { status: 'invalid_input', reason: 'no_transition_reference' };
  }

  const [agent, transition] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: dispute.agentId },
      select: { id: true, tier: true },
    }),
    prisma.agentTierTransition.findUnique({
      where: { id: dispute.transitionId },
      select: { id: true, fromTier: true, toTier: true, agentId: true },
    }),
  ]);
  if (agent === null) return { status: 'invalid_input', reason: 'agent_missing' };
  if (transition === null) return { status: 'invalid_input', reason: 'transition_missing' };

  if (agent.tier !== transition.toTier) {
    return { status: 'inconsistent_state', agentTier: agent.tier, expectedTier: transition.toTier };
  }

  const revertTo = transition.fromTier;
  const reversalReason: 'PROMOTION_MANUAL' | 'DEMOTION_MANUAL' =
    TIER_RANK[revertTo] > TIER_RANK[agent.tier] ? 'PROMOTION_MANUAL' : 'DEMOTION_MANUAL';
  const cooldownExpiresAt = new Date(now.getTime() + TIER_TRANSITION_COOLDOWN_DAYS * MS_PER_DAY);

  const newTransitionId = await prisma.$transaction(async (tx) => {
    await tx.tierDispute.update({
      where: { id: input.disputeId },
      data: {
        status: 'ACCEPTED',
        resolvedByUserId: input.adminUserId,
        resolvedAt: now,
        resolutionReason: input.resolutionReason,
      },
    });
    await tx.agent.update({
      where: { id: agent.id },
      data: { tier: revertTo, tierChangedAt: now },
    });
    const trans = await tx.agentTierTransition.create({
      data: {
        agentId: agent.id,
        fromTier: agent.tier,
        toTier: revertTo,
        reason: reversalReason,
        triggerSource: TRIGGER_SOURCE_OVERTURN,
        metadata: {
          adminId: input.adminUserId,
          disputeId: input.disputeId,
          originalTransitionId: transition.id,
          resolutionReason: input.resolutionReason,
        } as Prisma.InputJsonValue,
        cooldownExpiresAt,
      },
      select: { id: true },
    });
    return trans.id;
  });

  log.info(
    {
      disputeId: input.disputeId,
      agentId: agent.id,
      fromTier: agent.tier,
      toTier: revertTo,
      newTransitionId,
      adminUserId: input.adminUserId,
    },
    'Tier dispute resolved OVERTURNED — agent tier reverted',
  );

  return {
    status: 'ok',
    disputeId: input.disputeId,
    agentId: agent.id,
    finalDisputeStatus: 'ACCEPTED',
    newTransitionId,
    revertedTo: revertTo,
  };
}
