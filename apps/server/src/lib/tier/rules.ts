/**
 * Tier promotion/demotion rules — Camada 4 §3.
 *
 * Pure functions. Pass in snapshots, get back a structured decision. The
 * orchestrator (`evaluator.ts`) reads the DB, calls these, and persists.
 * Keeping the math pure lets us unit-test every branch (and there are
 * many — promotion has 5+ checks per tier, demotion has hysteresis).
 *
 * Three properties the rules guarantee:
 *
 *  - **Hysteresis**: GOLD demotes when score < 0.65, not 0.80. SILVER
 *    demotes when score < 0.45, not 0.65. The deadband prevents
 *    ping-pong between tiers at the promotion threshold.
 *
 *  - **Cooldown**: a 7-day window after any transition during which
 *    further automatic transitions are blocked. Critical signals
 *    (CRITICAL flag, TEE invalid) bypass cooldown — the safety case
 *    wins over stability.
 *
 *  - **Demotion wins ties**: if both promotion and demotion are
 *    eligible (e.g. score rebounded but TEE expired), demotion is
 *    applied. Fail-closed.
 *
 * Note on PLATINUM: the schema's AgentTier enum includes a PLATINUM
 * value reserved for a future progression beyond GOLD. The Camada 4
 * rules treat PLATINUM as terminal (no further promotion), and the
 * evaluator never demotes from it automatically — only manual admin
 * overrides can move a PLATINUM agent. Until the spec for PLATINUM
 * lands, no agent should reach this tier through these rules.
 */

import type { AgentTier, TransitionReason } from '@prisma/client';

// ---------------------------------------------------------------------------
// Constants — see spec §3 for derivations.
// ---------------------------------------------------------------------------

/** Days an agent must hold a tier before automatic promotion. */
export const MIN_TENURE_DAYS = 30;
/** Lifetime action count required for Bronze→Silver. */
export const MIN_ACTIONS_FOR_SILVER = 100;

/** Promotion thresholds. */
export const PROMOTE_TO_SILVER_SCORE = 0.65;
export const PROMOTE_TO_GOLD_SCORE = 0.8;

/** Demotion thresholds (hysteresis — strictly lower than promotion). */
export const DEMOTE_FROM_GOLD_SCORE = 0.65;
export const DEMOTE_FROM_SILVER_SCORE = 0.45;

/** Grace period after TEE attestation expires before forcing demotion. */
export const TEE_EXPIRY_GRACE_DAYS = 14;

/** Days a transition is "fresh" — no further automatic transitions in
 *  this window unless a bypass reason applies. */
export const TIER_TRANSITION_COOLDOWN_DAYS = 7;

/** Bypass reasons skip the cooldown gate. Defined as a literal set so
 *  TypeScript narrows correctly inside the evaluator. */
export const COOLDOWN_BYPASS_REASONS: readonly TransitionReason[] = [
  'CRITICAL_FLAG_RAISED',
  'TEE_ATTESTATION_INVALID',
];

// ---------------------------------------------------------------------------
// Input snapshots
// ---------------------------------------------------------------------------

export interface AgentTierSnapshot {
  tier: AgentTier;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  registeredAt: Date;
  tierUpdatedAt: Date;
  actionsCount: number;
  /** Pre-Phase-6 this is always null; the rules waive the requirement
   *  via {@link RulesContext.onChainPhaseActive}. */
  tokenId: string | null;
}

export interface ScoreSnapshot {
  score: number;
}

export type AttestationStatus = 'NONE' | 'VALID' | 'EXPIRED' | 'INVALID';

export interface AttestationSnapshot {
  status: AttestationStatus;
  /** Required when status === 'EXPIRED' so the grace-period math has
   *  something to subtract from. */
  expiresAt: Date | null;
}

export interface RulesContext {
  /** True when on-chain ERC-8004 mint is mandatory (Phase 6+). */
  onChainPhaseActive: boolean;
  /** True when any unresolved CRITICAL-severity flag is on the agent.
   *  Promotion blocks on this; demotion forces BRONZE on this. */
  hasCriticalFlag: boolean;
  /** Test seam — defaults to wall clock. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export interface TierCheck {
  criterion: string;
  passed: boolean;
  detail: Record<string, unknown>;
}

export interface PromotionDecision {
  fromTier: AgentTier;
  proposedToTier: AgentTier | null;
  ready: boolean;
  checks: TierCheck[];
}

export interface DemotionDecision {
  fromTier: AgentTier;
  proposedToTier: AgentTier | null;
  reason: TransitionReason | null;
  checks: TierCheck[];
}

// ---------------------------------------------------------------------------
// Utilities (exported for tests)
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/** Whole-day difference between two instants, computed as floor.
 *  `now - earlier`. Negative when earlier is in the future (defensive). */
export function daysBetween(earlier: Date, now: Date): number {
  const diff = now.getTime() - earlier.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / MS_PER_DAY);
}

/** Inside the cooldown window since the last tier change. */
export function isInCooldown(agent: AgentTierSnapshot, now: Date = new Date()): boolean {
  return daysBetween(agent.tierUpdatedAt, now) < TIER_TRANSITION_COOLDOWN_DAYS;
}

/** Cooldown can be skipped on a per-reason basis. */
export function isCooldownBypassReason(reason: TransitionReason): boolean {
  return COOLDOWN_BYPASS_REASONS.includes(reason);
}

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

export function evaluatePromotion(
  agent: AgentTierSnapshot,
  score: ScoreSnapshot,
  attestation: AttestationSnapshot,
  context: RulesContext,
): PromotionDecision {
  const now = context.now ?? new Date();

  if (agent.tier === 'BRONZE') {
    const daysSinceReg = daysBetween(agent.registeredAt, now);
    const checks: TierCheck[] = [
      {
        criterion: 'days_since_registration_>=_30',
        passed: daysSinceReg >= MIN_TENURE_DAYS,
        detail: { days: daysSinceReg },
      },
      {
        criterion: 'actions_count_>=_100',
        passed: agent.actionsCount >= MIN_ACTIONS_FOR_SILVER,
        detail: { count: agent.actionsCount },
      },
      {
        criterion: 'behavior_score_>=_0.65',
        passed: score.score >= PROMOTE_TO_SILVER_SCORE,
        detail: { score: score.score },
      },
      {
        criterion: 'no_critical_flags',
        passed: !context.hasCriticalFlag,
        detail: {},
      },
      {
        criterion: 'status_active',
        passed: agent.status === 'ACTIVE',
        detail: { status: agent.status },
      },
    ];
    const ready = checks.every((c) => c.passed);
    return { fromTier: 'BRONZE', proposedToTier: ready ? 'SILVER' : null, ready, checks };
  }

  if (agent.tier === 'SILVER') {
    const daysSinceTier = daysBetween(agent.tierUpdatedAt, now);
    const checks: TierCheck[] = [
      {
        criterion: 'days_in_silver_>=_30',
        passed: daysSinceTier >= MIN_TENURE_DAYS,
        detail: { days: daysSinceTier },
      },
      {
        criterion: 'tee_attestation_valid',
        passed: attestation.status === 'VALID',
        detail: { status: attestation.status },
      },
      {
        criterion: 'behavior_score_>=_0.80',
        passed: score.score >= PROMOTE_TO_GOLD_SCORE,
        detail: { score: score.score },
      },
      {
        criterion: 'no_critical_flags',
        passed: !context.hasCriticalFlag,
        detail: {},
      },
      {
        criterion: 'status_active',
        passed: agent.status === 'ACTIVE',
        detail: { status: agent.status },
      },
    ];

    // Token-id check is phase-gated: in pre-Phase-6 the chain is dormant
    // and tokenId is intentionally null for everyone, so we waive the
    // requirement. A retroactive mint cron populates tokenIds when the
    // on-chain phase activates.
    if (context.onChainPhaseActive) {
      checks.push({
        criterion: 'token_id_minted',
        passed: agent.tokenId !== null,
        detail: { tokenId: agent.tokenId },
      });
    } else {
      checks.push({
        criterion: 'onchain_phase_deferred',
        passed: true,
        detail: { phase: 'pre-onchain', note: 'tokenId requirement waived until Phase 6' },
      });
    }

    const ready = checks.every((c) => c.passed);
    return { fromTier: 'SILVER', proposedToTier: ready ? 'GOLD' : null, ready, checks };
  }

  // GOLD + PLATINUM have no higher tier under the current taxonomy.
  return { fromTier: agent.tier, proposedToTier: null, ready: false, checks: [] };
}

// ---------------------------------------------------------------------------
// Demotion
// ---------------------------------------------------------------------------

export function evaluateDemotion(
  agent: AgentTierSnapshot,
  score: ScoreSnapshot,
  attestation: AttestationSnapshot,
  context: RulesContext,
): DemotionDecision {
  const now = context.now ?? new Date();

  // Critical flag forces BRONZE from any tier. Checked first so it
  // wins over (and bypasses) tier-specific demotion paths. PLATINUM is
  // intentionally excluded here — PLATINUM moves only on admin override.
  if (
    context.hasCriticalFlag &&
    agent.tier !== 'BRONZE' &&
    agent.tier !== 'PLATINUM'
  ) {
    return {
      fromTier: agent.tier,
      proposedToTier: 'BRONZE',
      reason: 'CRITICAL_FLAG_RAISED',
      checks: [{ criterion: 'critical_flag_active', passed: true, detail: {} }],
    };
  }

  if (agent.tier === 'GOLD') {
    if (attestation.status === 'INVALID') {
      return {
        fromTier: 'GOLD',
        proposedToTier: 'SILVER',
        reason: 'TEE_ATTESTATION_INVALID',
        checks: [
          { criterion: 'tee_invalid', passed: true, detail: { status: attestation.status } },
        ],
      };
    }
    if (attestation.status === 'EXPIRED' && attestation.expiresAt !== null) {
      const daysSinceExpiry = daysBetween(attestation.expiresAt, now);
      if (daysSinceExpiry > TEE_EXPIRY_GRACE_DAYS) {
        return {
          fromTier: 'GOLD',
          proposedToTier: 'SILVER',
          reason: 'TEE_ATTESTATION_EXPIRED',
          checks: [
            {
              criterion: 'tee_expired_grace_passed',
              passed: true,
              detail: { days: daysSinceExpiry },
            },
          ],
        };
      }
    }
    if (score.score < DEMOTE_FROM_GOLD_SCORE) {
      return {
        fromTier: 'GOLD',
        proposedToTier: 'SILVER',
        reason: 'DEMOTION_AUTOMATIC',
        checks: [
          {
            criterion: 'score_below_0.65',
            passed: true,
            detail: { score: score.score },
          },
        ],
      };
    }
  }

  if (agent.tier === 'SILVER') {
    if (score.score < DEMOTE_FROM_SILVER_SCORE) {
      return {
        fromTier: 'SILVER',
        proposedToTier: 'BRONZE',
        reason: 'DEMOTION_AUTOMATIC',
        checks: [
          {
            criterion: 'score_below_0.45',
            passed: true,
            detail: { score: score.score },
          },
        ],
      };
    }
  }

  return { fromTier: agent.tier, proposedToTier: null, reason: null, checks: [] };
}
