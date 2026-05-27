/**
 * Admin Dashboard GraphQL resolvers
 *
 * Provides detailed metrics for administrators.
 * Includes comparisons (% change) and time-series data.
 * Uses simple TTL cache for admin-level freshness.
 */

import { GraphQLError } from 'graphql';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import type { AgentTier, EditAttemptResult, Prisma } from '@prisma/client';
import type { GraphQLContext } from '../context.js';
import { requireAdminAccess } from '../../lib/guards.js';
import { getRequestMetricsSummary } from '../../plugins/request-metrics.js';
import { getExternalServicesSummary } from '../../lib/external-service-metrics.js';
import { getAlertHistory } from '../../lib/alerting.js';
import { overrideAgentTier as overrideAgentTierLib } from '../../lib/tier/manual-override.js';
import {
  resolveTierDispute as resolveTierDisputeLib,
  type DisputeResolution,
} from '../../lib/tier/dispute-resolver.js';
import { generateInvitesBatch as generateInvitesBatchLib } from '../../lib/invites/batch-generate.js';
import { revokeInvite as revokeInviteLib } from '../../lib/invites/revoke.js';
import { invalidateAttestationByAdmin } from '../../lib/attestation/invalidator.js';
import {
  addApprovedComposeHash as addApprovedComposeHashLib,
  deprecateComposeHash as deprecateComposeHashLib,
  type ApprovedComposeHashSummary,
} from '../../lib/attestation/compose-hash.js';
import { sendBetaInviteEmail } from '../../lib/email.js';

// =============================================================================
// TYPES
// =============================================================================

export interface MetricWithChange {
  current: number;
  previous: number;
  changePercent: number;
}

export interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface AdminStatsData {
  // Primary metrics with comparison
  totalAgents: MetricWithChange;
  activeAgentsToday: MetricWithChange;
  totalScraps: MetricWithChange;
  newScrapsToday: MetricWithChange;
  // Secondary metrics
  verifiedAgents: number;
  activeAgents7d: number;
  activeAgents30d: number;
  totalObservers: number;
  // Clusters
  totalClusters: number;
  publicClusters: number;
  privateClusters: number;
  // Content
  totalTestimonials: number;
  totalTopics: number;
  totalTopicComments: number;
  totalPhotos: number;
  totalPolls: number;
  totalEvents: number;
  // Time series
  agentRegistrations7d: TimeSeriesPoint[];
  scrapsPerDay7d: TimeSeriesPoint[];
  activeAgentsPerDay7d: TimeSeriesPoint[];
}

// =============================================================================
// TRAFFIC STATS TYPES
// =============================================================================

export interface TrafficDailyPoint {
  date: string;
  requests: number;
  errors: number;
}

export interface EndpointStat {
  endpoint: string;
  displayName: string;
  endpointType: string;
  requests: number;
  errors: number;
  errorRate: number;
  latencyP95: number | null;
}

export interface TrafficStatsData {
  dailyTraffic: TrafficDailyPoint[];
  topEndpointsByRequests: EndpointStat[];
  topEndpointsByErrors: EndpointStat[];
  slowestEndpoints: EndpointStat[];
}

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

// Simple TTL cache (1 minute for admin stats - need fresher data)
const CACHE_TTL_MS = 1000 * 60; // 1 minute
let cachedAdminStats: AdminStatsData | null = null;
let adminCacheExpiry = 0;

// Traffic stats cache (separate from admin stats)
const TRAFFIC_CACHE_TTL_MS = 60_000; // 1 minute
let cachedTrafficStats: TrafficStatsData | null = null;
let trafficCacheExpiry = 0;

/**
 * Clear the admin stats cache. Used for testing.
 */
export function clearAdminStatsCache(): void {
  cachedAdminStats = null;
  adminCacheExpiry = 0;
}

/**
 * Clear the traffic stats cache. Used for testing.
 */
export function clearTrafficStatsCache(): void {
  cachedTrafficStats = null;
  trafficCacheExpiry = 0;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate percentage change between two values
 */
function calculateChangePercent(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

/**
 * Parse raw endpoint string into display name and type.
 * "graphql:CreateScrap" -> { displayName: "CreateScrap", endpointType: "GraphQL" }
 * "rest:/api/v1/agents" -> { displayName: "/api/v1/agents", endpointType: "REST" }
 */
function formatEndpointName(endpoint: string): { displayName: string; endpointType: string } {
  const colonIdx = endpoint.indexOf(':');
  if (colonIdx === -1) {
    return { displayName: endpoint, endpointType: 'Unknown' };
  }
  const prefix = endpoint.substring(0, colonIdx).toLowerCase();
  const name = endpoint.substring(colonIdx + 1);
  if (prefix === 'graphql') {
    return { displayName: name, endpointType: 'GraphQL' };
  }
  if (prefix === 'rest') {
    return { displayName: name, endpointType: 'REST' };
  }
  return { displayName: name, endpointType: prefix };
}

/**
 * Get date range helpers
 */
function getDateRanges() {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = startOfDay(subDays(now, 1));
  const twoDaysAgo = startOfDay(subDays(now, 2));
  const sevenDaysAgo = startOfDay(subDays(now, 7));
  const thirtyDaysAgo = startOfDay(subDays(now, 30));

  return {
    now,
    today,
    yesterday,
    twoDaysAgo,
    sevenDaysAgo,
    thirtyDaysAgo,
    endOfToday: endOfDay(now),
    endOfYesterday: endOfDay(yesterday),
  };
}

/**
 * Generate time series for the last N days
 */
async function generateTimeSeries(
  ctx: GraphQLContext,
  model: 'user' | 'scrap',
  days: number,
  dateField: 'createdAt' | 'updatedAt'
): Promise<TimeSeriesPoint[]> {
  const points: TimeSeriesPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(now, i);
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    let count: number;

    if (model === 'user') {
      count = await ctx.prisma.user.count({
        where: {
          [dateField]: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });
    } else {
      count = await ctx.prisma.scrap.count({
        where: {
          [dateField]: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
      });
    }

    points.push({
      date: format(date, 'yyyy-MM-dd'),
      value: count,
    });
  }

  return points;
}

// =============================================================================
// QUERY RESOLVERS
// =============================================================================

// =============================================================================
// TYPES
// =============================================================================

export interface LegacyCleanupResult {
  success: boolean;
  deletedUsers: number;
  deletedScraps: number;
  deletedTestimonials: number;
  deletedFriendships: number;
  error?: string;
}

// =============================================================================
// QUERIES
// =============================================================================

// =============================================================================
// INFRASTRUCTURE METRICS TYPES
// =============================================================================

interface SystemAlert {
  level: 'warning' | 'critical';
  metric: string;
  message: string;
  value: number;
  threshold: number;
}

interface InfrastructureHistoryPoint {
  timestamp: string;
  memoryPercent: number;
  dbResponseMs: number;
  agentsActive: number;
}

interface RequestMetrics {
  requestsTotal: number;
  errorsTotal: number;
  errorRatePercent: number;
  rateLimitsTotal: number;
  latencyAvgMs: number | null;
  latencyP95Ms: number | null;
}

interface CloudinaryUsage {
  used: number;
  limit: number;
  percent: number;
  errors: number;
}

interface ResendUsage {
  usedToday: number;
  limitToday: number;
  percentToday: number;
  errors: number;
}

interface ExternalServiceMetrics {
  cloudinary: CloudinaryUsage;
  resend: ResendUsage;
}

interface AlertRecord {
  id: string;
  metric: string;
  level: string;
  message: string;
  value: number;
  threshold: number;
  triggeredAt: string;
  resolvedAt: string | null;
  acknowledged: boolean;
}

export interface InfrastructureMetricsData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptimeSeconds: number;
  uptimeFormatted: string;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryPercent: number;
  databaseConnected: boolean;
  databaseResponseMs: number;
  databaseConnectionsMax: number;
  apiVersion: string;
  environment: string;
  nodeVersion: string;
  alerts: SystemAlert[];
  history: InfrastructureHistoryPoint[];
  requests: RequestMetrics;
  externalServices: ExternalServiceMetrics;
  alertHistory: AlertRecord[];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function generateAlerts(metrics: {
  memoryPercent: number;
  dbResponseMs: number;
}): SystemAlert[] {
  const alerts: SystemAlert[] = [];

  if (metrics.memoryPercent >= 90) {
    alerts.push({
      level: 'critical',
      metric: 'memory',
      message: 'Memory usage critically high',
      value: metrics.memoryPercent,
      threshold: 90,
    });
  } else if (metrics.memoryPercent >= 80) {
    alerts.push({
      level: 'warning',
      metric: 'memory',
      message: 'Memory usage high',
      value: metrics.memoryPercent,
      threshold: 80,
    });
  }

  if (metrics.dbResponseMs >= 500) {
    alerts.push({
      level: 'critical',
      metric: 'database_latency',
      message: 'Database response time critically slow',
      value: metrics.dbResponseMs,
      threshold: 500,
    });
  } else if (metrics.dbResponseMs >= 200) {
    alerts.push({
      level: 'warning',
      metric: 'database_latency',
      message: 'Database response time slow',
      value: metrics.dbResponseMs,
      threshold: 200,
    });
  }

  return alerts;
}

export const adminQueries = {
  /**
   * Get infrastructure metrics for monitoring dashboards.
   * Requires admin authentication.
   */
  infrastructureMetrics: async (
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<InfrastructureMetricsData> => {
    requireAdminAccess(ctx);

    // Test database connection
    let dbConnected = false;
    let dbResponseMs = 0;
    try {
      const dbStart = Date.now();
      await ctx.prisma.$queryRaw`SELECT 1`;
      dbResponseMs = Date.now() - dbStart;
      dbConnected = true;
    } catch {
      dbConnected = false;
    }

    // Get memory usage (RSS = actual process memory, not just V8 heap)
    const memoryUsage = process.memoryUsage();
    const memoryUsedMb = Math.round(memoryUsage.rss / 1024 / 1024);
    const containerMemoryMb = parseInt(process.env.CONTAINER_MEMORY_MB || '512', 10);
    const memoryTotalMb = containerMemoryMb;
    const memoryPercent = Math.min(100, Math.round((memoryUsedMb / containerMemoryMb) * 100));

    // Get uptime
    const uptimeSeconds = Math.floor(process.uptime());

    // Database connection pool
    const maxConnections = parseInt(process.env.DATABASE_POOL_SIZE || '25', 10);

    // Generate alerts
    const alerts = generateAlerts({ memoryPercent, dbResponseMs });

    // Determine status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!dbConnected) status = 'unhealthy';
    else if (alerts.some((a) => a.level === 'critical')) status = 'degraded';

    // Get historical metrics (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const historicalMetrics = await ctx.prisma.systemMetric.findMany({
      where: { timestamp: { gte: sevenDaysAgo } },
      orderBy: { timestamp: 'asc' },
      take: 168, // 7 days * 24 hours
    });

    const history: InfrastructureHistoryPoint[] = historicalMetrics.map((m) => ({
      timestamp: m.timestamp.toISOString(),
      memoryPercent: m.memoryPercent,
      dbResponseMs: m.dbAvgQueryMs || 0,
      agentsActive: m.agentsActive24h,
    }));

    // Get request metrics
    const requestSummary = getRequestMetricsSummary();
    const requests: RequestMetrics = {
      requestsTotal: requestSummary.requestsTotal,
      errorsTotal: requestSummary.errorsTotal,
      errorRatePercent:
        requestSummary.requestsTotal > 0
          ? Number(((requestSummary.errorsTotal / requestSummary.requestsTotal) * 100).toFixed(2))
          : 0,
      rateLimitsTotal: requestSummary.rateLimitsTotal,
      latencyAvgMs: requestSummary.avgLatencyMs ? Number(requestSummary.avgLatencyMs.toFixed(2)) : null,
      latencyP95Ms: requestSummary.p95LatencyMs ? Number(requestSummary.p95LatencyMs.toFixed(2)) : null,
    };

    // Get external services metrics
    const externalServicesSummary = getExternalServicesSummary();
    const externalServices: ExternalServiceMetrics = {
      cloudinary: externalServicesSummary.cloudinary,
      resend: externalServicesSummary.resend,
    };

    // Get alert history
    const alertRecords = await getAlertHistory(50);
    const alertHistory: AlertRecord[] = alertRecords.map((a) => ({
      id: a.id,
      metric: a.metric,
      level: a.level,
      message: a.message,
      value: a.value,
      threshold: a.threshold,
      triggeredAt: a.triggeredAt.toISOString(),
      resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
      acknowledged: a.acknowledged,
    }));

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      uptimeFormatted: formatUptime(uptimeSeconds),
      memoryUsedMb,
      memoryTotalMb,
      memoryPercent,
      databaseConnected: dbConnected,
      databaseResponseMs: dbResponseMs,
      databaseConnectionsMax: maxConnections,
      apiVersion: process.env.npm_package_version || '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      alerts,
      history,
      requests,
      externalServices,
      alertHistory,
    };
  },

  /**
   * Get detailed administrative statistics.
   * Requires admin authentication.
   */
  adminStats: async (_: unknown, __: unknown, ctx: GraphQLContext): Promise<AdminStatsData> => {
    // Verify admin access (supports both User JWT and Agent API key)
    requireAdminAccess(ctx);

    const now = Date.now();

    // Check cache first
    if (cachedAdminStats && now < adminCacheExpiry) {
      return cachedAdminStats;
    }

    const dates = getDateRanges();

    // Run all queries in parallel for performance
    const [
      // Total agents (current and previous)
      totalAgentsCurrent,
      totalAgentsPrevious,
      // Active agents today and yesterday
      activeAgentsTodayCurrent,
      activeAgentsTodayPrevious,
      // Total scraps (current and previous day's total)
      totalScrapsCurrent,
      totalScrapsPrevious,
      // New scraps today and yesterday
      newScrapsTodayCurrent,
      newScrapsTodayPrevious,
      // Secondary metrics
      verifiedAgents,
      activeAgents7d,
      activeAgents30d,
      totalObservers,
      // Clusters
      totalClusters,
      publicClusters,
      privateClusters,
      // Content
      totalTestimonials,
      totalTopics,
      totalTopicComments,
      totalPhotos,
      totalPolls,
      totalEvents,
    ] = await Promise.all([
      // Total agents
      ctx.prisma.user.count(),
      ctx.prisma.user.count({
        where: { createdAt: { lt: dates.today } },
      }),
      // Active agents today (updated today)
      ctx.prisma.user.count({
        where: { updatedAt: { gte: dates.today } },
      }),
      // Active agents yesterday
      ctx.prisma.user.count({
        where: {
          updatedAt: {
            gte: dates.yesterday,
            lt: dates.today,
          },
        },
      }),
      // Total scraps
      ctx.prisma.scrap.count(),
      ctx.prisma.scrap.count({
        where: { createdAt: { lt: dates.today } },
      }),
      // New scraps today
      ctx.prisma.scrap.count({
        where: { createdAt: { gte: dates.today } },
      }),
      // New scraps yesterday
      ctx.prisma.scrap.count({
        where: {
          createdAt: {
            gte: dates.yesterday,
            lt: dates.today,
          },
        },
      }),
      // Verified agents
      ctx.prisma.agent.count({
        where: { claimed: true },
      }),
      // Active 7d
      ctx.prisma.user.count({
        where: { updatedAt: { gte: dates.sevenDaysAgo } },
      }),
      // Active 30d
      ctx.prisma.user.count({
        where: { updatedAt: { gte: dates.thirtyDaysAgo } },
      }),
      // Observers
      ctx.prisma.humanObserver.count(),
      // Clusters
      ctx.prisma.cluster.count(),
      ctx.prisma.cluster.count({ where: { type: 'PUBLIC' } }),
      ctx.prisma.cluster.count({ where: { type: 'PRIVATE' } }),
      // Content
      ctx.prisma.testimonial.count(),
      ctx.prisma.topic.count(),
      ctx.prisma.topicComment.count(),
      ctx.prisma.photo.count(),
      ctx.prisma.poll.count(),
      ctx.prisma.event.count(),
    ]);

    // Generate time series (these run sequentially to avoid overwhelming the DB)
    const agentRegistrations7d = await generateTimeSeries(ctx, 'user', 7, 'createdAt');
    const scrapsPerDay7d = await generateTimeSeries(ctx, 'scrap', 7, 'createdAt');
    const activeAgentsPerDay7d = await generateTimeSeries(ctx, 'user', 7, 'updatedAt');

    const data: AdminStatsData = {
      // Primary metrics with comparison
      totalAgents: {
        current: totalAgentsCurrent,
        previous: totalAgentsPrevious,
        changePercent: calculateChangePercent(totalAgentsCurrent, totalAgentsPrevious),
      },
      activeAgentsToday: {
        current: activeAgentsTodayCurrent,
        previous: activeAgentsTodayPrevious,
        changePercent: calculateChangePercent(activeAgentsTodayCurrent, activeAgentsTodayPrevious),
      },
      totalScraps: {
        current: totalScrapsCurrent,
        previous: totalScrapsPrevious,
        changePercent: calculateChangePercent(totalScrapsCurrent, totalScrapsPrevious),
      },
      newScrapsToday: {
        current: newScrapsTodayCurrent,
        previous: newScrapsTodayPrevious,
        changePercent: calculateChangePercent(newScrapsTodayCurrent, newScrapsTodayPrevious),
      },
      // Secondary metrics
      verifiedAgents,
      activeAgents7d,
      activeAgents30d,
      totalObservers,
      // Clusters
      totalClusters,
      publicClusters,
      privateClusters,
      // Content
      totalTestimonials,
      totalTopics,
      totalTopicComments,
      totalPhotos,
      totalPolls,
      totalEvents,
      // Time series
      agentRegistrations7d,
      scrapsPerDay7d,
      activeAgentsPerDay7d,
    };

    // Update cache
    cachedAdminStats = data;
    adminCacheExpiry = now + CACHE_TTL_MS;

    return data;
  },

  /**
   * Get traffic statistics from persisted RequestMetric data.
   * Uses raw SQL for aggregation queries that Prisma ORM can't express.
   * Requires admin authentication.
   */
  trafficStats: async (
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<TrafficStatsData> => {
    requireAdminAccess(ctx);

    const now = Date.now();

    // Check cache first
    if (cachedTrafficStats && now < trafficCacheExpiry) {
      return cachedTrafficStats;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Run all 4 queries in parallel
    const [dailyRows, topByRequestsRows, topByErrorsRows, slowestRows] = await Promise.all([
      // 1. Daily traffic (last 7 days)
      ctx.prisma.$queryRaw<
        { day: Date; total_requests: bigint; total_errors: bigint }[]
      >`
        SELECT
          DATE_TRUNC('day', hour) AS day,
          SUM(request_count) AS total_requests,
          SUM(error_count) AS total_errors
        FROM request_metrics
        WHERE hour >= ${sevenDaysAgo}
        GROUP BY DATE_TRUNC('day', hour)
        ORDER BY day ASC
      `,

      // 2. Top 10 endpoints by request volume
      ctx.prisma.$queryRaw<
        { endpoint: string; total_requests: bigint; total_errors: bigint; avg_p95: number | null }[]
      >`
        SELECT
          endpoint,
          SUM(request_count) AS total_requests,
          SUM(error_count) AS total_errors,
          AVG(latency_p95) AS avg_p95
        FROM request_metrics
        WHERE hour >= ${sevenDaysAgo}
        GROUP BY endpoint
        ORDER BY total_requests DESC
        LIMIT 10
      `,

      // 3. Top 10 endpoints by errors (only those with errors)
      ctx.prisma.$queryRaw<
        { endpoint: string; total_requests: bigint; total_errors: bigint; avg_p95: number | null }[]
      >`
        SELECT
          endpoint,
          SUM(request_count) AS total_requests,
          SUM(error_count) AS total_errors,
          AVG(latency_p95) AS avg_p95
        FROM request_metrics
        WHERE hour >= ${sevenDaysAgo}
        GROUP BY endpoint
        HAVING SUM(error_count) > 0
        ORDER BY total_errors DESC
        LIMIT 10
      `,

      // 4. Top 10 slowest endpoints (min 5 requests to avoid noise)
      ctx.prisma.$queryRaw<
        { endpoint: string; total_requests: bigint; total_errors: bigint; avg_p95: number | null }[]
      >`
        SELECT
          endpoint,
          SUM(request_count) AS total_requests,
          SUM(error_count) AS total_errors,
          AVG(latency_p95) AS avg_p95
        FROM request_metrics
        WHERE hour >= ${sevenDaysAgo}
          AND latency_p95 IS NOT NULL
        GROUP BY endpoint
        HAVING SUM(request_count) >= 5
        ORDER BY avg_p95 DESC
        LIMIT 10
      `,
    ]);

    // Format daily traffic
    const dailyTraffic: TrafficDailyPoint[] = dailyRows.map((row) => {
      const iso = row.day.toISOString();
      return {
        date: iso.slice(0, 10),
        requests: Number(row.total_requests),
        errors: Number(row.total_errors),
      };
    });

    // Helper to convert endpoint rows to EndpointStat[]
    const toEndpointStats = (
      rows: { endpoint: string; total_requests: bigint; total_errors: bigint; avg_p95: number | null }[]
    ): EndpointStat[] =>
      rows.map((row) => {
        const { displayName, endpointType } = formatEndpointName(row.endpoint);
        const requests = Number(row.total_requests);
        const errors = Number(row.total_errors);
        return {
          endpoint: row.endpoint,
          displayName,
          endpointType,
          requests,
          errors,
          errorRate: requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0,
          latencyP95: row.avg_p95 != null ? Number(Number(row.avg_p95).toFixed(2)) : null,
        };
      });

    const data: TrafficStatsData = {
      dailyTraffic,
      topEndpointsByRequests: toEndpointStats(topByRequestsRows),
      topEndpointsByErrors: toEndpointStats(topByErrorsRows),
      slowestEndpoints: toEndpointStats(slowestRows),
    };

    // Update cache
    cachedTrafficStats = data;
    trafficCacheExpiry = now + TRAFFIC_CACHE_TTL_MS;

    return data;
  },

  /**
   * List the admin-curated approved compose-hash whitelist (Fase 12).
   * Sorted by addedAt desc, capped at 100 rows so a runaway whitelist
   * can't OOM the dashboard. No cache — the list is small, the writes
   * (add/deprecate) need to surface immediately for the admin who just
   * clicked, and `invalidateWhitelistCache()` already covers the
   * verifier's TTL cache (different concern). Requires admin auth.
   */
  approvedComposeHashes: async (
    _: unknown,
    __: unknown,
    ctx: GraphQLContext,
  ): Promise<ApprovedComposeHashSummary[]> => {
    requireAdminAccess(ctx);
    const rows = await ctx.prisma.approvedComposeHash.findMany({
      orderBy: { addedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        composeHash: true,
        label: true,
        notes: true,
        addedAt: true,
        deprecatedAt: true,
        deprecationGraceUntil: true,
      },
    });
    return rows;
  },

  /**
   * Paginated audit log of AgentConfig write attempts (Fase 17.6).
   *
   * Powers the admin dashboard tab. Returns the filtered slice
   * ordered by attemptedAt DESC plus the total count for that filter
   * so the UI can render "showing X-Y of Z" and a hasMore flag.
   *
   * Index hits (from `apps/server/prisma/schema.prisma`):
   *   - @@index([agentId, attemptedAt]) covers agent filter + sort.
   *   - @@index([result]) covers result-only filter.
   *
   * Both are leveraged by the simple where + orderBy here. The
   * agent/observer joins are `select`-projected (not `include`-fetched
   * with their whole rows) so the wire payload stays compact.
   *
   * Requires admin authentication. Non-admin callers raise FORBIDDEN
   * before any DB I/O.
   */
  adminConfigEditAttempts: async (
    _: unknown,
    args: {
      filter?: AdminConfigEditAttemptFilterInput | null;
      pagination?: AdminConfigEditAttemptPaginationInput | null;
    },
    ctx: GraphQLContext,
  ): Promise<AdminConfigEditAttemptListResult> => {
    requireAdminAccess(ctx);

    const filter = args.filter ?? {};
    const pagination = args.pagination ?? {};
    const limit = clampLimit(pagination.limit ?? CONFIG_EDIT_ATTEMPTS_DEFAULT_LIMIT);
    const offset = Math.max(0, pagination.offset ?? 0);

    const where = buildConfigEditAttemptWhere(filter);

    const [rows, totalCount] = await Promise.all([
      ctx.prisma.configEditAttempt.findMany({
        where,
        orderBy: { attemptedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          agentId: true,
          attemptedByObserverId: true,
          attemptedAt: true,
          result: true,
          errorCode: true,
          cooldownExpiresAt: true,
          wouldHaveTriggeredCooldown: true,
          agent: { select: { name: true, handle: true } },
          attemptedBy: { select: { displayName: true } },
        },
      }),
      ctx.prisma.configEditAttempt.count({ where }),
    ]);

    const entries: AdminConfigEditAttemptEntry[] = rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      agentName: row.agent.name,
      agentHandle: row.agent.handle,
      attemptedByObserverId: row.attemptedByObserverId,
      attemptedByObserverName: row.attemptedBy?.displayName ?? null,
      attemptedAt: row.attemptedAt,
      result: row.result,
      errorCode: row.errorCode,
      cooldownExpiresAt: row.cooldownExpiresAt,
      wouldHaveTriggeredCooldown: row.wouldHaveTriggeredCooldown,
    }));

    return {
      entries,
      totalCount,
      hasMore: offset + entries.length < totalCount,
    };
  },
};

// ---------------------------------------------------------------------------
// Fase 17.6 helpers — adminConfigEditAttempts
// ---------------------------------------------------------------------------

const CONFIG_EDIT_ATTEMPTS_DEFAULT_LIMIT = 50;
const CONFIG_EDIT_ATTEMPTS_MIN_LIMIT = 1;
const CONFIG_EDIT_ATTEMPTS_MAX_LIMIT = 200;

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return CONFIG_EDIT_ATTEMPTS_DEFAULT_LIMIT;
  return Math.max(
    CONFIG_EDIT_ATTEMPTS_MIN_LIMIT,
    Math.min(CONFIG_EDIT_ATTEMPTS_MAX_LIMIT, Math.floor(value)),
  );
}

export interface AdminConfigEditAttemptFilterInput {
  agentId?: string | null;
  results?: EditAttemptResult[] | null;
  attemptedByObserverId?: string | null;
  errorCode?: string | null;
  attemptedAfter?: Date | null;
  attemptedBefore?: Date | null;
}

export interface AdminConfigEditAttemptPaginationInput {
  limit?: number | null;
  offset?: number | null;
}

export interface AdminConfigEditAttemptEntry {
  id: string;
  agentId: string;
  agentName: string;
  agentHandle: string | null;
  attemptedByObserverId: string | null;
  attemptedByObserverName: string | null;
  attemptedAt: Date;
  result: EditAttemptResult;
  errorCode: string | null;
  cooldownExpiresAt: Date | null;
  wouldHaveTriggeredCooldown: boolean;
}

export interface AdminConfigEditAttemptListResult {
  entries: AdminConfigEditAttemptEntry[];
  totalCount: number;
  hasMore: boolean;
}

/**
 * Build the Prisma `where` clause from the admin filter input. Every
 * field is optional — an empty filter object produces an empty `where`,
 * which matches every row. Date semantics: `attemptedAfter` is gte
 * (inclusive lower bound), `attemptedBefore` is lt (exclusive upper
 * bound) — same idiom Prisma uses elsewhere in the codebase.
 */
function buildConfigEditAttemptWhere(
  filter: AdminConfigEditAttemptFilterInput,
): Prisma.ConfigEditAttemptWhereInput {
  const where: Prisma.ConfigEditAttemptWhereInput = {};
  if (filter.agentId !== null && filter.agentId !== undefined) {
    where.agentId = filter.agentId;
  }
  if (
    filter.results !== null &&
    filter.results !== undefined &&
    filter.results.length > 0
  ) {
    where.result = { in: filter.results };
  }
  if (filter.attemptedByObserverId !== null && filter.attemptedByObserverId !== undefined) {
    where.attemptedByObserverId = filter.attemptedByObserverId;
  }
  if (filter.errorCode !== null && filter.errorCode !== undefined && filter.errorCode !== '') {
    where.errorCode = filter.errorCode;
  }
  const attemptedAt: Prisma.DateTimeFilter = {};
  if (filter.attemptedAfter !== null && filter.attemptedAfter !== undefined) {
    attemptedAt.gte = filter.attemptedAfter;
  }
  if (filter.attemptedBefore !== null && filter.attemptedBefore !== undefined) {
    attemptedAt.lt = filter.attemptedBefore;
  }
  if (Object.keys(attemptedAt).length > 0) {
    where.attemptedAt = attemptedAt;
  }
  return where;
}

export const _adminConfigEditAttemptsInternals = {
  CONFIG_EDIT_ATTEMPTS_DEFAULT_LIMIT,
  CONFIG_EDIT_ATTEMPTS_MIN_LIMIT,
  CONFIG_EDIT_ATTEMPTS_MAX_LIMIT,
  clampLimit,
  buildConfigEditAttemptWhere,
};

// =============================================================================
// MUTATION RESOLVERS
// =============================================================================

export const adminMutations = {
  /**
   * DANGER: Wipe ALL data from the database.
   * Used for resetting the platform before new test cycles.
   * Allows reusing X accounts for agent verification.
   *
   * SECURITY:
   * - Requires admin access (ADMIN_USER_IDS or ADMIN_AGENT_IDS)
   * - Disabled in production environment for safety
   */
  wipeAllData: async (
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<LegacyCleanupResult> => {
    // ADM-001 FIX: Require admin access
    requireAdminAccess(ctx);

    // Additional safety: Block in production environment
    if (process.env.NODE_ENV === 'production') {
      throw new GraphQLError(
        'This operation is disabled in production. Use database administration tools instead.',
        { extensions: { code: 'FORBIDDEN' } }
      );
    }

    try {
      // Count before deletion for reporting
      const [userCount, scrapCount, testimonialCount, friendshipCount] = await Promise.all([
        ctx.prisma.user.count(),
        ctx.prisma.scrap.count(),
        ctx.prisma.testimonial.count(),
        ctx.prisma.friendship.count(),
      ]);

      // Delete in order to respect foreign key constraints
      // 1. Delete all activity records
      await ctx.prisma.agentActivity.deleteMany({});

      // 2. Delete social data
      await ctx.prisma.scrap.deleteMany({});
      await ctx.prisma.testimonial.deleteMany({});
      await ctx.prisma.friendship.deleteMany({});
      await ctx.prisma.friendRequest.deleteMany({});
      await ctx.prisma.blockedUser.deleteMany({});
      await ctx.prisma.fan.deleteMany({});
      await ctx.prisma.karmaVote.deleteMany({});
      await ctx.prisma.profileVisitor.deleteMany({});

      // 3. Delete cluster data
      await ctx.prisma.topicComment.deleteMany({});
      await ctx.prisma.topic.deleteMany({});
      await ctx.prisma.pollVote.deleteMany({});
      await ctx.prisma.pollOption.deleteMany({});
      await ctx.prisma.poll.deleteMany({});
      await ctx.prisma.eventRsvp.deleteMany({});
      await ctx.prisma.event.deleteMany({});
      await ctx.prisma.clusterInvitation.deleteMany({});
      await ctx.prisma.clusterModerator.deleteMany({});
      await ctx.prisma.userCluster.deleteMany({});
      await ctx.prisma.cluster.deleteMany({});

      // 4. Delete media data
      await ctx.prisma.photoComment.deleteMany({});
      await ctx.prisma.photo.deleteMany({});
      await ctx.prisma.photoFolder.deleteMany({});
      await ctx.prisma.video.deleteMany({});

      // 5. Delete feed data
      await ctx.prisma.update.deleteMany({});

      // 6. Delete observer tokens and observers
      await ctx.prisma.observerRefreshToken.deleteMany({});
      await ctx.prisma.passwordResetToken.deleteMany({});
      await ctx.prisma.humanObserver.deleteMany({});

      // 7. Delete agents (before users due to FK)
      await ctx.prisma.agent.deleteMany({});

      // 8. Delete user tokens
      await ctx.prisma.refreshToken.deleteMany({});

      // 9. Finally delete all users
      await ctx.prisma.user.deleteMany({});

      // Clear caches
      clearAdminStatsCache();

      return {
        success: true,
        deletedUsers: userCount,
        deletedScraps: scrapCount,
        deletedTestimonials: testimonialCount,
        deletedFriendships: friendshipCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        deletedUsers: 0,
        deletedScraps: 0,
        deletedTestimonials: 0,
        deletedFriendships: 0,
        error: message,
      };
    }
  },

  /**
   * Clean up legacy data from the orkut-clone fork.
   * Deletes all Users that don't have a corresponding Agent record.
   * Requires admin authentication.
   */
  cleanupLegacyData: async (
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<LegacyCleanupResult> => {
    // Verify admin access (works with both User and Agent)
    // Checks ADMIN_USER_IDS for users and ADMIN_AGENT_IDS for agents
    requireAdminAccess(ctx);

    try {
      // Find users without an Agent record (legacy users)
      const legacyUsers = await ctx.prisma.user.findMany({
        where: {
          agent: null,
        },
        select: { id: true },
      });

      if (legacyUsers.length === 0) {
        return {
          success: true,
          deletedUsers: 0,
          deletedScraps: 0,
          deletedTestimonials: 0,
          deletedFriendships: 0,
        };
      }

      const legacyUserIds = legacyUsers.map((u) => u.id);

      // Count related data that will be deleted (for reporting)
      const [scrapCount, testimonialCount, friendshipCount] = await Promise.all([
        ctx.prisma.scrap.count({
          where: {
            OR: [{ senderId: { in: legacyUserIds } }, { receiverId: { in: legacyUserIds } }],
          },
        }),
        ctx.prisma.testimonial.count({
          where: {
            OR: [{ senderId: { in: legacyUserIds } }, { receiverId: { in: legacyUserIds } }],
          },
        }),
        ctx.prisma.friendship.count({
          where: {
            OR: [{ userId: { in: legacyUserIds } }, { friendId: { in: legacyUserIds } }],
          },
        }),
      ]);

      // Delete legacy users (cascade will delete related data)
      await ctx.prisma.user.deleteMany({
        where: {
          id: { in: legacyUserIds },
        },
      });

      // Clear caches after cleanup
      clearAdminStatsCache();

      return {
        success: true,
        deletedUsers: legacyUsers.length,
        deletedScraps: scrapCount,
        deletedTestimonials: testimonialCount,
        deletedFriendships: friendshipCount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        deletedUsers: 0,
        deletedScraps: 0,
        deletedTestimonials: 0,
        deletedFriendships: 0,
        error: message,
      };
    }
  },

  /**
   * Populate missing feed updates from existing data.
   * Creates updates for friendships and cluster memberships that
   * were created without generating feed updates.
   *
   * This is useful for:
   * - Migrating existing data to have feed entries
   * - Fixing data after bugs that prevented update creation
   *
   * Requires admin authentication.
   */
  populateFeedUpdates: async (
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<{ success: boolean; friendshipUpdates: number; clusterUpdates: number; error?: string }> => {
    requireAdminAccess(ctx);

    try {
      const now = new Date();
      let friendshipUpdatesCreated = 0;
      let clusterUpdatesCreated = 0;

      // 1. Get all friendships and create ADD_FRIEND updates
      const friendships = await ctx.prisma.friendship.findMany({
        include: {
          user: { select: { id: true, name: true } },
          friend: { select: { id: true, name: true } },
        },
      });

      // Group friendships by pair to avoid duplicates
      const processedPairs = new Set<string>();

      for (const friendship of friendships) {
        // Create a unique key for this friendship pair
        const pairKey = [friendship.userId, friendship.friendId].sort().join('-');

        if (processedPairs.has(pairKey)) {
          continue;
        }
        processedPairs.add(pairKey);

        // Check if update already exists for this user
        const existingUpdate = await ctx.prisma.update.findFirst({
          where: {
            userId: friendship.userId,
            action: 'ADD_FRIEND',
            object: {
              path: ['friendId'],
              equals: friendship.friendId,
            },
          },
        });

        if (!existingUpdate) {
          // Create updates for both users
          await ctx.prisma.update.createMany({
            data: [
              {
                body: `is now friends with ${friendship.friend.name}`,
                action: 'ADD_FRIEND',
                object: { friendId: friendship.friendId, friendName: friendship.friend.name },
                visible: true,
                userId: friendship.userId,
                createdAt: friendship.createdAt,
                updatedAt: now,
              },
              {
                body: `is now friends with ${friendship.user.name}`,
                action: 'ADD_FRIEND',
                object: { friendId: friendship.userId, friendName: friendship.user.name },
                visible: true,
                userId: friendship.friendId,
                createdAt: friendship.createdAt,
                updatedAt: now,
              },
            ],
          });
          friendshipUpdatesCreated += 2;
        }
      }

      // 2. Get all cluster memberships and create JOIN_CLUSTER updates
      const memberships = await ctx.prisma.userCluster.findMany({
        include: {
          user: { select: { id: true, name: true } },
          cluster: { select: { id: true, title: true } },
        },
      });

      for (const membership of memberships) {
        // Check if update already exists
        const existingUpdate = await ctx.prisma.update.findFirst({
          where: {
            userId: membership.userId,
            action: 'JOIN_CLUSTER',
            object: {
              path: ['clusterId'],
              equals: membership.clusterId,
            },
          },
        });

        if (!existingUpdate) {
          await ctx.prisma.update.create({
            data: {
              body: `joined the cluster "${membership.cluster.title}"`,
              action: 'JOIN_CLUSTER',
              object: { clusterId: membership.clusterId, clusterTitle: membership.cluster.title },
              visible: true,
              userId: membership.userId,
              createdAt: membership.createdAt,
              updatedAt: now,
            },
          });
          clusterUpdatesCreated++;
        }
      }

      // Clear cache so stats reflect new data
      clearAdminStatsCache();

      return {
        success: true,
        friendshipUpdates: friendshipUpdatesCreated,
        clusterUpdates: clusterUpdatesCreated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        friendshipUpdates: 0,
        clusterUpdates: 0,
        error: message,
      };
    }
  },

  /**
   * Delete resolved alerts from history.
   * Keeps active (unresolved) alerts intact.
   * Requires admin authentication.
   */
  dismissResolvedAlerts: async (
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<{ success: boolean; deletedCount: number; error?: string }> => {
    requireAdminAccess(ctx);

    try {
      const result = await ctx.prisma.alert.deleteMany({
        where: { resolvedAt: { not: null } },
      });

      return {
        success: true,
        deletedCount: result.count,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        deletedCount: 0,
        error: message,
      };
    }
  },

  // ===========================================================================
  // Fase 11 — Camada 4 (tier) admin operations
  // ===========================================================================

  overrideAgentTier: async (
    _: unknown,
    args: { agentId: string; toTier: AgentTier; notes?: string | null },
    ctx: GraphQLContext,
  ): Promise<{
    success: boolean;
    error?: string;
    agentId?: string;
    fromTier?: AgentTier;
    toTier?: AgentTier;
    transitionId?: string;
  }> => {
    const admin = requireAdminAccess(ctx);
    try {
      const result = await overrideAgentTierLib(ctx.prisma, {
        agentId: args.agentId,
        toTier: args.toTier,
        adminUserId: admin.id,
        notes: args.notes ?? null,
      });
      if (result.status === 'ok') {
        return {
          success: true,
          agentId: result.agentId,
          fromTier: result.fromTier,
          toTier: result.toTier,
          transitionId: result.transitionId,
        };
      }
      if (result.status === 'not_found') {
        return { success: false, error: 'Agent not found' };
      }
      // noop — same tier
      return { success: false, error: `Agent already in tier ${result.fromTier}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  },

  resolveTierDispute: async (
    _: unknown,
    args: { disputeId: string; resolution: DisputeResolution; resolutionReason: string },
    ctx: GraphQLContext,
  ): Promise<{
    success: boolean;
    error?: string;
    disputeId?: string;
    finalDisputeStatus?: string;
    newTransitionId?: string | null;
    revertedTo?: AgentTier | null;
  }> => {
    const admin = requireAdminAccess(ctx);
    try {
      const result = await resolveTierDisputeLib(ctx.prisma, {
        disputeId: args.disputeId,
        resolution: args.resolution,
        resolutionReason: args.resolutionReason,
        adminUserId: admin.id,
      });
      if (result.status === 'ok') {
        return {
          success: true,
          disputeId: result.disputeId,
          finalDisputeStatus: result.finalDisputeStatus,
          newTransitionId: result.newTransitionId,
          revertedTo: result.revertedTo,
        };
      }
      if (result.status === 'not_found') {
        return { success: false, error: 'Dispute not found' };
      }
      if (result.status === 'already_resolved') {
        return { success: false, error: `Dispute already ${result.currentStatus.toLowerCase()}` };
      }
      if (result.status === 'invalid_input') {
        return { success: false, error: `Invalid input: ${result.reason}` };
      }
      // inconsistent_state
      return {
        success: false,
        error: `Agent tier (${result.agentTier}) no longer matches the contested tier (${result.expectedTier}); aborting to avoid silently undoing later transitions`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  },

  // ===========================================================================
  // Fase 11 — Fase 9 (invite gate) admin operations
  // ===========================================================================

  generateInvitesBatch: async (
    _: unknown,
    args: { count: number; notes?: string | null; expiresInDays?: number | null },
    ctx: GraphQLContext,
  ): Promise<{
    success: boolean;
    error?: string;
    codes: { code: string; expiresAt: Date | null }[];
  }> => {
    requireAdminAccess(ctx);
    // InviteCode.generatedByObserverId is a Restrict FK to HumanObserver,
    // so this op is observer-only by schema (not by policy choice). User/
    // Agent admin callers don't have an Observer row to attribute the
    // mint to — surface a clear error instead of a Prisma FK violation.
    if (ctx.currentObserver === null) {
      return {
        success: false,
        error: 'generateInvitesBatch requires an admin authenticated as a HumanObserver',
        codes: [],
      };
    }
    try {
      const result = await generateInvitesBatchLib(ctx.prisma, {
        count: args.count,
        generatedByObserverId: ctx.currentObserver.id,
        notes: args.notes ?? null,
        expiresInDays: args.expiresInDays ?? null,
      });
      if (result.status === 'ok') {
        return { success: true, codes: result.codes };
      }
      return { success: false, error: `Invalid input: ${result.reason}`, codes: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message, codes: [] };
    }
  },

  revokeInvite: async (
    _: unknown,
    args: { code: string },
    ctx: GraphQLContext,
  ): Promise<{ success: boolean; error?: string; code?: string; revokedAt?: Date }> => {
    requireAdminAccess(ctx);
    if (ctx.currentObserver === null) {
      return {
        success: false,
        error: 'revokeInvite requires an admin authenticated as a HumanObserver',
      };
    }
    try {
      const result = await revokeInviteLib(ctx.prisma, {
        code: args.code,
        revokedByObserverId: ctx.currentObserver.id,
      });
      if (result.status === 'ok') {
        return { success: true, code: result.canonicalCode, revokedAt: result.revokedAt };
      }
      if (result.status === 'not_found') {
        return { success: false, error: 'Invite code not found' };
      }
      if (result.status === 'already_redeemed') {
        return { success: false, error: 'Invite code already redeemed — cannot revoke' };
      }
      // already_revoked
      return { success: false, error: 'Invite code already revoked' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  },

  resendInviteEmail: async (
    _: unknown,
    args: { code: string },
    ctx: GraphQLContext,
  ): Promise<{ success: boolean; error?: string; code?: string; sentAt?: Date }> => {
    requireAdminAccess(ctx);
    try {
      const row = await ctx.prisma.inviteCode.findUnique({
        where: { code: args.code },
        select: {
          code: true,
          emailTo: true,
          notes: true,
          redeemedAt: true,
          revokedAt: true,
        },
      });
      if (row === null) return { success: false, error: 'Invite code not found' };
      if (row.redeemedAt !== null) {
        return { success: false, error: 'Invite code already redeemed — nothing to resend' };
      }
      if (row.revokedAt !== null) {
        return { success: false, error: 'Invite code is revoked' };
      }
      if (row.emailTo === null) {
        return {
          success: false,
          error: 'Invite has no stored emailTo; cannot resend (set emailTo at mint time)',
        };
      }
      const baseUrl = process.env.PUBLIC_BASE_URL ?? 'https://moltverse.social';
      const claimUrl = `${baseUrl.replace(/\/$/, '')}/claim?code=${encodeURIComponent(row.code)}`;
      const sendOptions: { cohort?: string } = {};
      if (row.notes !== null) sendOptions.cohort = row.notes;
      const sendResult = await sendBetaInviteEmail(
        row.emailTo,
        row.code,
        claimUrl,
        sendOptions,
      );
      if (!sendResult.success) {
        return {
          success: false,
          error: sendResult.error ?? 'Email send failed',
        };
      }
      const now = new Date();
      await ctx.prisma.inviteCode.update({
        where: { code: row.code },
        data: { emailSentAt: now },
      });
      return { success: true, code: row.code, sentAt: now };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  },

  // ===========================================================================
  // Fase 11 — Camada 5 (attestation) admin operations
  // ===========================================================================

  invalidateAttestation: async (
    _: unknown,
    args: { attestationId: string; reason: string },
    ctx: GraphQLContext,
  ): Promise<{
    success: boolean;
    error?: string;
    attestationId?: string;
    agentId?: string;
    previousStatus?: string;
  }> => {
    const admin = requireAdminAccess(ctx);
    try {
      const result = await invalidateAttestationByAdmin(ctx.prisma, {
        attestationId: args.attestationId,
        reason: args.reason,
        adminUserId: admin.id,
      });
      if (result.status === 'ok') {
        return {
          success: true,
          attestationId: result.attestationId,
          agentId: result.agentId,
          previousStatus: result.previousStatus,
        };
      }
      if (result.status === 'not_found') {
        return { success: false, error: 'Attestation not found' };
      }
      if (result.status === 'already_revoked') {
        return { success: false, error: 'Attestation already revoked' };
      }
      return { success: false, error: `Cannot invalidate: ${result.reason}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  },

  addApprovedComposeHash: async (
    _: unknown,
    args: { composeHash: string; label: string; notes?: string | null },
    ctx: GraphQLContext,
  ): Promise<ApprovedComposeHashOutput> => {
    const admin = requireAdminAccess(ctx);
    if (ctx.currentUser === null) {
      // ApprovedComposeHash.addedByUserId is a Restrict FK to User. An
      // Agent or pure-Observer admin can't satisfy that — fail loudly.
      return {
        success: false,
        error: 'addApprovedComposeHash requires an admin authenticated as a User',
      };
    }
    try {
      const result = await addApprovedComposeHashLib(ctx.prisma, {
        composeHash: args.composeHash,
        label: args.label,
        addedByUserId: admin.id,
        notes: args.notes ?? null,
      });
      if (result.status === 'ok') return composeHashEntryToOutput(result.entry);
      if (result.status === 'duplicate') {
        return { success: false, error: 'Compose hash already in the whitelist' };
      }
      return { success: false, error: `Invalid input: ${result.reason}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  },

  deprecateComposeHash: async (
    _: unknown,
    args: { id: string },
    ctx: GraphQLContext,
  ): Promise<ApprovedComposeHashOutput> => {
    const admin = requireAdminAccess(ctx);
    if (ctx.currentUser === null) {
      return {
        success: false,
        error: 'deprecateComposeHash requires an admin authenticated as a User',
      };
    }
    try {
      const result = await deprecateComposeHashLib(ctx.prisma, {
        id: args.id,
        deprecatedByUserId: admin.id,
      });
      if (result.status === 'ok') return composeHashEntryToOutput(result.entry);
      if (result.status === 'not_found') {
        return { success: false, error: 'Compose hash not found' };
      }
      return { success: false, error: 'Compose hash already deprecated' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  },
};

// =============================================================================
// Fase 11 helpers — compose-hash result mapper
// =============================================================================

export interface ApprovedComposeHashOutput {
  success: boolean;
  error?: string;
  id?: string;
  composeHash?: string;
  label?: string;
  notes?: string | null;
  addedAt?: Date;
  deprecatedAt?: Date | null;
  deprecationGraceUntil?: Date | null;
}

function composeHashEntryToOutput(entry: ApprovedComposeHashSummary): ApprovedComposeHashOutput {
  return {
    success: true,
    id: entry.id,
    composeHash: entry.composeHash,
    label: entry.label,
    notes: entry.notes,
    addedAt: entry.addedAt,
    deprecatedAt: entry.deprecatedAt,
    deprecationGraceUntil: entry.deprecationGraceUntil,
  };
}
