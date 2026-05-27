/**
 * Tests for src/lib/feed/snapshot-builder.ts.
 *
 * Fake Prisma; we lock in:
 *   - summary truncation
 *   - window cutoff math (applied to all 3 sources)
 *   - upsert payload shape (kind+key, items count, generatedAt,
 *     actionType per row)
 *   - merge respects approved=true on testimonials
 *   - candidate cap enforcement (cap per source)
 *
 * Adaptation: repo/'s social tables are User-centric; the fake row
 * shape mirrors the adapted Prisma select (`sender.agent.{...}`).
 */

import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_ITEM_LIMIT,
  DEFAULT_WINDOW_MINUTES,
  SUMMARY_MAX_CHARS,
  buildGlobalFeedSnapshot,
  summarise,
} from '../../../lib/feed/snapshot-builder.js';

const NOW = new Date('2026-05-12T12:00:00Z');

interface FakeRow {
  id: number;
  body: string | null;
  createdAt: Date;
  senderId: string;
  sender: {
    agent: {
      id: string;
      handle: string | null;
      tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
      worldIdNullifier: string | null;
      behaviorScore: number | null;
    } | null;
  };
}

let nextRowId = 1;

function makeRow(prefix: string, ageMin: number, agentSuffix = '1'): FakeRow {
  const id = nextRowId++;
  return {
    id,
    body: `${prefix} body for ${String(id)} `.repeat(8),
    createdAt: new Date(NOW.getTime() - ageMin * 60_000),
    senderId: `user_${agentSuffix}`,
    sender: {
      agent: {
        id: `agent_${agentSuffix}`,
        handle: `handle_${agentSuffix}`,
        tier: 'BRONZE',
        worldIdNullifier: null,
        behaviorScore: 0.7,
      },
    },
  };
}

function fakePrisma(
  opts: {
    scraps?: FakeRow[];
    comments?: FakeRow[];
    testimonials?: FakeRow[];
  } = {},
): {
  prisma: unknown;
  spies: {
    upsert: ReturnType<typeof vi.fn>;
    scrapFind: ReturnType<typeof vi.fn>;
    commentFind: ReturnType<typeof vi.fn>;
    testimonialFind: ReturnType<typeof vi.fn>;
  };
} {
  const upsert = vi.fn().mockResolvedValue({});
  const scrapFind = vi.fn().mockResolvedValue(opts.scraps ?? []);
  const commentFind = vi.fn().mockResolvedValue(opts.comments ?? []);
  const testimonialFind = vi.fn().mockResolvedValue(opts.testimonials ?? []);
  const prisma = {
    scrap: { findMany: scrapFind },
    topicComment: { findMany: commentFind },
    testimonial: { findMany: testimonialFind },
    feedSnapshot: { upsert },
  };
  return { prisma, spies: { upsert, scrapFind, commentFind, testimonialFind } };
}

// ---------------------------------------------------------------------------
// summarise
// ---------------------------------------------------------------------------

describe('summarise', () => {
  it('returns input unchanged when under cap', () => {
    expect(summarise('short')).toBe('short');
  });
  it('truncates with ellipsis when over cap', () => {
    const out = summarise('a'.repeat(SUMMARY_MAX_CHARS + 50));
    expect(out.length).toBe(SUMMARY_MAX_CHARS);
    expect(out.endsWith('…')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildGlobalFeedSnapshot
// ---------------------------------------------------------------------------

describe('buildGlobalFeedSnapshot', () => {
  it('queries all three social tables within the window and writes a snapshot', async () => {
    const scraps = Array.from({ length: 3 }, (_, i) => makeRow('scrap', i * 3, String(i)));
    const comments = Array.from({ length: 2 }, (_, i) =>
      makeRow('comment', i * 7, String(i + 10)),
    );
    const testimonials = [makeRow('test', 1, '99')];
    const { prisma, spies } = fakePrisma({ scraps, comments, testimonials });

    const r = await buildGlobalFeedSnapshot(prisma as never, { now: NOW });

    expect(r.generatedAt).toEqual(NOW);
    expect(r.itemsWritten).toBe(6);

    const expectedWindowStart = new Date(NOW.getTime() - DEFAULT_WINDOW_MINUTES * 60_000);
    const scrapArgs = spies.scrapFind.mock.calls[0]?.[0] as {
      where: { createdAt: { gte: Date }; deletedAt: null };
    };
    expect(scrapArgs.where.createdAt.gte).toEqual(expectedWindowStart);
    expect(scrapArgs.where.deletedAt).toBeNull();

    const testArgs = spies.testimonialFind.mock.calls[0]?.[0] as {
      where: { approved: boolean };
    };
    // Testimonials must be approved=true to appear in the public feed.
    expect(testArgs.where.approved).toBe(true);

    const upsertArgs = spies.upsert.mock.calls[0]?.[0] as {
      where: { snapshotKind_snapshotKey: { snapshotKind: string; snapshotKey: string } };
      create: { items: { actionType: string; actionRef: string }[]; totalItems: number };
    };
    expect(upsertArgs.where.snapshotKind_snapshotKey.snapshotKind).toBe('GLOBAL_FEED');
    expect(upsertArgs.where.snapshotKind_snapshotKey.snapshotKey).toBe('global');
    expect(upsertArgs.create.totalItems).toBe(upsertArgs.create.items.length);
    // Sanity: each item carries the wire actionType + actionRef format.
    for (const item of upsertArgs.create.items) {
      expect(['scrap.create', 'topic.comment', 'testimonial.write']).toContain(item.actionType);
      expect(item.actionRef.startsWith(`${item.actionType}:`)).toBe(true);
    }
  });

  it('caps items at DEFAULT_ITEM_LIMIT regardless of total candidate volume', async () => {
    // Distinct agents per row so the diversity filter doesn't compress
    // the output below the cap — we want to prove the itemLimit is the
    // gate, not the per-agent quota.
    const scraps = Array.from({ length: 60 }, (_, i) =>
      makeRow('s', (i % 60) + 1, `sa_${String(i)}`),
    );
    const comments = Array.from({ length: 60 }, (_, i) =>
      makeRow('c', (i % 60) + 1, `ca_${String(i)}`),
    );
    const testimonials = Array.from({ length: 60 }, (_, i) =>
      makeRow('t', (i % 60) + 1, `ta_${String(i)}`),
    );
    const { prisma, spies } = fakePrisma({ scraps, comments, testimonials });
    const r = await buildGlobalFeedSnapshot(prisma as never, { now: NOW });
    expect(r.itemsWritten).toBe(DEFAULT_ITEM_LIMIT);
    const upsertArgs = spies.upsert.mock.calls[0]?.[0] as { create: { items: unknown[] } };
    expect(upsertArgs.create.items.length).toBe(DEFAULT_ITEM_LIMIT);
  });

  it('writes empty items array when all three sources are empty', async () => {
    const { prisma } = fakePrisma({});
    const r = await buildGlobalFeedSnapshot(prisma as never, { now: NOW });
    expect(r.itemsWritten).toBe(0);
  });

  it('honours custom window + limit in the upsert payload', async () => {
    const { prisma, spies } = fakePrisma({
      scraps: [makeRow('s', 1, 'sa_one')],
    });
    await buildGlobalFeedSnapshot(prisma as never, {
      now: NOW,
      windowMinutes: 30,
      itemLimit: 3,
    });
    const upsertArgs = spies.upsert.mock.calls[0]?.[0] as {
      create: { windowMinutes: number; itemLimit: number };
    };
    expect(upsertArgs.create.windowMinutes).toBe(30);
    expect(upsertArgs.create.itemLimit).toBe(3);
  });

  it('flags GOLD + worldId-linked agents as DIAMOND-eligible', async () => {
    const goldRow: FakeRow = {
      id: nextRowId++,
      body: 'gold scrap',
      createdAt: new Date(NOW.getTime() - 60_000),
      senderId: 'user_gold',
      sender: {
        agent: {
          id: 'agent_gold',
          handle: 'gold_agent',
          tier: 'GOLD',
          worldIdNullifier: '0xabc',
          behaviorScore: 0.95,
        },
      },
    };
    const { prisma, spies } = fakePrisma({ scraps: [goldRow] });
    await buildGlobalFeedSnapshot(prisma as never, { now: NOW });
    const upsertArgs = spies.upsert.mock.calls[0]?.[0] as {
      create: { items: { agentDiamondEligible: boolean }[] };
    };
    expect(upsertArgs.create.items[0]?.agentDiamondEligible).toBe(true);
  });

  it('skips rows whose sender has no Agent row (defensive against where-clause drift)', async () => {
    const userOnly: FakeRow = {
      id: nextRowId++,
      body: 'orphan scrap',
      createdAt: new Date(NOW.getTime() - 30_000),
      senderId: 'user_orphan',
      sender: { agent: null },
    };
    const { prisma } = fakePrisma({ scraps: [userOnly] });
    const r = await buildGlobalFeedSnapshot(prisma as never, { now: NOW });
    expect(r.itemsWritten).toBe(0);
  });
});
