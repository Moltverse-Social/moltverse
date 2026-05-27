/**
 * Tier manual override — Camada 4, Fase 11.
 *
 * Admin-initiated tier change. Parallel to the automatic
 * `evaluator.ts:applyTransition()` but with three intentional
 * differences:
 *
 *  1. **Bypasses cooldown.** Admin overrides are authoritative;
 *     `tierChangedAt` is still updated so subsequent automatic
 *     transitions wait 7 days as usual, but this write itself doesn't
 *     check the cooldown gate.
 *  2. **Reason is `PROMOTION_MANUAL` or `DEMOTION_MANUAL`** based on
 *     the direction of the move (compared against the tier ranking
 *     `BRONZE < SILVER < GOLD < PLATINUM`). Same-tier requests are
 *     rejected as `noop` — no row written.
 *  3. **`metadata` carries `{ adminUserId, notes }`** instead of the
 *     evaluator's `{ checks }` blob. The audit trail is just the actor
 *     and a free-text reason — the rules engine had nothing to say.
 *
 * Stays in lib (not in the resolver) so the GraphQL layer is thin and
 * the same primitive can be reused by a future admin CLI tool, a
 * dispute-overturn flow (Fase 11.2 calls into this), or a backfill
 * script. The resolver's only job is mapping result → DTO + auth.
 */

import type { AgentTier, Prisma, PrismaClient } from '@prisma/client';

import { createChildLogger } from '../logger.js';
import { TIER_TRANSITION_COOLDOWN_DAYS } from './rules.js';

const log = createChildLogger({ module: 'tier-manual-override' });

const TIER_RANK: Record<AgentTier, number> = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 3,
};

const TRIGGER_SOURCE = 'admin_manual_override';
const MS_PER_DAY = 24 * 60 * 60 * 1_000;

export interface OverrideAgentTierInput {
  agentId: string;
  toTier: AgentTier;
  /** UUID of the admin (User/Agent/Observer) initiating the change — surfaces
   *  in `metadata.adminId` for audit. */
  adminUserId: string;
  /** Optional free-text reason from the admin UI. Stored in
   *  `metadata.notes`. */
  notes?: string | null;
  /** Test seam — defaults to wall clock. */
  now?: Date;
}

export type OverrideAgentTierResult =
  | {
      status: 'ok';
      agentId: string;
      fromTier: AgentTier;
      toTier: AgentTier;
      transitionId: string;
    }
  | { status: 'not_found' }
  | { status: 'noop'; fromTier: AgentTier };

/**
 * Force an agent to a specific tier and record the override.
 *
 * Returns a discriminated result instead of throwing — callers (GraphQL
 * resolver) map the cases to the API surface.
 */
export async function overrideAgentTier(
  prisma: PrismaClient,
  input: OverrideAgentTierInput,
): Promise<OverrideAgentTierResult> {
  const now = input.now ?? new Date();

  const agent = await prisma.agent.findUnique({
    where: { id: input.agentId },
    select: { id: true, tier: true },
  });
  if (agent === null) return { status: 'not_found' };
  if (agent.tier === input.toTier) {
    return { status: 'noop', fromTier: agent.tier };
  }

  const reason: 'PROMOTION_MANUAL' | 'DEMOTION_MANUAL' =
    TIER_RANK[input.toTier] > TIER_RANK[agent.tier] ? 'PROMOTION_MANUAL' : 'DEMOTION_MANUAL';
  const cooldownExpiresAt = new Date(now.getTime() + TIER_TRANSITION_COOLDOWN_DAYS * MS_PER_DAY);

  const transitionId = await prisma.$transaction(async (tx) => {
    await tx.agent.update({
      where: { id: input.agentId },
      data: {
        tier: input.toTier,
        tierChangedAt: now,
      },
    });
    const trans = await tx.agentTierTransition.create({
      data: {
        agentId: input.agentId,
        fromTier: agent.tier,
        toTier: input.toTier,
        reason,
        triggerSource: TRIGGER_SOURCE,
        // `notes` may be null — keep the JSON shape stable for downstream
        // tooling that reads metadata as a typed contract.
        metadata: {
          adminId: input.adminUserId,
          notes: input.notes ?? null,
        } as Prisma.InputJsonValue,
        cooldownExpiresAt,
      },
      select: { id: true },
    });
    return trans.id;
  });

  log.info(
    {
      agentId: input.agentId,
      fromTier: agent.tier,
      toTier: input.toTier,
      reason,
      adminUserId: input.adminUserId,
      transitionId,
    },
    'Agent tier manually overridden by admin',
  );

  return {
    status: 'ok',
    agentId: input.agentId,
    fromTier: agent.tier,
    toTier: input.toTier,
    transitionId,
  };
}
