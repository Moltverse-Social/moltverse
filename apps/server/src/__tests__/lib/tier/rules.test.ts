/**
 * Tests for src/lib/tier/rules.ts.
 *
 * Pure functions — no DB, no time mocks. We pass every threshold via
 * the `now`/`context` test seam.
 */

import { describe, expect, it } from 'vitest';

import {
  COOLDOWN_BYPASS_REASONS,
  DEMOTE_FROM_GOLD_SCORE,
  DEMOTE_FROM_SILVER_SCORE,
  MIN_ACTIONS_FOR_SILVER,
  MIN_TENURE_DAYS,
  PROMOTE_TO_GOLD_SCORE,
  PROMOTE_TO_SILVER_SCORE,
  TEE_EXPIRY_GRACE_DAYS,
  TIER_TRANSITION_COOLDOWN_DAYS,
  daysBetween,
  evaluateDemotion,
  evaluatePromotion,
  isCooldownBypassReason,
  isInCooldown,
  type AgentTierSnapshot,
  type AttestationSnapshot,
  type RulesContext,
  type ScoreSnapshot,
} from '../../../lib/tier/rules.js';

const NOW = new Date('2026-05-12T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1_000);
}

const HAPPY_BRONZE: AgentTierSnapshot = {
  tier: 'BRONZE',
  status: 'ACTIVE',
  registeredAt: daysAgo(45),
  tierUpdatedAt: daysAgo(45),
  actionsCount: 150,
  tokenId: null,
};

const HAPPY_SILVER: AgentTierSnapshot = {
  tier: 'SILVER',
  status: 'ACTIVE',
  registeredAt: daysAgo(120),
  tierUpdatedAt: daysAgo(45),
  actionsCount: 1_000,
  tokenId: null,
};

const HAPPY_GOLD: AgentTierSnapshot = {
  tier: 'GOLD',
  status: 'ACTIVE',
  registeredAt: daysAgo(300),
  tierUpdatedAt: daysAgo(60),
  actionsCount: 5_000,
  tokenId: null,
};

const HAPPY_PLATINUM: AgentTierSnapshot = {
  tier: 'PLATINUM',
  status: 'ACTIVE',
  registeredAt: daysAgo(500),
  tierUpdatedAt: daysAgo(90),
  actionsCount: 10_000,
  tokenId: null,
};

const PROMOTABLE_SCORE: ScoreSnapshot = { score: 0.85 };
const PROMOTABLE_TEE: AttestationSnapshot = { status: 'VALID', expiresAt: null };
const NO_TEE: AttestationSnapshot = { status: 'NONE', expiresAt: null };

const DEFAULT_CTX: RulesContext = {
  onChainPhaseActive: false,
  hasCriticalFlag: false,
  now: NOW,
};

// ---------------------------------------------------------------------------
// utilities
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns the whole-day floor of the difference', () => {
    expect(daysBetween(daysAgo(7), NOW)).toBe(7);
    expect(daysBetween(daysAgo(6.4), NOW)).toBe(6);
  });
  it('returns 0 when the earlier date is in the future', () => {
    const future = new Date(NOW.getTime() + 86_400_000);
    expect(daysBetween(future, NOW)).toBe(0);
  });
});

describe('isInCooldown / isCooldownBypassReason', () => {
  it('is in cooldown when last tier change was within window', () => {
    const agent: AgentTierSnapshot = { ...HAPPY_BRONZE, tierUpdatedAt: daysAgo(3) };
    expect(isInCooldown(agent, NOW)).toBe(true);
  });
  it('is NOT in cooldown after the window passes', () => {
    const agent: AgentTierSnapshot = {
      ...HAPPY_BRONZE,
      tierUpdatedAt: daysAgo(TIER_TRANSITION_COOLDOWN_DAYS + 1),
    };
    expect(isInCooldown(agent, NOW)).toBe(false);
  });
  it('recognises the documented bypass reasons', () => {
    expect(isCooldownBypassReason('CRITICAL_FLAG_RAISED')).toBe(true);
    expect(isCooldownBypassReason('TEE_ATTESTATION_INVALID')).toBe(true);
    expect(isCooldownBypassReason('PROMOTION_AUTOMATIC')).toBe(false);
    expect(COOLDOWN_BYPASS_REASONS).toEqual(['CRITICAL_FLAG_RAISED', 'TEE_ATTESTATION_INVALID']);
  });
});

// ---------------------------------------------------------------------------
// Promotion — BRONZE → SILVER
// ---------------------------------------------------------------------------

describe('evaluatePromotion BRONZE→SILVER', () => {
  it('promotes when every check passes', () => {
    const r = evaluatePromotion(HAPPY_BRONZE, PROMOTABLE_SCORE, NO_TEE, DEFAULT_CTX);
    expect(r.fromTier).toBe('BRONZE');
    expect(r.proposedToTier).toBe('SILVER');
    expect(r.ready).toBe(true);
  });

  it('rejects when tenure < 30d', () => {
    const young = { ...HAPPY_BRONZE, registeredAt: daysAgo(MIN_TENURE_DAYS - 1) };
    const r = evaluatePromotion(young, PROMOTABLE_SCORE, NO_TEE, DEFAULT_CTX);
    expect(r.proposedToTier).toBeNull();
    expect(r.checks.find((c) => c.criterion === 'days_since_registration_>=_30')?.passed).toBe(
      false,
    );
  });

  it('rejects when actions < 100', () => {
    const idle = { ...HAPPY_BRONZE, actionsCount: MIN_ACTIONS_FOR_SILVER - 1 };
    const r = evaluatePromotion(idle, PROMOTABLE_SCORE, NO_TEE, DEFAULT_CTX);
    expect(r.proposedToTier).toBeNull();
  });

  it('rejects when score < 0.65', () => {
    const r = evaluatePromotion(
      HAPPY_BRONZE,
      { score: PROMOTE_TO_SILVER_SCORE - 0.01 },
      NO_TEE,
      DEFAULT_CTX,
    );
    expect(r.proposedToTier).toBeNull();
  });

  it('rejects on critical flag', () => {
    const r = evaluatePromotion(HAPPY_BRONZE, PROMOTABLE_SCORE, NO_TEE, {
      ...DEFAULT_CTX,
      hasCriticalFlag: true,
    });
    expect(r.proposedToTier).toBeNull();
  });

  it('rejects when status not ACTIVE', () => {
    const susp = { ...HAPPY_BRONZE, status: 'SUSPENDED' as const };
    const r = evaluatePromotion(susp, PROMOTABLE_SCORE, NO_TEE, DEFAULT_CTX);
    expect(r.proposedToTier).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Promotion — SILVER → GOLD
// ---------------------------------------------------------------------------

describe('evaluatePromotion SILVER→GOLD', () => {
  it('promotes when all checks pass (pre-on-chain phase waives tokenId)', () => {
    const r = evaluatePromotion(HAPPY_SILVER, PROMOTABLE_SCORE, PROMOTABLE_TEE, DEFAULT_CTX);
    expect(r.proposedToTier).toBe('GOLD');
    expect(r.checks.find((c) => c.criterion === 'onchain_phase_deferred')?.passed).toBe(true);
  });

  it('requires tokenId once on-chain phase is active', () => {
    const r = evaluatePromotion(HAPPY_SILVER, PROMOTABLE_SCORE, PROMOTABLE_TEE, {
      ...DEFAULT_CTX,
      onChainPhaseActive: true,
    });
    expect(r.proposedToTier).toBeNull();
    expect(r.checks.find((c) => c.criterion === 'token_id_minted')?.passed).toBe(false);

    const minted = { ...HAPPY_SILVER, tokenId: '42' };
    const r2 = evaluatePromotion(minted, PROMOTABLE_SCORE, PROMOTABLE_TEE, {
      ...DEFAULT_CTX,
      onChainPhaseActive: true,
    });
    expect(r2.proposedToTier).toBe('GOLD');
  });

  it('rejects without a valid TEE attestation', () => {
    const r = evaluatePromotion(HAPPY_SILVER, PROMOTABLE_SCORE, NO_TEE, DEFAULT_CTX);
    expect(r.proposedToTier).toBeNull();
  });

  it('rejects on score < 0.80', () => {
    const r = evaluatePromotion(
      HAPPY_SILVER,
      { score: PROMOTE_TO_GOLD_SCORE - 0.01 },
      PROMOTABLE_TEE,
      DEFAULT_CTX,
    );
    expect(r.proposedToTier).toBeNull();
  });

  it('rejects when SILVER tenure < 30d', () => {
    const young = { ...HAPPY_SILVER, tierUpdatedAt: daysAgo(MIN_TENURE_DAYS - 1) };
    const r = evaluatePromotion(young, PROMOTABLE_SCORE, PROMOTABLE_TEE, DEFAULT_CTX);
    expect(r.proposedToTier).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Promotion — GOLD + PLATINUM are terminal (no auto-promotion)
// ---------------------------------------------------------------------------

describe('evaluatePromotion terminal tiers', () => {
  it('GOLD never auto-promotes (no higher tier in current rules)', () => {
    const r = evaluatePromotion(HAPPY_GOLD, PROMOTABLE_SCORE, PROMOTABLE_TEE, DEFAULT_CTX);
    expect(r.proposedToTier).toBeNull();
    expect(r.ready).toBe(false);
  });
  it('PLATINUM never auto-promotes', () => {
    const r = evaluatePromotion(HAPPY_PLATINUM, PROMOTABLE_SCORE, PROMOTABLE_TEE, DEFAULT_CTX);
    expect(r.proposedToTier).toBeNull();
    expect(r.ready).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Demotion
// ---------------------------------------------------------------------------

describe('evaluateDemotion', () => {
  it('returns no transition when nothing is wrong', () => {
    const r = evaluateDemotion(HAPPY_GOLD, PROMOTABLE_SCORE, PROMOTABLE_TEE, DEFAULT_CTX);
    expect(r.proposedToTier).toBeNull();
    expect(r.reason).toBeNull();
  });

  it('forces BRONZE on a critical flag (from any tier)', () => {
    const r = evaluateDemotion(HAPPY_GOLD, PROMOTABLE_SCORE, PROMOTABLE_TEE, {
      ...DEFAULT_CTX,
      hasCriticalFlag: true,
    });
    expect(r.proposedToTier).toBe('BRONZE');
    expect(r.reason).toBe('CRITICAL_FLAG_RAISED');
  });

  it('does not demote BRONZE from critical flag (already at floor)', () => {
    const r = evaluateDemotion(HAPPY_BRONZE, PROMOTABLE_SCORE, NO_TEE, {
      ...DEFAULT_CTX,
      hasCriticalFlag: true,
    });
    expect(r.proposedToTier).toBeNull();
  });

  it('does not auto-demote PLATINUM on critical flag (admin-only tier)', () => {
    const r = evaluateDemotion(HAPPY_PLATINUM, PROMOTABLE_SCORE, PROMOTABLE_TEE, {
      ...DEFAULT_CTX,
      hasCriticalFlag: true,
    });
    expect(r.proposedToTier).toBeNull();
  });

  it('demotes GOLD→SILVER when TEE attestation becomes INVALID', () => {
    const r = evaluateDemotion(
      HAPPY_GOLD,
      PROMOTABLE_SCORE,
      { status: 'INVALID', expiresAt: null },
      DEFAULT_CTX,
    );
    expect(r.proposedToTier).toBe('SILVER');
    expect(r.reason).toBe('TEE_ATTESTATION_INVALID');
  });

  it('keeps GOLD inside the 14-day TEE expiry grace period', () => {
    const r = evaluateDemotion(
      HAPPY_GOLD,
      PROMOTABLE_SCORE,
      { status: 'EXPIRED', expiresAt: daysAgo(TEE_EXPIRY_GRACE_DAYS) },
      DEFAULT_CTX,
    );
    expect(r.proposedToTier).toBeNull();
  });

  it('demotes GOLD→SILVER after the TEE expiry grace passes', () => {
    const r = evaluateDemotion(
      HAPPY_GOLD,
      PROMOTABLE_SCORE,
      { status: 'EXPIRED', expiresAt: daysAgo(TEE_EXPIRY_GRACE_DAYS + 1) },
      DEFAULT_CTX,
    );
    expect(r.proposedToTier).toBe('SILVER');
    expect(r.reason).toBe('TEE_ATTESTATION_EXPIRED');
  });

  it('demotes GOLD→SILVER only when score crosses the hysteresis threshold (0.65, not 0.80)', () => {
    // Score below promotion threshold but above demotion threshold — stays GOLD.
    const stay = evaluateDemotion(HAPPY_GOLD, { score: 0.7 }, PROMOTABLE_TEE, DEFAULT_CTX);
    expect(stay.proposedToTier).toBeNull();

    const fall = evaluateDemotion(
      HAPPY_GOLD,
      { score: DEMOTE_FROM_GOLD_SCORE - 0.01 },
      PROMOTABLE_TEE,
      DEFAULT_CTX,
    );
    expect(fall.proposedToTier).toBe('SILVER');
    expect(fall.reason).toBe('DEMOTION_AUTOMATIC');
  });

  it('demotes SILVER→BRONZE only when score < 0.45 (hysteresis from 0.65)', () => {
    const stay = evaluateDemotion(HAPPY_SILVER, { score: 0.55 }, PROMOTABLE_TEE, DEFAULT_CTX);
    expect(stay.proposedToTier).toBeNull();

    const fall = evaluateDemotion(
      HAPPY_SILVER,
      { score: DEMOTE_FROM_SILVER_SCORE - 0.01 },
      PROMOTABLE_TEE,
      DEFAULT_CTX,
    );
    expect(fall.proposedToTier).toBe('BRONZE');
    expect(fall.reason).toBe('DEMOTION_AUTOMATIC');
  });
});
