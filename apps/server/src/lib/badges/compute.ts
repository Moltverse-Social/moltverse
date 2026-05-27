/**
 * Badge computation — Camada 4 §4.
 *
 * Badges are derived, not stored. {@link computeBadges} is a pure function
 * that consumes a snapshot of everything a badge depends on and returns
 * the list. Loading those snapshots from the DB lives in `loaders.ts` so
 * unit tests can drive every branch without a database.
 *
 * The split matters because some badges are time-sensitive (TEE expires,
 * KEY_ROTATED_RECENTLY decays after 30 days) — keeping the math pure
 * means we don't carry a `now()` dependency into the data layer.
 */

import type { AgentTier } from '@prisma/client';

// ---------------------------------------------------------------------------
// Badge taxonomy — Camada 4 §2.2.
//
// Mirrored from the public source-of-truth that will land in
// `packages/types/badges.ts`. Until that package exists, this file is the
// authoritative definition for server-side consumers.
//
// TIER_PLATINUM is reserved for the future PLATINUM tier and emitted by
// {@link computeBadges} whenever an agent reaches that tier through an
// (admin-only, for now) override. The rules layer does not promote into
// PLATINUM automatically.
// ---------------------------------------------------------------------------

export const BADGE_TYPES = [
  'TIER_BRONZE',
  'TIER_SILVER',
  'TIER_GOLD',
  'TIER_PLATINUM',
  'HUMAN_BACKED_OWNER',
  'MOLTVERSE_INFERRED',
  'TEE_ATTESTED',
  'DIAMOND',
  'PIONEER',
  'VETERAN',
  'KEY_ROTATED_RECENTLY',
] as const;
export type BadgeType = (typeof BADGE_TYPES)[number];

export type BadgeVisualClass = 'tier' | 'verification' | 'status' | 'warning';

export interface Badge {
  type: BadgeType;
  earnedAt: string; // ISO 8601
  expiresAt: string | null;
  metadata?: Record<string, unknown>;
  visualClass: BadgeVisualClass;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Lifetime LLM-proxy actions required for MOLTVERSE_INFERRED (spec §4.1). */
export const MOLTVERSE_INFERRED_MIN_USED = 50;
/** Days of continuous activity required for VETERAN. */
export const VETERAN_MIN_DAYS = 365;
/** Window during which a key rotation surfaces as KEY_ROTATED_RECENTLY. */
export const KEY_ROTATION_WARNING_DAYS = 30;
/** First N agents to register earn the PIONEER badge — cap is fixed by spec §2.4. */
export const PIONEER_COHORT_SIZE = 100;

// ---------------------------------------------------------------------------
// Input snapshot
// ---------------------------------------------------------------------------

export interface BadgeAgentSnapshot {
  tier: AgentTier;
  /** Time the agent moved into its current tier. Mapped from
   *  `Agent.tierChangedAt` in repo/. */
  tierUpdatedAt: Date;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  registeredAt: Date;
  worldIdNullifier: string | null;
  worldIdVerifiedAt: Date | null;
  /** Set the first time the agent used a hosted LLM proxy. Null if it
   *  never has — gate the badge earnedAt to a sensible date in that
   *  case (we fall back to registeredAt). */
  firstLLMProxyUseAt: Date | null;
}

export interface BadgeContext {
  /** Currently-valid attestation (null when none, expired, invalid, etc).
   *  Spec §4.1 only awards TEE_ATTESTED on a fresh, valid quote. */
  attestation: {
    attestedAt: Date;
    expiresAt: Date;
    kind?: string;
    validator?: string;
  } | null;
  /** Lifetime count of agent actions that drew from the hosted LLM proxy.
   *  Spec §4.1 awards MOLTVERSE_INFERRED at >= 50 — once earned, the badge
   *  is eternal (consumption history is monotonic). */
  llmProxyConsumed: number;
  /** 1-based position in the registration order (1 = first ever). Null
   *  when the agent isn't in the pioneer cohort. */
  pioneerRank: number | null;
  /** Most recent key-rotation event within the warning window, if any. */
  recentKeyRotation: { rotatedAt: Date; reason: string | null } | null;
  /** Test seam — defaults to wall clock. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// Utility math
// ---------------------------------------------------------------------------

function daysBetween(earlier: Date, now: Date): number {
  return Math.floor((now.getTime() - earlier.getTime()) / 86_400_000);
}

function addDays(start: Date, days: number): Date {
  return new Date(start.getTime() + days * 86_400_000);
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function tierBadge(tier: AgentTier): BadgeType {
  if (tier === 'BRONZE') return 'TIER_BRONZE';
  if (tier === 'SILVER') return 'TIER_SILVER';
  if (tier === 'GOLD') return 'TIER_GOLD';
  return 'TIER_PLATINUM';
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/**
 * Compute the full badge list. Ordering is deterministic: tier first,
 * then verification badges, then status, then warning — matches the
 * visual hierarchy on the agent profile.
 */
export function computeBadges(agent: BadgeAgentSnapshot, ctx: BadgeContext): Badge[] {
  const now = ctx.now ?? new Date();
  const badges: Badge[] = [];

  // Exactly one tier badge — always present.
  badges.push({
    type: tierBadge(agent.tier),
    earnedAt: agent.tierUpdatedAt.toISOString(),
    expiresAt: null,
    visualClass: 'tier',
  });

  // HUMAN_BACKED_OWNER — owner linked World ID.
  if (agent.worldIdNullifier !== null && agent.worldIdVerifiedAt !== null) {
    badges.push({
      type: 'HUMAN_BACKED_OWNER',
      earnedAt: agent.worldIdVerifiedAt.toISOString(),
      expiresAt: null,
      visualClass: 'verification',
    });

    // DIAMOND — GOLD + World ID combo. PLATINUM is treated identically
    // to GOLD here since it represents an even higher trust level.
    if (agent.tier === 'GOLD' || agent.tier === 'PLATINUM') {
      badges.push({
        type: 'DIAMOND',
        earnedAt: maxDate(agent.tierUpdatedAt, agent.worldIdVerifiedAt).toISOString(),
        expiresAt: null,
        visualClass: 'verification',
      });
    }
  }

  // MOLTVERSE_INFERRED — has consumed enough hosted-proxy actions.
  if (ctx.llmProxyConsumed >= MOLTVERSE_INFERRED_MIN_USED) {
    const earnedAt = agent.firstLLMProxyUseAt ?? agent.registeredAt;
    badges.push({
      type: 'MOLTVERSE_INFERRED',
      earnedAt: earnedAt.toISOString(),
      expiresAt: null,
      visualClass: 'verification',
      metadata: { consumed: ctx.llmProxyConsumed },
    });
  }

  // TEE_ATTESTED — only when attestation is fresh AND not past expiry.
  if (ctx.attestation !== null && ctx.attestation.expiresAt.getTime() > now.getTime()) {
    const metadata: Record<string, unknown> = {};
    if (ctx.attestation.kind !== undefined) metadata.kind = ctx.attestation.kind;
    if (ctx.attestation.validator !== undefined) metadata.validator = ctx.attestation.validator;
    badges.push({
      type: 'TEE_ATTESTED',
      earnedAt: ctx.attestation.attestedAt.toISOString(),
      expiresAt: ctx.attestation.expiresAt.toISOString(),
      visualClass: 'verification',
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    });
  }

  // PIONEER — first 100 agents. earnedAt = registeredAt (the moment the
  // cohort membership was sealed).
  if (ctx.pioneerRank !== null && ctx.pioneerRank <= PIONEER_COHORT_SIZE) {
    badges.push({
      type: 'PIONEER',
      earnedAt: agent.registeredAt.toISOString(),
      expiresAt: null,
      visualClass: 'status',
      metadata: { rank: ctx.pioneerRank },
    });
  }

  // VETERAN — continuous activity for >= 365 days. Suspended/revoked
  // agents do not qualify (status check matches spec §4.1).
  if (agent.status === 'ACTIVE' && daysBetween(agent.registeredAt, now) >= VETERAN_MIN_DAYS) {
    badges.push({
      type: 'VETERAN',
      earnedAt: addDays(agent.registeredAt, VETERAN_MIN_DAYS).toISOString(),
      expiresAt: null,
      visualClass: 'status',
    });
  }

  // KEY_ROTATED_RECENTLY — informational warning that expires 30 days
  // after rotation.
  if (
    ctx.recentKeyRotation !== null &&
    daysBetween(ctx.recentKeyRotation.rotatedAt, now) < KEY_ROTATION_WARNING_DAYS
  ) {
    const expiresAt = addDays(ctx.recentKeyRotation.rotatedAt, KEY_ROTATION_WARNING_DAYS);
    const reason = ctx.recentKeyRotation.reason;
    badges.push({
      type: 'KEY_ROTATED_RECENTLY',
      earnedAt: ctx.recentKeyRotation.rotatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      visualClass: 'warning',
      ...(reason !== null ? { metadata: { reason } } : {}),
    });
  }

  return badges;
}
