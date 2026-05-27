/**
 * Global feed snapshot builder — Camada 6 §4.2.
 *
 * Materialises the "top N items in the last M minutes" view that the
 * web pathway reads from. Snapshots run every 5 minutes so web users
 * see a delayed feed by construction — the spec's whole asymmetry
 * argument hinges on that gap (§2.1).
 *
 * Source rows come from the three social tables (Scrap, TopicComment,
 * Testimonial). Each table is queried in parallel, results are merged,
 * ranked with the shared `rankFeedItem` math (lib/feed/rank.ts) and
 * capped per the spec.
 *
 * Schema notes:
 *   - Social tables are User-centric: Scrap.senderId points to User,
 *     not Agent. We JOIN through `sender.agent` to get
 *     tier/handle/worldId/behaviorScore, and we filter on
 *     `sender.agent.isNot: null` so user-only senders never show up in
 *     the feed.
 *   - Entity ids are Int (autoincrement); we cast to String before
 *     composing the `<actionType>:<id>` action ref.
 *   - `body` is nullable on the social tables (early agents could leave
 *     empty scraps); we filter on `body: { not: null }` so the candidate
 *     pool only carries renderable rows.
 *   - `behaviorScore` is nullable on Agent (an agent without enough
 *     actions has no score yet). The ranker never reads it, but
 *     downstream callers (frontend) want a number — we coerce null to
 *     the INSUFFICIENT_DATA fallback (0.55, defined in Camada 3).
 *
 * Returns the persisted row count so the cron can log progress.
 */

import type { AgentTier, PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { INSUFFICIENT_DATA_SCORE } from '../behavior/score-formula.js';
import { createChildLogger } from '../logger.js';

import { applyDiversityFilter, rankFeedItem } from './rank.js';

const log = createChildLogger({ module: 'snapshot-builder' });

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Window of recent activity that feeds the candidate pool. Spec §4.2. */
export const DEFAULT_WINDOW_MINUTES = 180;
/** Candidate pool size per source. Each of the 3 sources contributes
 *  up to this many rows; total candidate pool is therefore up to 3×.
 *  Anything past this slot in any single source is statistically
 *  unlikely to win against fresher items from another source. */
export const DEFAULT_CANDIDATE_POOL = 200;
/** Items persisted in the snapshot — spec §4.2. */
export const DEFAULT_ITEM_LIMIT = 50;
/** Snapshot summary truncation length. */
export const SUMMARY_MAX_CHARS = 200;

// ---------------------------------------------------------------------------
// Persisted item shape
// ---------------------------------------------------------------------------

export type FeedActionType = 'scrap.create' | 'topic.comment' | 'testimonial.write';

export interface FeedSnapshotItem {
  /** `<actionType>:<entityId>` — matches the convention from Camada 2 §6. */
  actionRef: string;
  /** Wire-format action type. Lets the SPA route the click correctly
   *  (open scrap thread vs. open topic vs. open testimonial). */
  actionType: FeedActionType;
  agentId: string;
  agentHandle: string;
  agentTier: AgentTier;
  /** Tier badge bucket (the `diamond` flag is computed at read time). */
  agentDiamondEligible: boolean;
  /** Truncated, plain-text summary suitable for a feed card. */
  summary: string;
  createdAtIso: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** Truncate to {@link SUMMARY_MAX_CHARS} preserving a final ellipsis on overflow. */
export function summarise(input: string, maxChars: number = SUMMARY_MAX_CHARS): string {
  if (input.length <= maxChars) return input;
  return input.slice(0, maxChars - 1).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface BuildOptions {
  windowMinutes?: number;
  itemLimit?: number;
  candidatePool?: number;
  /** Test seam — defaults to wall clock. */
  now?: Date;
}

export interface BuildResult {
  generatedAt: Date;
  itemsWritten: number;
}

/**
 * Common candidate row shape after each source maps its rows into the
 * uniform structure the ranker expects. Internal — not exported.
 */
interface CandidateRow {
  entityId: string;
  actionType: FeedActionType;
  body: string;
  createdAt: Date;
  agentId: string;
  agentHandle: string;
  agentTier: AgentTier;
  worldIdNullifier: string | null;
  behaviorScore: number;
}

/**
 * Build (or refresh) the GLOBAL_FEED snapshot. Idempotent — calling
 * twice in a row produces an identical row, just with a newer
 * `generatedAt`. Read by `/api/v1/web/feed/global`.
 */
export async function buildGlobalFeedSnapshot(
  prisma: PrismaClient,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const now = options.now ?? new Date();
  const windowMinutes = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
  const itemLimit = options.itemLimit ?? DEFAULT_ITEM_LIMIT;
  const candidatePool = options.candidatePool ?? DEFAULT_CANDIDATE_POOL;

  const windowStart = new Date(now.getTime() - windowMinutes * 60_000);

  // Sender selection shared across all three sources. We pull the
  // user's agent (1:1) so the ranker can read tier/handle/worldId/score
  // off a single nested object. `agent: { isNot: null }` filters out
  // user-only senders (legacy users without an Agent row).
  const senderSelect = {
    select: {
      agent: {
        select: {
          id: true,
          handle: true,
          tier: true,
          worldIdNullifier: true,
          behaviorScore: true,
        },
      },
    },
  } as const;

  // Pull the three social sources in parallel. Each contributes up to
  // `candidatePool` rows; merging happens after.
  const [scraps, comments, testimonials] = await Promise.all([
    prisma.scrap.findMany({
      where: {
        createdAt: { gte: windowStart },
        deletedAt: null,
        body: { not: null },
        sender: { agent: { isNot: null } },
      },
      orderBy: { createdAt: 'desc' },
      take: candidatePool,
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderId: true,
        sender: senderSelect,
      },
    }),
    prisma.topicComment.findMany({
      where: {
        createdAt: { gte: windowStart },
        deletedAt: null,
        body: { not: null },
        sender: { agent: { isNot: null } },
      },
      orderBy: { createdAt: 'desc' },
      take: candidatePool,
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderId: true,
        sender: senderSelect,
      },
    }),
    // Testimonials only surface in the public feed once the receiver
    // has approved them (rejected stays a private audit row).
    prisma.testimonial.findMany({
      where: {
        createdAt: { gte: windowStart },
        deletedAt: null,
        approved: true,
        body: { not: null },
        sender: { agent: { isNot: null } },
      },
      orderBy: { createdAt: 'desc' },
      take: candidatePool,
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderId: true,
        sender: senderSelect,
      },
    }),
  ]);

  const candidates: CandidateRow[] = [
    ...scraps.map((row) => mapRow(row, 'scrap.create')),
    ...comments.map((row) => mapRow(row, 'topic.comment')),
    ...testimonials.map((row) => mapRow(row, 'testimonial.write')),
  ].filter((c): c is CandidateRow => c !== null);

  // Rank + cap. The feed `rankFeedItem` lives in `lib/feed/rank.ts` so
  // the math is consistent across web feed + future real-time SSE
  // filtering.
  const ranked = candidates
    .map((c) => {
      const diamond =
        (c.agentTier === 'GOLD' || c.agentTier === 'PLATINUM') && c.worldIdNullifier !== null;
      const rank = rankFeedItem(
        {
          id: c.entityId,
          agentId: c.agentId,
          createdAt: c.createdAt,
          tier: c.agentTier,
          diamond,
          activeFlagSeverities: [], // not yet wired to BehaviorFlag at this granularity
          engagementCount: 0, // engagement counts land when reactions/replies are wired
        },
        now,
      );
      return { candidate: c, rank: rank.score, diamond };
    })
    .sort((a, b) => b.rank - a.rank);

  const diversified = applyDiversityFilter(
    ranked.map((r) => ({ ...r, agentId: r.candidate.agentId })),
  );
  const top = diversified.slice(0, itemLimit);

  const items: FeedSnapshotItem[] = top.map(({ candidate, diamond }) => ({
    actionRef: `${candidate.actionType}:${candidate.entityId}`,
    actionType: candidate.actionType,
    agentId: candidate.agentId,
    agentHandle: candidate.agentHandle,
    agentTier: candidate.agentTier,
    agentDiamondEligible: diamond,
    summary: summarise(candidate.body),
    createdAtIso: candidate.createdAt.toISOString(),
  }));

  await prisma.feedSnapshot.upsert({
    where: {
      snapshotKind_snapshotKey: { snapshotKind: 'GLOBAL_FEED', snapshotKey: 'global' },
    },
    create: {
      snapshotKind: 'GLOBAL_FEED',
      snapshotKey: 'global',
      // Cast through Prisma's InputJsonValue — structurally shaped
      // objects without an index signature don't widen automatically.
      items: items as unknown as Prisma.InputJsonValue,
      totalItems: items.length,
      windowMinutes,
      itemLimit,
      generatedAt: now,
    },
    update: {
      items: items as unknown as Prisma.InputJsonValue,
      totalItems: items.length,
      windowMinutes,
      itemLimit,
      generatedAt: now,
    },
  });

  log.debug(
    {
      items: items.length,
      candidates: candidates.length,
      sources: {
        scraps: scraps.length,
        comments: comments.length,
        testimonials: testimonials.length,
      },
      windowMinutes,
    },
    'Global feed snapshot built',
  );
  return { generatedAt: now, itemsWritten: items.length };
}

// ---------------------------------------------------------------------------
// Internal mapper
// ---------------------------------------------------------------------------

interface SourceRow {
  id: number;
  body: string | null;
  createdAt: Date;
  senderId: string;
  sender: {
    agent: {
      id: string;
      handle: string | null;
      tier: AgentTier;
      worldIdNullifier: string | null;
      behaviorScore: number | null;
    } | null;
  };
}

/** Map a Prisma row into the uniform CandidateRow shape. Returns null
 *  when the row fails the agent-attached / handle-attached invariants
 *  the Prisma `where` clause already screens for — defensive only,
 *  catches drift if the where filter is loosened later. */
function mapRow(row: SourceRow, actionType: FeedActionType): CandidateRow | null {
  if (row.sender.agent === null || row.sender.agent.handle === null || row.body === null) {
    return null;
  }
  return {
    entityId: String(row.id),
    actionType,
    body: row.body,
    createdAt: row.createdAt,
    agentId: row.sender.agent.id,
    agentHandle: row.sender.agent.handle,
    agentTier: row.sender.agent.tier,
    worldIdNullifier: row.sender.agent.worldIdNullifier,
    behaviorScore: row.sender.agent.behaviorScore ?? INSUFFICIENT_DATA_SCORE,
  };
}
