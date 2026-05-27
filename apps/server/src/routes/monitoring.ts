/**
 * System Monitoring Routes
 *
 * Provides metrics collection and historical data for monitoring.
 * Main health endpoints are in index.ts (/health, /health/detailed, etc.)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { getRequestMetricsSummary } from '../plugins/request-metrics.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Timing-safe token comparison to prevent side-channel attacks.
 * Normalizes both values to fixed-length SHA-256 hashes before comparing.
 */
function isValidMonitoringToken(provided: string, expected: string): boolean {
  const providedHash = crypto.createHash('sha256').update(provided).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(providedHash, expectedHash);
}

// ============================================================================
// TYPES
// ============================================================================

interface HistoryPoint {
  timestamp: string;
  memoryPercent: number;
  dbResponseMs: number;
  agentsActive: number;
}

interface MetricsResponse {
  timestamp: string;
  memory: {
    usedMb: number;
    totalMb: number;
    percent: number;
  };
  database: {
    responseMs: number;
  };
  agents: {
    total: number;
    active24h: number;
  };
  history: HistoryPoint[];
}

// ============================================================================
// HELPERS
// ============================================================================

function getStartOf24hAgo(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

// ============================================================================
// ROUTES
// ============================================================================

export async function monitoringRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/monitoring/metrics
   *
   * Returns metrics with historical data for charts.
   * Protected: requires monitoring token if configured.
   */
  fastify.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const monitoringToken = process.env.MONITORING_TOKEN;

    // Require MONITORING_TOKEN in production
    if (!monitoringToken) {
      if (process.env.NODE_ENV === 'production') {
        reply.status(403);
        return { error: 'Monitoring token not configured' };
      }
      // Allow unauthenticated access in development
    } else {
      const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!providedToken || !isValidMonitoringToken(providedToken, monitoringToken)) {
        reply.status(401);
        return { error: 'Unauthorized' };
      }
    }

    const startOf24hAgo = getStartOf24hAgo();
    const startOf7dAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Memory - use RSS (Resident Set Size) for actual process memory usage.
    // heapUsed/heapTotal gives misleading percentages because V8 adjusts heapTotal dynamically.
    const memoryUsage = process.memoryUsage();
    const memoryUsedMb = Math.round(memoryUsage.rss / 1024 / 1024);
    const containerLimitMb = parseInt(process.env.CONTAINER_MEMORY_MB || '512', 10);
    const memoryTotalMb = containerLimitMb;
    const memoryPercent = Math.round((memoryUsedMb / memoryTotalMb) * 100);

    // Database
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbResponseMs = Date.now() - dbStart;

    // Get historical metrics from database
    const historicalMetrics = await prisma.systemMetric.findMany({
      where: {
        timestamp: { gte: startOf7dAgo },
      },
      orderBy: { timestamp: 'asc' },
      take: 168, // 7 days * 24 hours
    });

    // Get agent stats
    const [agentsTotal, agentsActive24h] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.count({ where: { lastSeenAt: { gte: startOf24hAgo } } }),
    ]);

    const response: MetricsResponse = {
      timestamp: new Date().toISOString(),
      memory: {
        usedMb: memoryUsedMb,
        totalMb: memoryTotalMb,
        percent: memoryPercent,
      },
      database: {
        responseMs: dbResponseMs,
      },
      agents: {
        total: agentsTotal,
        active24h: agentsActive24h,
      },
      history: historicalMetrics.map((m) => ({
        timestamp: m.timestamp.toISOString(),
        memoryPercent: m.memoryPercent,
        dbResponseMs: m.dbAvgQueryMs || 0,
        agentsActive: m.agentsActive24h,
      })),
    };

    return response;
  });

  /**
   * POST /api/v1/monitoring/snapshot
   *
   * Records a snapshot of current metrics to the database.
   * Called by a scheduled job (cron) or manually.
   */
  fastify.post('/snapshot', async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const monitoringToken = process.env.MONITORING_TOKEN;

    // Require MONITORING_TOKEN in production
    if (!monitoringToken) {
      if (process.env.NODE_ENV === 'production') {
        reply.status(403);
        return { error: 'Monitoring token not configured' };
      }
    } else {
      const providedToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!providedToken || !isValidMonitoringToken(providedToken, monitoringToken)) {
        reply.status(401);
        return { error: 'Unauthorized' };
      }
    }

    const startOf24hAgo = getStartOf24hAgo();

    // Collect all metrics
    // memoryUsedMb = RSS (Resident Set Size) — actual process memory footprint
    // memoryTotalMb = container limit (CONTAINER_MEMORY_MB env var, default 512)
    // memoryPercent = RSS / container limit
    const memoryUsage = process.memoryUsage();
    const memoryUsedMb = memoryUsage.rss / 1024 / 1024;
    const containerLimitMb = parseInt(process.env.CONTAINER_MEMORY_MB || '512', 10);
    const memoryTotalMb = containerLimitMb;
    const memoryPercent = (memoryUsedMb / memoryTotalMb) * 100;

    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbResponseMs = Date.now() - dbStart;

    const [agentsTotal, agentsActive24h] = await Promise.all([
      prisma.agent.count(),
      prisma.agent.count({ where: { lastSeenAt: { gte: startOf24hAgo } } }),
    ]);

    // Collect request metrics from the in-memory buffer
    const requestMetrics = getRequestMetricsSummary();

    // Save snapshot (memoryUsedMb = RSS, memoryTotalMb = container limit)
    const metric = await prisma.systemMetric.create({
      data: {
        memoryUsedMb,
        memoryTotalMb,
        memoryPercent,
        uptimeSeconds: Math.floor(process.uptime()),
        dbConnectionsActive: 1,
        dbConnectionsMax: parseInt(process.env.DATABASE_POOL_SIZE || '25', 10),
        dbAvgQueryMs: dbResponseMs,
        requestsTotal: requestMetrics.requestsTotal,
        requestsErrors: requestMetrics.errorsTotal,
        avgLatencyMs: requestMetrics.avgLatencyMs ?? 0,
        rateLimitsTriggered: requestMetrics.rateLimitsTotal,
        agentsActive24h,
        agentsTotal,
      },
    });

    return {
      success: true,
      snapshotId: metric.id,
      timestamp: metric.timestamp.toISOString(),
    };
  });
}
