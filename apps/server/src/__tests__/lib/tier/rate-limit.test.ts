/**
 * Tests for src/lib/tier/rate-limit.ts.
 *
 * Drive the limiter with a fake clock so the bucket boundaries are
 * deterministic. Cover: per-tier ceilings, bucket reset on the next
 * minute boundary, retryAfterMs math.
 */

import { describe, expect, it } from 'vitest';

import { TierRateLimiter, TIER_LIMITS_PER_MINUTE } from '../../../lib/tier/rate-limit.js';

function withClock(start: number): { advance(ms: number): void; set(t: number): void; reader: () => number } {
  let now = start;
  return {
    advance(ms: number): void {
      now += ms;
    },
    set(t: number): void {
      now = t;
    },
    reader: (): number => now,
  };
}

describe('TierRateLimiter', () => {
  it('allows calls up to the per-tier ceiling', () => {
    const clock = withClock(0);
    const limiter = new TierRateLimiter({ now: clock.reader });
    const limit = TIER_LIMITS_PER_MINUTE.BRONZE;
    for (let i = 0; i < limit; i++) {
      const r = limiter.evaluate({ agentId: 'ag', tier: 'BRONZE' });
      expect(r.ok).toBe(true);
    }
    const denied = limiter.evaluate({ agentId: 'ag', tier: 'BRONZE' });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.tier).toBe('BRONZE');
  });

  it('resets the bucket on the next minute boundary', () => {
    const clock = withClock(0);
    const limiter = new TierRateLimiter({ now: clock.reader });
    const limit = TIER_LIMITS_PER_MINUTE.SILVER;
    for (let i = 0; i < limit; i++) limiter.evaluate({ agentId: 'ag', tier: 'SILVER' });
    expect(limiter.evaluate({ agentId: 'ag', tier: 'SILVER' }).ok).toBe(false);

    // Advance into the next minute bucket.
    clock.set(60_001);
    const after = limiter.evaluate({ agentId: 'ag', tier: 'SILVER' });
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.remaining).toBe(limit - 1);
  });

  it('reports retryAfterMs against the next bucket boundary', () => {
    const clock = withClock(45_000); // 45s into minute 0
    const limiter = new TierRateLimiter({ now: clock.reader });
    for (let i = 0; i < TIER_LIMITS_PER_MINUTE.GOLD; i++) {
      limiter.evaluate({ agentId: 'ag', tier: 'GOLD' });
    }
    const denied = limiter.evaluate({ agentId: 'ag', tier: 'GOLD' });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.retryAfterMs).toBe(15_000); // 60_000 - 45_000
      expect(denied.limit).toBe(TIER_LIMITS_PER_MINUTE.GOLD);
    }
  });

  it('isolates counters per agent', () => {
    const clock = withClock(0);
    const limiter = new TierRateLimiter({ now: clock.reader });
    for (let i = 0; i < TIER_LIMITS_PER_MINUTE.BRONZE; i++) {
      limiter.evaluate({ agentId: 'ag1', tier: 'BRONZE' });
    }
    expect(limiter.evaluate({ agentId: 'ag1', tier: 'BRONZE' }).ok).toBe(false);
    // ag2 has its own counter, untouched.
    expect(limiter.evaluate({ agentId: 'ag2', tier: 'BRONZE' }).ok).toBe(true);
  });

  it('treats PLATINUM the same as GOLD (until a separate spec lands)', () => {
    expect(TIER_LIMITS_PER_MINUTE.PLATINUM).toBe(TIER_LIMITS_PER_MINUTE.GOLD);
  });

  it('evicts stale agent buckets when the minute boundary advances', () => {
    // Sprint 12 post-merge review caught that `counters` grew unbounded
    // — an agent that called once and never returned kept its bucket
    // forever. The lazy prune on each new-minute evaluate keeps the map
    // size proportional to the *currently active* agents, not the
    // lifetime count of agents that ever touched the route.
    const clock = withClock(0);
    const limiter = new TierRateLimiter({ now: clock.reader });

    // Seed a thousand one-shot agents in minute 0.
    for (let i = 0; i < 1_000; i++) {
      limiter.evaluate({ agentId: `ag${i.toString()}`, tier: 'BRONZE' });
    }
    expect(limiter.size()).toBe(1_000);

    // Advance two minutes — only one currently-active agent calls.
    // The prune runs on this evaluate and the 1,000 stale entries
    // should disappear, leaving only the active one.
    clock.set(120_500);
    limiter.evaluate({ agentId: 'ag_active', tier: 'BRONZE' });
    expect(limiter.size()).toBe(1);
  });
});
