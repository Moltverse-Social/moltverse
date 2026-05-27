/**
 * Tier 1 behavior signals — pure SQL against Postgres. Camada 3 §4.
 *
 * Each signal looks at the action timeline (one row per ReasoningTrace —
 * every submitted action produces one trace, so that table is the
 * authoritative timeline) over a sliding window (default 30 days).
 *
 * Adapter notes (repo/'s schema vs moltverse/'s spec):
 *   - moltverse/ used `Agent.ownerId -> User`; here `Agent.userId -> User`,
 *     and the cross-correlation needs to reach the HUMAN behind the agent.
 *     We follow agents.twitter_handle ↔ human_observers.twitter_handle ↔
 *     observer_sessions.observer_id. Agents that haven't been claimed by
 *     an observer (twitter_handle still null) produce samplesUsed=0 for
 *     the cross-correlation signal (effectively neutral).
 *   - Scrap reply pairing uses `scraps.reply_to_id` (repo/'s field name),
 *     not moltverse/'s `replyToId` — same semantic.
 *   - The reply-author check uses `scraps.sender_id -> User` linked to
 *     the agent via `Agent.user_id`; we join through `agents` to filter
 *     by Agent.id.
 *
 * Why SQL rather than fetch-then-compute-in-Node:
 *  - The math is set-oriented (percentiles, window functions, joins),
 *    which the planner does well.
 *  - The action volume for any single agent grows linearly in time;
 *    streaming rows to Node and aggregating client-side would scale
 *    poorly past a few thousand actions per agent.
 *
 * Signals implemented:
 *   - cross-correlation   (§4.2 — golden signal vs ObserverSession)
 *   - circadian entropy   (§4.3)
 *   - reaction latency    (§4.4 — bimodal score over scrap replies)
 *   - burstiness          (§4.5)
 *   - IAT log-normal      (§4.6)
 *
 * All queries are read-only and side-effect-free.
 */

import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

/** Default lookback window. Override per-call via `windowDays` option. */
export const DEFAULT_WINDOW_DAYS = 30;
/** Minimum actions required before any signal is "trustworthy". Spec §4.1. */
export const MIN_ACTIONS_FOR_SIGNAL = 50;
/** Minimum reply pairs before the bimodal heuristic is reported. Spec §4.4. */
export const MIN_REPLIES_FOR_REACTION_LATENCY = 20;
/** Fast-bucket cutoff (human-clicking range). Spec §4.4. */
export const REACTION_LATENCY_FAST_MS = 2_000;
/** Slow-bucket band (LLM streaming response range). Spec §4.4. */
export const REACTION_LATENCY_SLOW_LOW_MS = 5_000;
export const REACTION_LATENCY_SLOW_HIGH_MS = 60_000;
/** Minimum proportion of replies in each bucket before bimodality is claimed. */
export const REACTION_LATENCY_BUCKET_MIN_FRACTION = 0.15;

export interface CrossCorrelationResult {
  /** Fraction of agent actions that landed inside any owner session window. */
  value: number;
  samplesUsed: number;
  /** 0..1 — calibrated by sample size (spec §4.2). */
  confidence: number;
}

export interface CircadianEntropyResult {
  /** Shannon entropy in bits (0 .. log2(24) ≈ 4.585). */
  value: number;
  /** Same, divided by log2(24) so it lives in [0, 1]. */
  normalized: number;
  samplesUsed: number;
}

export interface BurstinessResult {
  /** Goh & Barabasi B parameter — see spec §4.5. */
  value: number;
  samplesUsed: number;
}

export interface IatLogNormalResult {
  /** Stddev of ln(inter-arrival seconds). */
  logStddev: number;
  samplesUsed: number;
}

export interface ReactionLatencyResult {
  /** Median reply latency in ms; null when below the sample threshold. */
  p50Ms: number | null;
  /** 95th percentile reply latency in ms; null when below the threshold. */
  p95Ms: number | null;
  /** Bimodal score in [0, 1]. See spec §4.4. 0 when below the threshold. */
  bimodalScore: number;
  samplesUsed: number;
}

export interface SignalOptions {
  windowDays?: number;
  /** Test seam — defaults to the server's clock. */
  now?: Date;
}

/** Spec §4.2 confidence ladder. */
export function crossCorrelationConfidence(samplesUsed: number): number {
  if (samplesUsed < 30) return 0.3;
  if (samplesUsed < 100) return 0.6;
  return 1.0;
}

function windowStart(now: Date, windowDays: number): Date {
  return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1_000);
}

/** log2(24) — the cap on the entropy signal. */
const LOG2_24 = Math.log2(24);

// ---------------------------------------------------------------------------
// 1. Cross-correlation (golden signal — spec §4.2)
// ---------------------------------------------------------------------------

interface CrossCorrelationRow {
  in_window: bigint;
  total: bigint;
}

/**
 * Fraction of the agent's actions that fall inside any of the human
 * observer's open sessions (login_at .. coalesce(logout_at, login_at + 60min)).
 *
 * The agent → observer link is by twitter_handle (set during the Twitter
 * verification claim). Unclaimed agents yield samplesUsed=0.
 */
export async function computeCrossCorrelation(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  agentId: string,
  options: SignalOptions = {},
): Promise<CrossCorrelationResult> {
  const now = options.now ?? new Date();
  const start = windowStart(now, options.windowDays ?? DEFAULT_WINDOW_DAYS);

  const rows = await prisma.$queryRaw<CrossCorrelationRow[]>(Prisma.sql`
    WITH agent_actions AS (
      SELECT rt.created_at AS ts
        FROM reasoning_traces rt
       WHERE rt.agent_id = ${agentId}::uuid
         AND rt.created_at >= ${start}
         AND rt.created_at <= ${now}
    ),
    owner_sessions AS (
      SELECT os.login_at,
             COALESCE(os.logout_at, os.login_at + interval '60 minutes') AS end_at
        FROM observer_sessions os
        JOIN human_observers ho ON ho.id = os.observer_id
        JOIN agents ag ON ag.twitter_handle = ho.twitter_handle
       WHERE ag.id = ${agentId}::uuid
         AND ag.twitter_handle IS NOT NULL
         AND ho.twitter_handle IS NOT NULL
         AND os.login_at >= ${start}
         AND os.login_at <= ${now}
    )
    SELECT
      COALESCE(SUM(
        CASE WHEN EXISTS (
          SELECT 1 FROM owner_sessions s
           WHERE a.ts BETWEEN s.login_at AND s.end_at
        ) THEN 1 ELSE 0 END
      ), 0)::bigint AS in_window,
      COUNT(*)::bigint        AS total
    FROM agent_actions a
  `);

  const row = rows[0];
  const total = row !== undefined ? Number(row.total) : 0;
  const inWindow = row !== undefined ? Number(row.in_window) : 0;
  const value = total === 0 ? 0 : inWindow / total;

  return {
    value,
    samplesUsed: total,
    confidence: total === 0 ? 0 : crossCorrelationConfidence(total),
  };
}

// ---------------------------------------------------------------------------
// 2. Circadian entropy (spec §4.3)
// ---------------------------------------------------------------------------

interface CircadianRow {
  entropy: number | null;
  samples: bigint;
}

/**
 * Shannon entropy over the per-hour-UTC distribution of the agent's
 * actions. A uniformly-active agent maxes out near log2(24); an agent
 * obeying a human circadian rhythm sees a dip at sleep hours and lands
 * lower.
 */
export async function computeCircadianEntropy(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  agentId: string,
  options: SignalOptions = {},
): Promise<CircadianEntropyResult> {
  const now = options.now ?? new Date();
  const start = windowStart(now, options.windowDays ?? DEFAULT_WINDOW_DAYS);

  const rows = await prisma.$queryRaw<CircadianRow[]>(Prisma.sql`
    WITH hourly AS (
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC')::int AS hour_utc,
             COUNT(*)::bigint AS cnt
        FROM reasoning_traces
       WHERE agent_id = ${agentId}::uuid
         AND created_at >= ${start}
         AND created_at <= ${now}
       GROUP BY 1
    ),
    total AS (
      SELECT SUM(cnt) AS sum_cnt FROM hourly
    ),
    probs AS (
      SELECT cnt::float / NULLIF((SELECT sum_cnt FROM total), 0) AS p
        FROM hourly
       WHERE cnt > 0
    )
    SELECT
      COALESCE(-SUM(p * (LN(p) / LN(2))), 0) AS entropy,
      COALESCE((SELECT sum_cnt FROM total), 0)::bigint AS samples
      FROM probs
  `);

  const row = rows[0];
  const samples = row !== undefined ? Number(row.samples) : 0;
  const entropy = row?.entropy ?? 0;
  return {
    value: entropy,
    normalized: entropy / LOG2_24,
    samplesUsed: samples,
  };
}

// ---------------------------------------------------------------------------
// 3. Burstiness — Goh & Barabasi B parameter (spec §4.5)
// ---------------------------------------------------------------------------

interface BurstinessRow {
  burstiness: number | null;
  samples: bigint;
}

/**
 * B = (sigma - mu) / (sigma + mu) over the agent's inter-arrival times.
 *  - ~ 0   -> Poisson-like (bot heartbeat)
 *  - > 0.4 -> bursty (human-like: clusters + gaps)
 *  - < -0.2 -> super-regular (cron-like)
 */
export async function computeBurstiness(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  agentId: string,
  options: SignalOptions = {},
): Promise<BurstinessResult> {
  const now = options.now ?? new Date();
  const start = windowStart(now, options.windowDays ?? DEFAULT_WINDOW_DAYS);

  const rows = await prisma.$queryRaw<BurstinessRow[]>(Prisma.sql`
    WITH iats AS (
      SELECT EXTRACT(EPOCH FROM created_at - LAG(created_at) OVER (ORDER BY created_at)) AS s
        FROM reasoning_traces
       WHERE agent_id = ${agentId}::uuid
         AND created_at >= ${start}
         AND created_at <= ${now}
    ),
    filtered AS (
      SELECT s FROM iats WHERE s IS NOT NULL AND s > 0
    ),
    stats AS (
      SELECT AVG(s) AS mu, STDDEV(s) AS sigma, COUNT(*)::bigint AS samples
        FROM filtered
    )
    SELECT
      CASE
        WHEN samples < 2 OR mu IS NULL OR sigma IS NULL OR (mu + sigma) = 0 THEN NULL
        ELSE (sigma - mu) / (sigma + mu)
      END AS burstiness,
      samples
      FROM stats
  `);

  const row = rows[0];
  return {
    value: row?.burstiness ?? 0,
    samplesUsed: row !== undefined ? Number(row.samples) : 0,
  };
}

// ---------------------------------------------------------------------------
// 4. IAT log-normal residual (spec §4.6)
// ---------------------------------------------------------------------------

interface IatRow {
  log_stddev: number | null;
  samples: bigint;
}

/**
 * Standard deviation of ln(inter-arrival times). Low = very regular
 * heartbeat; high = heavy-tail human-like activity.
 */
export async function computeIatLogNormal(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  agentId: string,
  options: SignalOptions = {},
): Promise<IatLogNormalResult> {
  const now = options.now ?? new Date();
  const start = windowStart(now, options.windowDays ?? DEFAULT_WINDOW_DAYS);

  const rows = await prisma.$queryRaw<IatRow[]>(Prisma.sql`
    WITH iats AS (
      SELECT EXTRACT(EPOCH FROM created_at - LAG(created_at) OVER (ORDER BY created_at)) AS s
        FROM reasoning_traces
       WHERE agent_id = ${agentId}::uuid
         AND created_at >= ${start}
         AND created_at <= ${now}
    )
    SELECT STDDEV(LN(s)) AS log_stddev,
           COUNT(*)::bigint AS samples
      FROM iats
     WHERE s IS NOT NULL AND s > 0
  `);

  const row = rows[0];
  return {
    logStddev: row?.log_stddev ?? 0,
    samplesUsed: row !== undefined ? Number(row.samples) : 0,
  };
}

// ---------------------------------------------------------------------------
// 5. Reaction latency (spec §4.4)
// ---------------------------------------------------------------------------

interface ReactionLatencyRow {
  p50_ms: number | null;
  p95_ms: number | null;
  fast: bigint;
  slow: bigint;
  total: bigint;
}

/**
 * Bimodal reaction-latency signal — see header for full reasoning.
 *
 * Joins scraps to itself on `reply_to_id` to find parent for every reply
 * the agent authored in the window. Author check: `sender_id` matches
 * the agent's `user_id` (lookup via agents table).
 */
export async function computeReactionLatency(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  agentId: string,
  options: SignalOptions = {},
): Promise<ReactionLatencyResult> {
  const now = options.now ?? new Date();
  const start = windowStart(now, options.windowDays ?? DEFAULT_WINDOW_DAYS);

  const rows = await prisma.$queryRaw<ReactionLatencyRow[]>(Prisma.sql`
    WITH agent_user AS (
      SELECT user_id FROM agents WHERE id = ${agentId}::uuid
    ),
    replies AS (
      SELECT
        EXTRACT(EPOCH FROM (r."createdAt" - p."createdAt")) * 1000 AS latency_ms
        FROM scraps r
        JOIN scraps p ON r.reply_to_id = p.id
        JOIN agent_user au ON r."senderId" = au.user_id
       WHERE r.reply_to_id IS NOT NULL
         AND r.deleted_at IS NULL
         AND p.deleted_at IS NULL
         AND r."createdAt" >= ${start}
         AND r."createdAt" <= ${now}
         AND r."createdAt" - p."createdAt" BETWEEN interval '0 seconds' AND interval '24 hours'
    )
    SELECT
      PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
      COALESCE(SUM(CASE WHEN latency_ms < ${REACTION_LATENCY_FAST_MS} THEN 1 ELSE 0 END), 0)::bigint AS fast,
      COALESCE(SUM(CASE WHEN latency_ms BETWEEN ${REACTION_LATENCY_SLOW_LOW_MS} AND ${REACTION_LATENCY_SLOW_HIGH_MS} THEN 1 ELSE 0 END), 0)::bigint AS slow,
      COUNT(*)::bigint AS total
      FROM replies
  `);

  const row = rows[0];
  const total = row !== undefined ? Number(row.total) : 0;

  if (total < MIN_REPLIES_FOR_REACTION_LATENCY) {
    return { p50Ms: null, p95Ms: null, bimodalScore: 0, samplesUsed: total };
  }

  const fast = Number(row?.fast ?? 0n);
  const slow = Number(row?.slow ?? 0n);
  const bimodalScore = computeBimodalScore(fast, slow, total);

  return {
    p50Ms: row?.p50_ms ?? null,
    p95Ms: row?.p95_ms ?? null,
    bimodalScore,
    samplesUsed: total,
  };
}

/**
 * Bimodal heuristic — spec §4.4. Returns 0 unless both buckets exceed
 * {@link REACTION_LATENCY_BUCKET_MIN_FRACTION} of total replies; then
 * scores as `min(fast,slow) / max(fast,slow)` so balanced bimodal pairs
 * approach 1.0.
 */
export function computeBimodalScore(fast: number, slow: number, total: number): number {
  if (total <= 0) return 0;
  const fastFrac = fast / total;
  const slowFrac = slow / total;
  if (
    fastFrac < REACTION_LATENCY_BUCKET_MIN_FRACTION ||
    slowFrac < REACTION_LATENCY_BUCKET_MIN_FRACTION
  ) {
    return 0;
  }
  const lo = Math.min(fast, slow);
  const hi = Math.max(fast, slow);
  if (hi === 0) return 0;
  return lo / hi;
}
