/**
 * Tests for src/lib/badges/compute.ts — pure function over a snapshot.
 *
 * No DB. We dial each branch by varying one snapshot field at a time.
 */

import { describe, expect, it } from 'vitest';

import {
  KEY_ROTATION_WARNING_DAYS,
  MOLTVERSE_INFERRED_MIN_USED,
  VETERAN_MIN_DAYS,
  computeBadges,
  type Badge,
  type BadgeAgentSnapshot,
  type BadgeContext,
} from '../../../lib/badges/compute.js';

const NOW = new Date('2026-05-12T12:00:00Z');
const MS_DAY = 86_400_000;

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * MS_DAY);
}

const BASE_AGENT: BadgeAgentSnapshot = {
  tier: 'BRONZE',
  tierUpdatedAt: daysAgo(60),
  status: 'ACTIVE',
  registeredAt: daysAgo(60),
  worldIdNullifier: null,
  worldIdVerifiedAt: null,
  firstLLMProxyUseAt: null,
};

const BASE_CTX: BadgeContext = {
  attestation: null,
  llmProxyConsumed: 0,
  pioneerRank: null,
  recentKeyRotation: null,
  now: NOW,
};

function typesOf(badges: Badge[]): string[] {
  return badges.map((b) => b.type);
}

// ---------------------------------------------------------------------------
// Tier badge
// ---------------------------------------------------------------------------

describe('computeBadges tier badge', () => {
  it('always emits exactly one tier badge matching the agent tier', () => {
    expect(typesOf(computeBadges({ ...BASE_AGENT, tier: 'BRONZE' }, BASE_CTX))[0]).toBe(
      'TIER_BRONZE',
    );
    expect(typesOf(computeBadges({ ...BASE_AGENT, tier: 'SILVER' }, BASE_CTX))[0]).toBe(
      'TIER_SILVER',
    );
    expect(typesOf(computeBadges({ ...BASE_AGENT, tier: 'GOLD' }, BASE_CTX))[0]).toBe('TIER_GOLD');
    expect(typesOf(computeBadges({ ...BASE_AGENT, tier: 'PLATINUM' }, BASE_CTX))[0]).toBe(
      'TIER_PLATINUM',
    );
  });
});

// ---------------------------------------------------------------------------
// HUMAN_BACKED_OWNER + DIAMOND
// ---------------------------------------------------------------------------

describe('computeBadges HUMAN_BACKED_OWNER + DIAMOND', () => {
  it('awards HUMAN_BACKED_OWNER when worldId+verifiedAt set', () => {
    const agent = {
      ...BASE_AGENT,
      worldIdNullifier: 'wid_abc',
      worldIdVerifiedAt: daysAgo(10),
    };
    expect(typesOf(computeBadges(agent, BASE_CTX))).toContain('HUMAN_BACKED_OWNER');
  });

  it('does NOT award DIAMOND when tier is below GOLD', () => {
    const agent = {
      ...BASE_AGENT,
      tier: 'SILVER' as const,
      worldIdNullifier: 'wid_abc',
      worldIdVerifiedAt: daysAgo(10),
    };
    expect(typesOf(computeBadges(agent, BASE_CTX))).not.toContain('DIAMOND');
  });

  it('awards DIAMOND when tier=GOLD AND worldId linked', () => {
    const agent = {
      ...BASE_AGENT,
      tier: 'GOLD' as const,
      worldIdNullifier: 'wid_abc',
      worldIdVerifiedAt: daysAgo(10),
    };
    const types = typesOf(computeBadges(agent, BASE_CTX));
    expect(types).toContain('DIAMOND');
    expect(types).toContain('HUMAN_BACKED_OWNER');
  });

  it('awards DIAMOND for PLATINUM tier as well', () => {
    const agent = {
      ...BASE_AGENT,
      tier: 'PLATINUM' as const,
      worldIdNullifier: 'wid_abc',
      worldIdVerifiedAt: daysAgo(10),
    };
    expect(typesOf(computeBadges(agent, BASE_CTX))).toContain('DIAMOND');
  });

  it('does not award either when worldId fields are null', () => {
    const agent = { ...BASE_AGENT, tier: 'GOLD' as const };
    const types = typesOf(computeBadges(agent, BASE_CTX));
    expect(types).not.toContain('HUMAN_BACKED_OWNER');
    expect(types).not.toContain('DIAMOND');
  });
});

// ---------------------------------------------------------------------------
// MOLTVERSE_INFERRED
// ---------------------------------------------------------------------------

describe('computeBadges MOLTVERSE_INFERRED', () => {
  it('does not award below the threshold', () => {
    const ctx = { ...BASE_CTX, llmProxyConsumed: MOLTVERSE_INFERRED_MIN_USED - 1 };
    expect(typesOf(computeBadges(BASE_AGENT, ctx))).not.toContain('MOLTVERSE_INFERRED');
  });

  it('awards at the threshold (inclusive)', () => {
    const ctx = { ...BASE_CTX, llmProxyConsumed: MOLTVERSE_INFERRED_MIN_USED };
    expect(typesOf(computeBadges(BASE_AGENT, ctx))).toContain('MOLTVERSE_INFERRED');
  });

  it('uses firstLLMProxyUseAt for earnedAt when present', () => {
    const firstUse = daysAgo(20);
    const agent = { ...BASE_AGENT, firstLLMProxyUseAt: firstUse };
    const ctx = { ...BASE_CTX, llmProxyConsumed: 100 };
    const badge = computeBadges(agent, ctx).find((b) => b.type === 'MOLTVERSE_INFERRED');
    expect(badge?.earnedAt).toBe(firstUse.toISOString());
  });

  it('falls back to registeredAt when firstLLMProxyUseAt is null', () => {
    const ctx = { ...BASE_CTX, llmProxyConsumed: 100 };
    const badge = computeBadges(BASE_AGENT, ctx).find((b) => b.type === 'MOLTVERSE_INFERRED');
    expect(badge?.earnedAt).toBe(BASE_AGENT.registeredAt.toISOString());
  });
});

// ---------------------------------------------------------------------------
// TEE_ATTESTED
// ---------------------------------------------------------------------------

describe('computeBadges TEE_ATTESTED', () => {
  it('awards while attestation is fresh', () => {
    const ctx: BadgeContext = {
      ...BASE_CTX,
      attestation: {
        attestedAt: daysAgo(2),
        expiresAt: new Date(NOW.getTime() + 30 * MS_DAY),
        kind: 'phala',
        validator: '0xvalidator',
      },
    };
    const badge = computeBadges(BASE_AGENT, ctx).find((b) => b.type === 'TEE_ATTESTED');
    expect(badge).toBeDefined();
    expect(badge?.expiresAt).toBe(ctx.attestation?.expiresAt.toISOString());
    expect(badge?.metadata).toEqual({ kind: 'phala', validator: '0xvalidator' });
  });

  it('does NOT award once attestation has expired', () => {
    const ctx: BadgeContext = {
      ...BASE_CTX,
      attestation: {
        attestedAt: daysAgo(120),
        expiresAt: daysAgo(1),
      },
    };
    expect(typesOf(computeBadges(BASE_AGENT, ctx))).not.toContain('TEE_ATTESTED');
  });
});

// ---------------------------------------------------------------------------
// PIONEER
// ---------------------------------------------------------------------------

describe('computeBadges PIONEER', () => {
  it('awards when pioneerRank is within the cohort cap', () => {
    const ctx = { ...BASE_CTX, pioneerRank: 7 };
    const badge = computeBadges(BASE_AGENT, ctx).find((b) => b.type === 'PIONEER');
    expect(badge).toBeDefined();
    expect(badge?.metadata).toEqual({ rank: 7 });
  });

  it('does not award when pioneerRank exceeds the cap', () => {
    const ctx = { ...BASE_CTX, pioneerRank: 101 };
    expect(typesOf(computeBadges(BASE_AGENT, ctx))).not.toContain('PIONEER');
  });

  it('does not award when pioneerRank is null', () => {
    expect(typesOf(computeBadges(BASE_AGENT, BASE_CTX))).not.toContain('PIONEER');
  });
});

// ---------------------------------------------------------------------------
// VETERAN
// ---------------------------------------------------------------------------

describe('computeBadges VETERAN', () => {
  it('awards once >= 365 days have passed and status is ACTIVE', () => {
    const agent = { ...BASE_AGENT, registeredAt: daysAgo(VETERAN_MIN_DAYS) };
    expect(typesOf(computeBadges(agent, BASE_CTX))).toContain('VETERAN');
  });

  it('does not award when below the threshold', () => {
    const agent = { ...BASE_AGENT, registeredAt: daysAgo(VETERAN_MIN_DAYS - 1) };
    expect(typesOf(computeBadges(agent, BASE_CTX))).not.toContain('VETERAN');
  });

  it('does not award when status != ACTIVE', () => {
    const agent = {
      ...BASE_AGENT,
      registeredAt: daysAgo(VETERAN_MIN_DAYS + 100),
      status: 'SUSPENDED' as const,
    };
    expect(typesOf(computeBadges(agent, BASE_CTX))).not.toContain('VETERAN');
  });
});

// ---------------------------------------------------------------------------
// KEY_ROTATED_RECENTLY
// ---------------------------------------------------------------------------

describe('computeBadges KEY_ROTATED_RECENTLY', () => {
  it('awards a warning while rotation is within window', () => {
    const ctx: BadgeContext = {
      ...BASE_CTX,
      recentKeyRotation: { rotatedAt: daysAgo(10), reason: 'SCHEDULED_ROTATION' },
    };
    const badge = computeBadges(BASE_AGENT, ctx).find((b) => b.type === 'KEY_ROTATED_RECENTLY');
    expect(badge).toBeDefined();
    expect(badge?.visualClass).toBe('warning');
    expect(badge?.metadata).toEqual({ reason: 'SCHEDULED_ROTATION' });
  });

  it('does not award once the rotation falls outside the window', () => {
    const ctx: BadgeContext = {
      ...BASE_CTX,
      recentKeyRotation: { rotatedAt: daysAgo(KEY_ROTATION_WARNING_DAYS), reason: null },
    };
    expect(typesOf(computeBadges(BASE_AGENT, ctx))).not.toContain('KEY_ROTATED_RECENTLY');
  });
});
