/**
 * Per-tier action rate limits — Camada 4 §6.
 *
 * Pure logic + a simple in-process counter. Routes that opt into the
 * tier rate limit pass `agentId` and `tier` into `evaluate`; the
 * function returns either OK or a structured 429 with `retryAfterMs`.
 *
 * The counters are bucketed per-minute and pruned lazily; for a single
 * server process this is sufficient for the early scale targets. If
 * we ever need cross-instance enforcement, swap the implementation
 * for Redis without changing the public contract.
 */

import type { AgentTier } from '@prisma/client';

/**
 * Per-tier per-minute action ceilings. PLATINUM is reserved for a
 * future progression; treat it identically to GOLD until the spec
 * lands so PLATINUM agents are not accidentally throttled below GOLD.
 */
export const TIER_LIMITS_PER_MINUTE: Readonly<Record<AgentTier, number>> = Object.freeze({
  BRONZE: 10,
  SILVER: 30,
  GOLD: 100,
  PLATINUM: 100,
});

export type TierRateOutcome =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterMs: number; limit: number; tier: AgentTier };

export interface TierRateLimiterConfig {
  /** Override for tests so we don't depend on real wall-clock time. */
  now?: () => number;
}

/**
 * In-process per-(agentId, minute-bucket) counter. The bucket is
 * derived from `Math.floor(now / 60_000)` so two requests in the
 * same wall-clock minute share the same bucket regardless of when
 * the agent was first seen.
 *
 * Memory: an entry persists in the map only as long as the agent
 * remains active. Stale entries from agents that stopped calling are
 * dropped on the first `evaluate` of a new minute boundary — see
 * {@link TierRateLimiter.pruneStale}. The lazy schedule keeps the hot
 * path at O(1) most of the time and pays the O(size) prune cost at
 * most once per minute regardless of traffic.
 */
export class TierRateLimiter {
  private readonly counters = new Map<string, { bucket: number; count: number }>();

  private lastPrunedBucket = -1;

  private readonly now: () => number;

  constructor(config: TierRateLimiterConfig = {}) {
    this.now = config.now ?? Date.now;
  }

  evaluate(input: { agentId: string; tier: AgentTier }): TierRateOutcome {
    const limit = TIER_LIMITS_PER_MINUTE[input.tier];
    const t = this.now();
    const bucket = Math.floor(t / 60_000);

    if (bucket !== this.lastPrunedBucket) {
      this.pruneStale(bucket);
      this.lastPrunedBucket = bucket;
    }

    const existing = this.counters.get(input.agentId);

    if (existing?.bucket !== bucket) {
      this.counters.set(input.agentId, { bucket, count: 1 });
      return { ok: true, remaining: limit - 1 };
    }

    if (existing.count >= limit) {
      const nextBucketStart = (bucket + 1) * 60_000;
      return {
        ok: false,
        retryAfterMs: Math.max(0, nextBucketStart - t),
        limit,
        tier: input.tier,
      };
    }

    existing.count += 1;
    return { ok: true, remaining: limit - existing.count };
  }

  /**
   * Drop entries whose bucket is older than the previous minute. We
   * keep `currentBucket - 1` around in case `evaluate` is called from
   * concurrent contexts that observe slightly different `now()` values
   * (clock-drift safety margin). Runs at most once per minute boundary.
   */
  private pruneStale(currentBucket: number): void {
    const cutoff = currentBucket - 1;
    for (const [agentId, entry] of this.counters) {
      if (entry.bucket < cutoff) {
        this.counters.delete(agentId);
      }
    }
  }

  /** Test helper — observe the current map size to assert pruning works. */
  size(): number {
    return this.counters.size;
  }

  /** Test helper to drop all state. */
  reset(): void {
    this.counters.clear();
    this.lastPrunedBucket = -1;
  }
}

/**
 * Module-level singleton for production routes. Tests should construct
 * their own instance via `new TierRateLimiter({ now: () => fakeNow })`
 * so the bucket is deterministic.
 */
export const tierRateLimiter = new TierRateLimiter();
