/**
 * Feed ranking + diversity filter — Camada 6 §5.
 *
 * Pure math. Two parts:
 *
 *  - {@link rankFeedItem} computes the score for one item, combining
 *    recency (24h half-life), tier multiplier, flag-severity penalty,
 *    and a logarithmic engagement boost.
 *
 *  - {@link applyDiversityFilter} ensures no single agent dominates the
 *    feed: cap of 5 items per agent inside a rolling 10-item window.
 *
 * Notes vs moltverse fonte:
 *   - PLATINUM treated identically to GOLD (Camada 4 §3 reserves it
 *     for a future progression; until that spec lands a PLATINUM-tiered
 *     agent shouldn't be penalised in feed ranking).
 */

import type { AgentTier } from '@prisma/client';

// ---------------------------------------------------------------------------
// Tunables — Camada 6 §5.1.
// ---------------------------------------------------------------------------

export const RECENCY_HALF_LIFE_HOURS = 24;

export const TIER_MULTIPLIERS: Readonly<Record<AgentTier, number>> = Object.freeze({
  BRONZE: 1.0,
  SILVER: 1.2,
  GOLD: 1.5,
  PLATINUM: 1.5,
});

/** Extra boost on top of GOLD when the owner is World-ID linked. */
export const DIAMOND_MULTIPLIER = 1.7;

/** Severity-keyed penalty multipliers. Anything not present applies
 *  no penalty (1.0). Aligns with FlagSeverity enum. */
export const FLAG_PENALTIES: Readonly<Record<string, number>> = Object.freeze({
  CRITICAL: 0.2,
  HIGH: 0.5,
});

/** Engagement boost coefficient — `1 + ln(1 + N) * k`. */
export const ENGAGEMENT_LOG_COEFFICIENT = 0.1;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FeedItemInput {
  /** Unique id of the underlying entity (scrap id, topic comment id, …). */
  id: string;
  /** Author agent id — used by the diversity filter. */
  agentId: string;
  /** When the entity was authored. */
  createdAt: Date;
  /** Author's current tier. Cached on the item so a feed rebuild
   *  doesn't have to re-resolve tier per row. */
  tier: AgentTier;
  /** Whether the author has DIAMOND eligibility (GOLD/PLATINUM + worldId). */
  diamond: boolean;
  /** Active flags on the author. Only severities; the engine doesn't
   *  care about specific flag names. */
  activeFlagSeverities: readonly string[];
  /** Engagement count (replies + reactions). Clamped to ≥ 0. */
  engagementCount: number;
}

export interface RankedFeedItem {
  id: string;
  agentId: string;
  score: number;
  recencyScore: number;
  tierMultiplier: number;
  flagPenalty: number;
  engagementBoost: number;
}

// ---------------------------------------------------------------------------
// Recency
// ---------------------------------------------------------------------------

export function computeRecencyScore(
  createdAt: Date,
  now: Date = new Date(),
  halfLifeHours: number = RECENCY_HALF_LIFE_HOURS,
): number {
  const ageHours = (now.getTime() - createdAt.getTime()) / 3_600_000;
  if (ageHours < 0) return 1; // dated in the future — treat as brand new
  if (halfLifeHours <= 0) return 0;
  return Math.pow(0.5, ageHours / halfLifeHours);
}

// ---------------------------------------------------------------------------
// Multipliers
// ---------------------------------------------------------------------------

function tierMultiplierFor(tier: AgentTier, diamond: boolean): number {
  if ((tier === 'GOLD' || tier === 'PLATINUM') && diamond) return DIAMOND_MULTIPLIER;
  return TIER_MULTIPLIERS[tier];
}

/** Most-severe flag wins; CRITICAL > HIGH > others. Unknown severities
 *  contribute no penalty (i.e. multiplier 1.0). */
function flagPenaltyFor(severities: readonly string[]): number {
  if (severities.includes('CRITICAL')) return FLAG_PENALTIES.CRITICAL ?? 1.0;
  if (severities.includes('HIGH')) return FLAG_PENALTIES.HIGH ?? 1.0;
  return 1.0;
}

function engagementBoostFor(count: number): number {
  const safe = count < 0 ? 0 : count;
  return 1 + Math.log(1 + safe) * ENGAGEMENT_LOG_COEFFICIENT;
}

// ---------------------------------------------------------------------------
// Rank
// ---------------------------------------------------------------------------

export function rankFeedItem(item: FeedItemInput, now: Date = new Date()): RankedFeedItem {
  const recencyScore = computeRecencyScore(item.createdAt, now);
  const tierMultiplier = tierMultiplierFor(item.tier, item.diamond);
  const flagPenalty = flagPenaltyFor(item.activeFlagSeverities);
  const engagementBoost = engagementBoostFor(item.engagementCount);
  const score = recencyScore * tierMultiplier * flagPenalty * engagementBoost;
  return {
    id: item.id,
    agentId: item.agentId,
    score,
    recencyScore,
    tierMultiplier,
    flagPenalty,
    engagementBoost,
  };
}

// ---------------------------------------------------------------------------
// Diversity filter — Camada 6 §5.2.
// ---------------------------------------------------------------------------

/** Cap of items per agent within the rolling window. */
export const DIVERSITY_AGENT_CAP = 5;
/** Items between counter resets. Pre-roll window length. */
export const DIVERSITY_WINDOW_SIZE = 10;

/**
 * Anti-monopoly filter: ranked items go through in order, but no agent
 * can appear more than {@link DIVERSITY_AGENT_CAP} times within a
 * {@link DIVERSITY_WINDOW_SIZE}-item rolling window.
 *
 * The implementation matches spec §5.2: a per-agent counter resets every
 * `DIVERSITY_WINDOW_SIZE` items emitted, which keeps the filter cheap
 * (single pass, O(n)) and avoids per-item retention of a sliding queue.
 */
export function applyDiversityFilter<T extends { agentId: string }>(items: readonly T[]): T[] {
  const out: T[] = [];
  const seen = new Map<string, number>();
  for (const item of items) {
    const count = seen.get(item.agentId) ?? 0;
    if (count >= DIVERSITY_AGENT_CAP) continue;
    out.push(item);
    seen.set(item.agentId, count + 1);
    if (out.length % DIVERSITY_WINDOW_SIZE === 0) seen.clear();
  }
  return out;
}
