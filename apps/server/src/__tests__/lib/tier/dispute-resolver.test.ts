/**
 * Tests for src/lib/tier/dispute-resolver.ts.
 *
 * Fake Prisma — assertions on the discriminated result shape, the
 * dispute stamping, and (for OVERTURNED) the reverse transition.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  resolveTierDispute,
  type ResolveTierDisputeResult,
} from '../../../lib/tier/dispute-resolver.js';

const NOW = new Date('2026-05-12T12:00:00Z');

type Tier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

interface FakeOpts {
  dispute:
    | null
    | {
        id: string;
        agentId: string;
        transitionId: string | null;
        status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
      };
  agent?: { id: string; tier: Tier } | null;
  transition?:
    | { id: string; fromTier: Tier; toTier: Tier; agentId: string }
    | null;
}

function fakePrismaForDispute(opts: FakeOpts): {
  prisma: unknown;
  spies: {
    disputeFindUnique: ReturnType<typeof vi.fn>;
    disputeUpdate: ReturnType<typeof vi.fn>;
    agentFindUnique: ReturnType<typeof vi.fn>;
    agentUpdate: ReturnType<typeof vi.fn>;
    transFindUnique: ReturnType<typeof vi.fn>;
    transCreate: ReturnType<typeof vi.fn>;
    tx: ReturnType<typeof vi.fn>;
  };
} {
  const disputeFindUnique = vi.fn().mockResolvedValue(opts.dispute);
  const disputeUpdate = vi.fn().mockResolvedValue({});
  const agentFindUnique = vi.fn().mockResolvedValue(opts.agent ?? null);
  const agentUpdate = vi.fn().mockResolvedValue({});
  const transFindUnique = vi.fn().mockResolvedValue(opts.transition ?? null);
  const transCreate = vi.fn().mockResolvedValue({ id: 'trans_reverse_1' });
  const tx = vi.fn(async (cb: (txClient: unknown) => Promise<string>) =>
    cb({
      tierDispute: { update: disputeUpdate },
      agent: { update: agentUpdate },
      agentTierTransition: { create: transCreate },
    }),
  );
  const prisma = {
    tierDispute: { findUnique: disputeFindUnique, update: disputeUpdate },
    agent: { findUnique: agentFindUnique, update: agentUpdate },
    agentTierTransition: { findUnique: transFindUnique, create: transCreate },
    $transaction: tx,
  };
  return {
    prisma,
    spies: { disputeFindUnique, disputeUpdate, agentFindUnique, agentUpdate, transFindUnique, transCreate, tx },
  };
}

describe('resolveTierDispute', () => {
  it('returns not_found when the dispute is missing', async () => {
    const { prisma } = fakePrismaForDispute({ dispute: null });
    const r = await resolveTierDispute(prisma as never, {
      disputeId: 'd_missing',
      resolution: 'UPHELD',
      resolutionReason: 'noop',
      adminUserId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({ status: 'not_found' } satisfies ResolveTierDisputeResult);
  });

  it('returns already_resolved when the dispute is not OPEN', async () => {
    const { prisma, spies } = fakePrismaForDispute({
      dispute: { id: 'd1', agentId: 'a1', transitionId: 't1', status: 'REJECTED' },
    });
    const r = await resolveTierDispute(prisma as never, {
      disputeId: 'd1',
      resolution: 'UPHELD',
      resolutionReason: 'admin notes',
      adminUserId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({
      status: 'already_resolved',
      currentStatus: 'REJECTED',
    } satisfies ResolveTierDisputeResult);
    expect(spies.disputeUpdate).not.toHaveBeenCalled();
  });

  describe('UPHELD', () => {
    it('closes the dispute as REJECTED with no tier movement', async () => {
      const { prisma, spies } = fakePrismaForDispute({
        dispute: { id: 'd1', agentId: 'a1', transitionId: 't1', status: 'OPEN' },
      });
      const r = await resolveTierDispute(prisma as never, {
        disputeId: 'd1',
        resolution: 'UPHELD',
        resolutionReason: 'transition was correct, dispute rejected',
        adminUserId: 'admin_1',
        now: NOW,
      });

      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect(r.finalDisputeStatus).toBe('REJECTED');
      expect(r.newTransitionId).toBeNull();
      expect(r.revertedTo).toBeNull();
      expect(r.agentId).toBe('a1');

      expect(spies.disputeUpdate).toHaveBeenCalledOnce();
      const updateArgs = spies.disputeUpdate.mock.calls[0]?.[0] as {
        where: { id: string };
        data: {
          status: string;
          resolvedByUserId: string;
          resolvedAt: Date;
          resolutionReason: string;
        };
      };
      expect(updateArgs.data.status).toBe('REJECTED');
      expect(updateArgs.data.resolvedByUserId).toBe('admin_1');
      expect(updateArgs.data.resolvedAt).toEqual(NOW);

      // No agent / transition writes
      expect(spies.agentUpdate).not.toHaveBeenCalled();
      expect(spies.transCreate).not.toHaveBeenCalled();
    });
  });

  describe('OVERTURNED', () => {
    it('returns invalid_input/no_transition_reference when dispute.transitionId is null', async () => {
      const { prisma, spies } = fakePrismaForDispute({
        dispute: { id: 'd1', agentId: 'a1', transitionId: null, status: 'OPEN' },
      });
      const r = await resolveTierDispute(prisma as never, {
        disputeId: 'd1',
        resolution: 'OVERTURNED',
        resolutionReason: 'reverting',
        adminUserId: 'admin_1',
        now: NOW,
      });
      expect(r).toEqual({
        status: 'invalid_input',
        reason: 'no_transition_reference',
      } satisfies ResolveTierDisputeResult);
      expect(spies.transCreate).not.toHaveBeenCalled();
    });

    it('returns invalid_input/transition_missing when the referenced transition was deleted', async () => {
      const { prisma } = fakePrismaForDispute({
        dispute: { id: 'd1', agentId: 'a1', transitionId: 't_gone', status: 'OPEN' },
        agent: { id: 'a1', tier: 'SILVER' },
        transition: null,
      });
      const r = await resolveTierDispute(prisma as never, {
        disputeId: 'd1',
        resolution: 'OVERTURNED',
        resolutionReason: 'reverting',
        adminUserId: 'admin_1',
        now: NOW,
      });
      expect(r.status).toBe('invalid_input');
      if (r.status === 'invalid_input') expect(r.reason).toBe('transition_missing');
    });

    it('returns inconsistent_state when agent.tier no longer matches transition.toTier', async () => {
      const { prisma, spies } = fakePrismaForDispute({
        dispute: { id: 'd1', agentId: 'a1', transitionId: 't1', status: 'OPEN' },
        // Original transition was BRONZE→SILVER; agent has since moved to GOLD.
        agent: { id: 'a1', tier: 'GOLD' },
        transition: { id: 't1', fromTier: 'BRONZE', toTier: 'SILVER', agentId: 'a1' },
      });
      const r = await resolveTierDispute(prisma as never, {
        disputeId: 'd1',
        resolution: 'OVERTURNED',
        resolutionReason: 'reverting',
        adminUserId: 'admin_1',
        now: NOW,
      });
      expect(r).toEqual({
        status: 'inconsistent_state',
        agentTier: 'GOLD',
        expectedTier: 'SILVER',
      } satisfies ResolveTierDisputeResult);
      expect(spies.disputeUpdate).not.toHaveBeenCalled();
      expect(spies.transCreate).not.toHaveBeenCalled();
    });

    it('reverts agent tier and records a reverse transition (SILVER → BRONZE)', async () => {
      const { prisma, spies } = fakePrismaForDispute({
        dispute: { id: 'd1', agentId: 'a1', transitionId: 't1', status: 'OPEN' },
        agent: { id: 'a1', tier: 'SILVER' },
        transition: { id: 't1', fromTier: 'BRONZE', toTier: 'SILVER', agentId: 'a1' },
      });
      const r = await resolveTierDispute(prisma as never, {
        disputeId: 'd1',
        resolution: 'OVERTURNED',
        resolutionReason: 'bug in scoring, transition was wrong',
        adminUserId: 'admin_1',
        now: NOW,
      });

      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect(r.finalDisputeStatus).toBe('ACCEPTED');
      expect(r.newTransitionId).toBe('trans_reverse_1');
      expect(r.revertedTo).toBe('BRONZE');

      // Tx wrapped both the dispute stamp + agent.update + transition.create
      expect(spies.tx).toHaveBeenCalledOnce();

      const agentUpdateArgs = spies.agentUpdate.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { tier: string; tierChangedAt: Date };
      };
      expect(agentUpdateArgs.data.tier).toBe('BRONZE');
      expect(agentUpdateArgs.data.tierChangedAt).toEqual(NOW);

      const transArgs = spies.transCreate.mock.calls[0]?.[0] as {
        data: {
          fromTier: string;
          toTier: string;
          reason: string;
          triggerSource: string;
          metadata: { adminId: string; disputeId: string; originalTransitionId: string };
        };
      };
      expect(transArgs.data.fromTier).toBe('SILVER');
      expect(transArgs.data.toTier).toBe('BRONZE');
      expect(transArgs.data.reason).toBe('DEMOTION_MANUAL');
      expect(transArgs.data.triggerSource).toBe('admin_dispute_overturned');
      expect(transArgs.data.metadata.adminId).toBe('admin_1');
      expect(transArgs.data.metadata.disputeId).toBe('d1');
      expect(transArgs.data.metadata.originalTransitionId).toBe('t1');
    });

    it('reverts upward when the original transition was a demotion (GOLD → SILVER) — overturning sends agent back to GOLD', async () => {
      const { prisma, spies } = fakePrismaForDispute({
        dispute: { id: 'd2', agentId: 'a2', transitionId: 't2', status: 'OPEN' },
        agent: { id: 'a2', tier: 'SILVER' },
        transition: { id: 't2', fromTier: 'GOLD', toTier: 'SILVER', agentId: 'a2' },
      });
      const r = await resolveTierDispute(prisma as never, {
        disputeId: 'd2',
        resolution: 'OVERTURNED',
        resolutionReason: 'TEE failure was transient, restoring GOLD',
        adminUserId: 'admin_2',
        now: NOW,
      });

      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect(r.revertedTo).toBe('GOLD');

      const transArgs = spies.transCreate.mock.calls[0]?.[0] as {
        data: { fromTier: string; toTier: string; reason: string };
      };
      expect(transArgs.data.fromTier).toBe('SILVER');
      expect(transArgs.data.toTier).toBe('GOLD');
      expect(transArgs.data.reason).toBe('PROMOTION_MANUAL');
    });
  });
});
