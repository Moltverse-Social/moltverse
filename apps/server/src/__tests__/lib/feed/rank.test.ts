/**
 * Tests for src/lib/feed/rank.ts — pure math.
 */

import { describe, expect, it } from 'vitest';

import {
  DIAMOND_MULTIPLIER,
  DIVERSITY_AGENT_CAP,
  ENGAGEMENT_LOG_COEFFICIENT,
  RECENCY_HALF_LIFE_HOURS,
  TIER_MULTIPLIERS,
  applyDiversityFilter,
  computeRecencyScore,
  rankFeedItem,
  type FeedItemInput,
} from '../../../lib/feed/rank.js';

const NOW = new Date('2026-05-12T12:00:00Z');

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

const BASE: FeedItemInput = {
  id: 'scrap_1',
  agentId: 'agent_1',
  createdAt: NOW,
  tier: 'BRONZE',
  diamond: false,
  activeFlagSeverities: [],
  engagementCount: 0,
};

// ---------------------------------------------------------------------------
// computeRecencyScore
// ---------------------------------------------------------------------------

describe('computeRecencyScore', () => {
  it('returns ~1 for a brand-new item', () => {
    expect(computeRecencyScore(NOW, NOW)).toBe(1);
  });
  it('halves at exactly one half-life', () => {
    expect(computeRecencyScore(hoursAgo(RECENCY_HALF_LIFE_HOURS), NOW)).toBeCloseTo(0.5, 5);
  });
  it('quarters at two half-lives', () => {
    expect(computeRecencyScore(hoursAgo(RECENCY_HALF_LIFE_HOURS * 2), NOW)).toBeCloseTo(0.25, 5);
  });
  it('clamps future-dated items to 1', () => {
    expect(computeRecencyScore(new Date(NOW.getTime() + 86_400_000), NOW)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// rankFeedItem
// ---------------------------------------------------------------------------

describe('rankFeedItem', () => {
  it('applies the tier multiplier table per spec §5.1', () => {
    const bronze = rankFeedItem(BASE, NOW);
    const silver = rankFeedItem({ ...BASE, tier: 'SILVER' }, NOW);
    const gold = rankFeedItem({ ...BASE, tier: 'GOLD' }, NOW);
    expect(bronze.tierMultiplier).toBe(TIER_MULTIPLIERS.BRONZE);
    expect(silver.tierMultiplier).toBe(TIER_MULTIPLIERS.SILVER);
    expect(gold.tierMultiplier).toBe(TIER_MULTIPLIERS.GOLD);
    expect(silver.score).toBeGreaterThan(bronze.score);
    expect(gold.score).toBeGreaterThan(silver.score);
  });

  it('treats PLATINUM identically to GOLD until separate spec lands', () => {
    const gold = rankFeedItem({ ...BASE, tier: 'GOLD' }, NOW);
    const platinum = rankFeedItem({ ...BASE, tier: 'PLATINUM' }, NOW);
    expect(platinum.tierMultiplier).toBe(gold.tierMultiplier);
  });

  it('boosts GOLD + diamond past plain GOLD', () => {
    const gold = rankFeedItem({ ...BASE, tier: 'GOLD' }, NOW);
    const diamond = rankFeedItem({ ...BASE, tier: 'GOLD', diamond: true }, NOW);
    expect(diamond.tierMultiplier).toBe(DIAMOND_MULTIPLIER);
    expect(diamond.score).toBeGreaterThan(gold.score);
  });

  it('also boosts PLATINUM + diamond (same DIAMOND_MULTIPLIER)', () => {
    const r = rankFeedItem({ ...BASE, tier: 'PLATINUM', diamond: true }, NOW);
    expect(r.tierMultiplier).toBe(DIAMOND_MULTIPLIER);
  });

  it('does NOT diamond-boost when tier is below GOLD', () => {
    const r = rankFeedItem({ ...BASE, tier: 'SILVER', diamond: true }, NOW);
    expect(r.tierMultiplier).toBe(TIER_MULTIPLIERS.SILVER);
  });

  it('penalises CRITICAL more heavily than HIGH', () => {
    const high = rankFeedItem({ ...BASE, activeFlagSeverities: ['HIGH'] }, NOW);
    const crit = rankFeedItem({ ...BASE, activeFlagSeverities: ['CRITICAL'] }, NOW);
    expect(crit.score).toBeLessThan(high.score);
    expect(high.score).toBeLessThan(rankFeedItem(BASE, NOW).score);
  });

  it('CRITICAL wins when both severities are present', () => {
    const both = rankFeedItem({ ...BASE, activeFlagSeverities: ['HIGH', 'CRITICAL'] }, NOW);
    expect(both.flagPenalty).toBe(0.2);
  });

  it('engagement boost is logarithmic', () => {
    const a = rankFeedItem({ ...BASE, engagementCount: 0 }, NOW);
    const b = rankFeedItem({ ...BASE, engagementCount: 10 }, NOW);
    const c = rankFeedItem({ ...BASE, engagementCount: 100 }, NOW);
    expect(b.engagementBoost).toBeCloseTo(1 + Math.log(11) * ENGAGEMENT_LOG_COEFFICIENT, 5);
    expect(c.engagementBoost).toBeGreaterThan(b.engagementBoost);
    expect(a.engagementBoost).toBe(1);
  });

  it('clamps negative engagement counts to 0', () => {
    const r = rankFeedItem({ ...BASE, engagementCount: -5 }, NOW);
    expect(r.engagementBoost).toBe(1);
  });

  it('decays with age via the recency multiplier', () => {
    const fresh = rankFeedItem({ ...BASE, createdAt: NOW }, NOW);
    const day = rankFeedItem({ ...BASE, createdAt: hoursAgo(24) }, NOW);
    expect(day.score).toBeLessThan(fresh.score);
  });
});

// ---------------------------------------------------------------------------
// applyDiversityFilter
// ---------------------------------------------------------------------------

describe('applyDiversityFilter', () => {
  function pump(count: number, agentId: string): { id: string; agentId: string }[] {
    return Array.from({ length: count }, (_, i) => ({ id: `${agentId}_${String(i)}`, agentId }));
  }

  it('passes everything through when every item is from a different agent', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({
      id: `i_${String(i)}`,
      agentId: `a_${String(i)}`,
    }));
    expect(applyDiversityFilter(items).length).toBe(8);
  });

  it('caps consecutive items per agent at DIVERSITY_AGENT_CAP within the window', () => {
    const items = pump(DIVERSITY_AGENT_CAP + 3, 'a_loud');
    const out = applyDiversityFilter(items);
    expect(out.length).toBe(DIVERSITY_AGENT_CAP);
  });

  it('counter resets every DIVERSITY_WINDOW_SIZE items emitted', () => {
    // Layout: 5 from a, 5 from b → 10 emitted → reset → 5 more from a.
    const items = [...pump(5, 'a'), ...pump(5, 'b'), ...pump(5, 'a')];
    const out = applyDiversityFilter(items);
    expect(out.length).toBe(15);
    expect(out.filter((i) => i.agentId === 'a').length).toBe(10);
  });

  it('preserves order among admitted items', () => {
    const items = [
      { id: 'x_1', agentId: 'x' },
      { id: 'y_1', agentId: 'y' },
      { id: 'x_2', agentId: 'x' },
    ];
    expect(applyDiversityFilter(items).map((i) => i.id)).toEqual(['x_1', 'y_1', 'x_2']);
  });
});
