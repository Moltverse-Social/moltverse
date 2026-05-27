/**
 * Tests for src/lib/tier/manual-override.ts.
 *
 * Fake Prisma — focuses on the discriminated result shape, the chosen
 * transition reason (PROMOTION_MANUAL vs. DEMOTION_MANUAL), and the
 * audit metadata. The persistence pattern mirrors evaluator.test.ts
 * (the manual override uses the same `$transaction` + agent update +
 * transition insert sequence).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  overrideAgentTier,
  type OverrideAgentTierResult,
} from '../../../lib/tier/manual-override.js';
import { TIER_TRANSITION_COOLDOWN_DAYS } from '../../../lib/tier/rules.js';

const NOW = new Date('2026-05-12T12:00:00Z');
const MS_DAY = 24 * 60 * 60 * 1_000;

interface FakeOpts {
  agent: null | { tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' };
}

function fakePrismaForOverride(opts: FakeOpts): {
  prisma: unknown;
  spies: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    createTrans: ReturnType<typeof vi.fn>;
    tx: ReturnType<typeof vi.fn>;
  };
} {
  const findUnique = vi.fn().mockResolvedValue(
    opts.agent !== null ? { id: 'agent_x', ...opts.agent } : null,
  );
  const update = vi.fn().mockResolvedValue({});
  const createTrans = vi.fn().mockResolvedValue({ id: 'trans_override_1' });
  const tx = vi.fn(async (cb: (txClient: unknown) => Promise<string>) =>
    cb({
      agent: { update },
      agentTierTransition: { create: createTrans },
    }),
  );
  const prisma = {
    agent: { findUnique, update },
    agentTierTransition: { create: createTrans },
    $transaction: tx,
  };
  return { prisma, spies: { findUnique, update, createTrans, tx } };
}

describe('overrideAgentTier', () => {
  it('returns not_found when the agent is missing', async () => {
    const { prisma, spies } = fakePrismaForOverride({ agent: null });
    const r = await overrideAgentTier(prisma as never, {
      agentId: 'agent_missing',
      toTier: 'GOLD',
      adminUserId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({ status: 'not_found' } satisfies OverrideAgentTierResult);
    expect(spies.update).not.toHaveBeenCalled();
    expect(spies.createTrans).not.toHaveBeenCalled();
  });

  it('returns noop when toTier === current tier (no write)', async () => {
    const { prisma, spies } = fakePrismaForOverride({ agent: { tier: 'GOLD' } });
    const r = await overrideAgentTier(prisma as never, {
      agentId: 'agent_x',
      toTier: 'GOLD',
      adminUserId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({ status: 'noop', fromTier: 'GOLD' } satisfies OverrideAgentTierResult);
    expect(spies.update).not.toHaveBeenCalled();
    expect(spies.createTrans).not.toHaveBeenCalled();
  });

  it('writes PROMOTION_MANUAL when toTier > fromTier (BRONZE → GOLD)', async () => {
    const { prisma, spies } = fakePrismaForOverride({ agent: { tier: 'BRONZE' } });
    const r = await overrideAgentTier(prisma as never, {
      agentId: 'agent_x',
      toTier: 'GOLD',
      adminUserId: 'admin_1',
      notes: 'manual review approved',
      now: NOW,
    });

    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.fromTier).toBe('BRONZE');
    expect(r.toTier).toBe('GOLD');
    expect(r.transitionId).toBe('trans_override_1');

    expect(spies.update).toHaveBeenCalledOnce();
    const updateArgs = spies.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { tier: string; tierChangedAt: Date };
    };
    expect(updateArgs.where.id).toBe('agent_x');
    expect(updateArgs.data.tier).toBe('GOLD');
    expect(updateArgs.data.tierChangedAt).toEqual(NOW);

    expect(spies.createTrans).toHaveBeenCalledOnce();
    const createArgs = spies.createTrans.mock.calls[0]?.[0] as {
      data: {
        agentId: string;
        fromTier: string;
        toTier: string;
        reason: string;
        triggerSource: string;
        metadata: { adminId: string; notes: string | null };
        cooldownExpiresAt: Date;
      };
    };
    expect(createArgs.data.reason).toBe('PROMOTION_MANUAL');
    expect(createArgs.data.triggerSource).toBe('admin_manual_override');
    expect(createArgs.data.metadata).toEqual({ adminId: 'admin_1', notes: 'manual review approved' });
    expect(createArgs.data.cooldownExpiresAt).toEqual(
      new Date(NOW.getTime() + TIER_TRANSITION_COOLDOWN_DAYS * MS_DAY),
    );
  });

  it('writes DEMOTION_MANUAL when toTier < fromTier (PLATINUM → SILVER)', async () => {
    const { prisma, spies } = fakePrismaForOverride({ agent: { tier: 'PLATINUM' } });
    const r = await overrideAgentTier(prisma as never, {
      agentId: 'agent_x',
      toTier: 'SILVER',
      adminUserId: 'admin_1',
      now: NOW,
    });

    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.fromTier).toBe('PLATINUM');
    expect(r.toTier).toBe('SILVER');

    const createArgs = spies.createTrans.mock.calls[0]?.[0] as {
      data: { reason: string; metadata: { notes: string | null } };
    };
    expect(createArgs.data.reason).toBe('DEMOTION_MANUAL');
    expect(createArgs.data.metadata.notes).toBeNull();
  });

  it('always wraps the writes inside $transaction (atomic with agent.update)', async () => {
    const { prisma, spies } = fakePrismaForOverride({ agent: { tier: 'SILVER' } });
    await overrideAgentTier(prisma as never, {
      agentId: 'agent_x',
      toTier: 'GOLD',
      adminUserId: 'admin_1',
      now: NOW,
    });
    expect(spies.tx).toHaveBeenCalledOnce();
  });

  it('bypasses cooldown semantically (writes regardless of recent transition)', async () => {
    // The lib doesn't consult cooldown at all — the admin's authority is
    // the gate. We assert by passing a stale agent and confirming the
    // transition was still applied.
    const { prisma, spies } = fakePrismaForOverride({ agent: { tier: 'BRONZE' } });
    const r = await overrideAgentTier(prisma as never, {
      agentId: 'agent_x',
      toTier: 'SILVER',
      adminUserId: 'admin_1',
      // Cooldown is 7d — admin override does NOT block on it.
      now: NOW,
    });
    expect(r.status).toBe('ok');
    expect(spies.createTrans).toHaveBeenCalledOnce();
  });
});
