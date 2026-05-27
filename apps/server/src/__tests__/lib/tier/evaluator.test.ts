/**
 * Tests for src/lib/tier/evaluator.ts.
 *
 * Fake Prisma — we focus on the orchestration logic (demote-wins,
 * cooldown gate + bypass, attestation status auto-expiry, transition
 * persistence shape) rather than the pure rules math, which is owned
 * by rules.test.ts.
 *
 * The fake agent shape mirrors repo/'s `prisma.agent.findUnique` select:
 *   id, tier, status, createdAt, tierChangedAt, actionsCount, tokenId,
 *   behaviorScore.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  evaluateAgentTier,
  hasUnresolvedCriticalFlag,
  resolveAttestationStatus,
} from '../../../lib/tier/evaluator.js';
import { TIER_TRANSITION_COOLDOWN_DAYS } from '../../../lib/tier/rules.js';

const NOW = new Date('2026-05-12T12:00:00Z');
const MS_DAY = 24 * 60 * 60 * 1_000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * MS_DAY);
}

// ---------------------------------------------------------------------------
// resolveAttestationStatus
// ---------------------------------------------------------------------------

describe('resolveAttestationStatus', () => {
  it('returns NONE when no attestation row exists', async () => {
    const prisma = { attestation: { findFirst: vi.fn().mockResolvedValue(null) } };
    expect(await resolveAttestationStatus(prisma as never, 'agent_x', NOW)).toEqual({
      status: 'NONE',
      expiresAt: null,
    });
  });

  it('returns VALID when the row is VALID and not yet expired', async () => {
    const prisma = {
      attestation: {
        findFirst: vi.fn().mockResolvedValue({
          status: 'VALID',
          expiresAt: new Date(NOW.getTime() + 30 * MS_DAY),
        }),
      },
    };
    const r = await resolveAttestationStatus(prisma as never, 'agent_x', NOW);
    expect(r.status).toBe('VALID');
  });

  it('auto-expires a VALID row whose expiresAt has passed', async () => {
    const prisma = {
      attestation: {
        findFirst: vi.fn().mockResolvedValue({
          status: 'VALID',
          expiresAt: daysAgo(1),
        }),
      },
    };
    const r = await resolveAttestationStatus(prisma as never, 'agent_x', NOW);
    expect(r.status).toBe('EXPIRED');
  });

  it('maps non-actionable lifecycle states (PENDING/REVOKED/SUPERSEDED) to NONE', async () => {
    for (const status of ['PENDING_VERIFICATION', 'REVOKED', 'SUPERSEDED'] as const) {
      const prisma = {
        attestation: {
          findFirst: vi.fn().mockResolvedValue({
            status,
            expiresAt: new Date(NOW.getTime() + MS_DAY),
          }),
        },
      };
      const r = await resolveAttestationStatus(prisma as never, 'agent_x', NOW);
      expect(r.status).toBe('NONE');
    }
  });

  it('passes through INVALID + EXPIRED verbatim', async () => {
    for (const status of ['INVALID', 'EXPIRED'] as const) {
      const prisma = {
        attestation: {
          findFirst: vi.fn().mockResolvedValue({ status, expiresAt: daysAgo(1) }),
        },
      };
      const r = await resolveAttestationStatus(prisma as never, 'agent_x', NOW);
      expect(r.status).toBe(status);
    }
  });
});

// ---------------------------------------------------------------------------
// hasUnresolvedCriticalFlag
// ---------------------------------------------------------------------------

describe('hasUnresolvedCriticalFlag', () => {
  it('returns true when a CRITICAL flag exists without resolvedAt', async () => {
    const prisma = {
      behaviorFlag: { findFirst: vi.fn().mockResolvedValue({ id: 'flag_1' }) },
    };
    expect(await hasUnresolvedCriticalFlag(prisma as never, 'agent_x')).toBe(true);
  });

  it('returns false when none match', async () => {
    const prisma = {
      behaviorFlag: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    expect(await hasUnresolvedCriticalFlag(prisma as never, 'agent_x')).toBe(false);
  });

  it('filters on severity CRITICAL + resolvedAt null', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { behaviorFlag: { findFirst } };
    await hasUnresolvedCriticalFlag(prisma as never, 'agent_x');
    const args = findFirst.mock.calls[0]?.[0] as {
      where: { agentId: string; severity: string; resolvedAt: null };
    };
    expect(args.where.severity).toBe('CRITICAL');
    expect(args.where.resolvedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// evaluateAgentTier — orchestration
// ---------------------------------------------------------------------------

interface FakeOpts {
  agent: null | {
    tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
    status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
    createdAt: Date;
    tierChangedAt: Date;
    actionsCount: number;
    tokenId: string | null;
    behaviorScore: number | null;
  };
  attestation?: { status: string; expiresAt: Date } | null;
  hasCritical?: boolean;
}

function fakePrismaForEvaluator(opts: FakeOpts): {
  prisma: unknown;
  spies: { update: ReturnType<typeof vi.fn>; createTrans: ReturnType<typeof vi.fn> };
} {
  const update = vi.fn().mockResolvedValue({});
  const createTrans = vi.fn().mockResolvedValue({ id: 'trans_1' });
  const prisma = {
    agent: {
      findUnique: vi
        .fn()
        .mockResolvedValue(opts.agent !== null ? { id: 'agent_x', ...opts.agent } : null),
      update,
    },
    attestation: { findFirst: vi.fn().mockResolvedValue(opts.attestation ?? null) },
    behaviorFlag: {
      findFirst: vi.fn().mockResolvedValue(opts.hasCritical === true ? { id: 'flag_1' } : null),
    },
    agentTierTransition: { create: createTrans },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<string>) =>
      cb({
        agent: { update },
        agentTierTransition: { create: createTrans },
      }),
    ),
  };
  return { prisma, spies: { update, createTrans } };
}

describe('evaluateAgentTier', () => {
  it('returns no_change/criteria_unmet when agent is missing', async () => {
    const { prisma } = fakePrismaForEvaluator({ agent: null });
    const r = await evaluateAgentTier(prisma as never, 'agent_missing', { now: NOW });
    expect(r).toEqual({ state: 'no_change', reason: 'criteria_unmet' });
  });

  it('returns no_change for REVOKED agents (terminal state)', async () => {
    const { prisma } = fakePrismaForEvaluator({
      agent: {
        tier: 'BRONZE',
        status: 'REVOKED',
        createdAt: daysAgo(100),
        tierChangedAt: daysAgo(100),
        actionsCount: 1_000,
        tokenId: null,
        behaviorScore: 0.9,
      },
    });
    const r = await evaluateAgentTier(prisma as never, 'agent_x', { now: NOW });
    expect(r.state).toBe('no_change');
  });

  it('coerces null behaviorScore to the INSUFFICIENT_DATA fallback (no transition)', async () => {
    // 0.55 is below the BRONZE→SILVER promotion threshold (0.65) and above
    // the demotion floor, so a happy-path agent with null score stays put.
    const { prisma, spies } = fakePrismaForEvaluator({
      agent: {
        tier: 'BRONZE',
        status: 'ACTIVE',
        createdAt: daysAgo(45),
        tierChangedAt: daysAgo(45),
        actionsCount: 200,
        tokenId: null,
        behaviorScore: null,
      },
    });
    const r = await evaluateAgentTier(prisma as never, 'agent_x', { now: NOW });
    expect(r).toEqual({ state: 'no_change', reason: 'criteria_unmet' });
    expect(spies.update).not.toHaveBeenCalled();
  });

  it('promotes BRONZE → SILVER on the happy path', async () => {
    const { prisma, spies } = fakePrismaForEvaluator({
      agent: {
        tier: 'BRONZE',
        status: 'ACTIVE',
        createdAt: daysAgo(45),
        tierChangedAt: daysAgo(45),
        actionsCount: 200,
        tokenId: null,
        behaviorScore: 0.8,
      },
    });
    const r = await evaluateAgentTier(prisma as never, 'agent_x', { now: NOW });
    expect(r.state).toBe('transition');
    if (r.state !== 'transition') return;
    expect(r.fromTier).toBe('BRONZE');
    expect(r.toTier).toBe('SILVER');
    expect(r.reason).toBe('promotion');

    expect(spies.update).toHaveBeenCalledOnce();
    expect(spies.createTrans).toHaveBeenCalledOnce();
    const createArgs = spies.createTrans.mock.calls[0]?.[0] as {
      data: {
        fromTier: string;
        toTier: string;
        reason: string;
        cooldownExpiresAt: Date;
      };
    };
    expect(createArgs.data.reason).toBe('PROMOTION_AUTOMATIC');
    // Cooldown set exactly 7 days ahead.
    const expectedCooldown = new Date(NOW.getTime() + TIER_TRANSITION_COOLDOWN_DAYS * MS_DAY);
    expect(createArgs.data.cooldownExpiresAt).toEqual(expectedCooldown);
  });

  it('skips promotion while in cooldown', async () => {
    const { prisma, spies } = fakePrismaForEvaluator({
      agent: {
        tier: 'BRONZE',
        status: 'ACTIVE',
        createdAt: daysAgo(45),
        tierChangedAt: daysAgo(3), // inside 7-day cooldown
        actionsCount: 200,
        tokenId: null,
        behaviorScore: 0.8,
      },
    });
    const r = await evaluateAgentTier(prisma as never, 'agent_x', { now: NOW });
    expect(r).toEqual({ state: 'no_change', reason: 'in_cooldown' });
    expect(spies.update).not.toHaveBeenCalled();
  });

  it('demote wins over promote (fail-closed) — TEE invalid forces GOLD→SILVER even with rebounding score', async () => {
    const { prisma, spies } = fakePrismaForEvaluator({
      agent: {
        tier: 'GOLD',
        status: 'ACTIVE',
        createdAt: daysAgo(300),
        tierChangedAt: daysAgo(60),
        actionsCount: 5_000,
        tokenId: null,
        behaviorScore: 0.95,
      },
      attestation: { status: 'INVALID', expiresAt: daysAgo(10) },
    });
    const r = await evaluateAgentTier(prisma as never, 'agent_x', { now: NOW });
    expect(r.state).toBe('transition');
    if (r.state !== 'transition') return;
    expect(r.toTier).toBe('SILVER');
    expect(r.reason).toBe('demotion');

    const createArgs = spies.createTrans.mock.calls[0]?.[0] as { data: { reason: string } };
    expect(createArgs.data.reason).toBe('TEE_ATTESTATION_INVALID');
  });

  it('bypasses cooldown for CRITICAL_FLAG_RAISED demotion', async () => {
    const { prisma } = fakePrismaForEvaluator({
      agent: {
        tier: 'GOLD',
        status: 'ACTIVE',
        createdAt: daysAgo(300),
        tierChangedAt: daysAgo(2), // would normally be in cooldown
        actionsCount: 5_000,
        tokenId: null,
        behaviorScore: 0.95,
      },
      hasCritical: true,
    });
    const r = await evaluateAgentTier(prisma as never, 'agent_x', { now: NOW });
    expect(r.state).toBe('transition');
    if (r.state !== 'transition') return;
    expect(r.toTier).toBe('BRONZE');
  });

  it('returns criteria_unmet when nothing promotes or demotes', async () => {
    const { prisma, spies } = fakePrismaForEvaluator({
      agent: {
        tier: 'SILVER',
        status: 'ACTIVE',
        createdAt: daysAgo(200),
        tierChangedAt: daysAgo(15),
        actionsCount: 500,
        tokenId: null,
        behaviorScore: 0.7, // mid-range: no promotion (needs 0.8), no demotion (>0.45)
      },
    });
    const r = await evaluateAgentTier(prisma as never, 'agent_x', { now: NOW });
    expect(r).toEqual({ state: 'no_change', reason: 'criteria_unmet' });
    expect(spies.update).not.toHaveBeenCalled();
  });
});
