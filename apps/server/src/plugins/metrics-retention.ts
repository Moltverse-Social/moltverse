/**
 * Metrics Retention Plugin
 *
 * Handles data retention policies and automated aggregation.
 * Runs daily to cleanup old data and create aggregations.
 *
 * Retention policies:
 * - system_metrics: 90 days
 * - request_metrics: 30 days
 * - external_service_metrics: 90 days
 * - alerts (resolved): 180 days
 *
 * Aggregations:
 * - Daily aggregate: created at 3h UTC
 * - Weekly aggregate: created on Mondays
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Retention periods in days
const RETENTION_SYSTEM_METRICS = parseInt(process.env.METRICS_RETENTION_SYSTEM || '90', 10);
const RETENTION_REQUEST_METRICS = parseInt(process.env.METRICS_RETENTION_REQUEST || '30', 10);
const RETENTION_EXTERNAL_METRICS = 90;
const RETENTION_ALERTS = parseInt(process.env.METRICS_RETENTION_ALERTS || '180', 10);

// Run cleanup daily at 3h UTC
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get date N days ago
 */
function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get start of yesterday
 */
function getYesterdayStart(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Get start of last week (Monday)
 */
function getLastWeekStart(): Date {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) - 7; // Previous Monday
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// =============================================================================
// CLEANUP FUNCTIONS
// =============================================================================

/**
 * Cleanup old system metrics
 */
async function cleanupSystemMetrics(): Promise<number> {
  const cutoff = daysAgo(RETENTION_SYSTEM_METRICS);
  const result = await prisma.systemMetric.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Cleanup old request metrics
 */
async function cleanupRequestMetrics(): Promise<number> {
  const cutoff = daysAgo(RETENTION_REQUEST_METRICS);
  const result = await prisma.requestMetric.deleteMany({
    where: { hour: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Cleanup old external service metrics
 */
async function cleanupExternalMetrics(): Promise<number> {
  const cutoff = daysAgo(RETENTION_EXTERNAL_METRICS);
  const result = await prisma.externalServiceMetric.deleteMany({
    where: { hour: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Cleanup old resolved alerts
 */
async function cleanupAlerts(): Promise<number> {
  const cutoff = daysAgo(RETENTION_ALERTS);
  const result = await prisma.alert.deleteMany({
    where: {
      resolvedAt: { not: null, lt: cutoff },
    },
  });
  return result.count;
}

// =============================================================================
// AGGREGATION FUNCTIONS
// =============================================================================

/**
 * Create daily aggregate for yesterday
 */
async function createDailyAggregate(): Promise<boolean> {
  const periodStart = getYesterdayStart();

  // Check if aggregate already exists
  const existing = await prisma.metricAggregate.findUnique({
    where: {
      period_periodStart: {
        period: 'daily',
        periodStart,
      },
    },
  });

  if (existing) return false;

  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + 1);

  // Collect metrics for the day
  const [
    agentsTotal,
    agentsActive,
    agentsVerified,
    observersTotal,
    scrapsTotal,
    scrapsCreated,
    clustersTotal,
    systemMetrics,
    requestMetrics,
  ] = await Promise.all([
    prisma.user.count({ where: { createdAt: { lt: periodEnd } } }),
    prisma.user.count({
      where: { updatedAt: { gte: periodStart, lt: periodEnd } },
    }),
    prisma.agent.count({ where: { claimed: true, claimedAt: { lt: periodEnd } } }),
    prisma.humanObserver.count({ where: { createdAt: { lt: periodEnd } } }),
    prisma.scrap.count({ where: { createdAt: { lt: periodEnd } } }),
    prisma.scrap.count({
      where: { createdAt: { gte: periodStart, lt: periodEnd } },
    }),
    prisma.cluster.count({ where: { createdAt: { lt: periodEnd } } }),
    prisma.systemMetric.findMany({
      where: { timestamp: { gte: periodStart, lt: periodEnd } },
      select: { memoryPercent: true, dbAvgQueryMs: true },
    }),
    prisma.requestMetric.findMany({
      where: { hour: { gte: periodStart, lt: periodEnd } },
      select: { requestCount: true, errorCount: true },
    }),
  ]);

  // Calculate averages
  const memoryAvgPercent =
    systemMetrics.length > 0
      ? systemMetrics.reduce((sum, m) => sum + m.memoryPercent, 0) / systemMetrics.length
      : null;

  const dbAvgLatencyMs =
    systemMetrics.length > 0
      ? systemMetrics.reduce((sum, m) => sum + (m.dbAvgQueryMs || 0), 0) /
        systemMetrics.length
      : null;

  const requestsTotal = requestMetrics.reduce((sum, m) => sum + m.requestCount, 0);
  const errorsTotal = requestMetrics.reduce((sum, m) => sum + m.errorCount, 0);

  // Create aggregate
  await prisma.metricAggregate.create({
    data: {
      period: 'daily',
      periodStart,
      agentsTotal,
      agentsActive,
      agentsVerified,
      observersTotal,
      scrapsTotal,
      scrapsCreated,
      clustersTotal,
      memoryAvgPercent,
      dbAvgLatencyMs,
      requestsTotal,
      errorsTotal,
    },
  });

  return true;
}

/**
 * Create weekly aggregate for last week
 */
async function createWeeklyAggregate(): Promise<boolean> {
  // Only run on Mondays
  const today = new Date().getDay();
  if (today !== 1) return false;

  const periodStart = getLastWeekStart();

  // Check if aggregate already exists
  const existing = await prisma.metricAggregate.findUnique({
    where: {
      period_periodStart: {
        period: 'weekly',
        periodStart,
      },
    },
  });

  if (existing) return false;

  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + 7);

  // Aggregate daily metrics for the week
  const dailyAggregates = await prisma.metricAggregate.findMany({
    where: {
      period: 'daily',
      periodStart: { gte: periodStart, lt: periodEnd },
    },
  });

  if (dailyAggregates.length === 0) return false;

  // Sum/average the daily aggregates
  // Safe: length > 0 guaranteed by the guard above
  const lastDaily = dailyAggregates[dailyAggregates.length - 1]!;

  const memoryAvgPercent =
    dailyAggregates.filter((d) => d.memoryAvgPercent !== null).length > 0
      ? dailyAggregates.reduce((sum, d) => sum + (d.memoryAvgPercent || 0), 0) /
        dailyAggregates.filter((d) => d.memoryAvgPercent !== null).length
      : null;

  const dbAvgLatencyMs =
    dailyAggregates.filter((d) => d.dbAvgLatencyMs !== null).length > 0
      ? dailyAggregates.reduce((sum, d) => sum + (d.dbAvgLatencyMs || 0), 0) /
        dailyAggregates.filter((d) => d.dbAvgLatencyMs !== null).length
      : null;

  await prisma.metricAggregate.create({
    data: {
      period: 'weekly',
      periodStart,
      agentsTotal: lastDaily.agentsTotal,
      agentsActive: dailyAggregates.reduce((sum, d) => sum + d.agentsActive, 0),
      agentsVerified: lastDaily.agentsVerified,
      observersTotal: lastDaily.observersTotal,
      scrapsTotal: lastDaily.scrapsTotal,
      scrapsCreated: dailyAggregates.reduce((sum, d) => sum + d.scrapsCreated, 0),
      clustersTotal: lastDaily.clustersTotal,
      memoryAvgPercent,
      dbAvgLatencyMs,
      requestsTotal: dailyAggregates.reduce((sum, d) => sum + d.requestsTotal, 0),
      errorsTotal: dailyAggregates.reduce((sum, d) => sum + d.errorsTotal, 0),
    },
  });

  return true;
}

// =============================================================================
// MAIN JOB
// =============================================================================

/**
 * Run all retention and aggregation tasks
 */
async function runRetentionJob(): Promise<void> {
  const startTime = Date.now();

  try {
    // Run cleanup tasks
    const [
      systemMetricsDeleted,
      requestMetricsDeleted,
      externalMetricsDeleted,
      alertsDeleted,
    ] = await Promise.all([
      cleanupSystemMetrics(),
      cleanupRequestMetrics(),
      cleanupExternalMetrics(),
      cleanupAlerts(),
    ]);

    const totalDeleted =
      systemMetricsDeleted +
      requestMetricsDeleted +
      externalMetricsDeleted +
      alertsDeleted;

    if (totalDeleted > 0) {
      console.log(
        `[MetricsRetention] Cleanup: ${systemMetricsDeleted} system, ${requestMetricsDeleted} request, ${externalMetricsDeleted} external, ${alertsDeleted} alerts`
      );
    }

    // Run aggregation tasks
    const dailyCreated = await createDailyAggregate();
    const weeklyCreated = await createWeeklyAggregate();

    if (dailyCreated || weeklyCreated) {
      console.log(
        `[MetricsRetention] Aggregations: daily=${dailyCreated}, weekly=${weeklyCreated}`
      );
    }

    const duration = Date.now() - startTime;
    console.log(`[MetricsRetention] Job completed in ${duration}ms`);
  } catch (error) {
    console.error('[MetricsRetention] Job failed:', error);
  }
}

// =============================================================================
// PLUGIN
// =============================================================================

async function metricsRetentionPlugin(fastify: FastifyInstance): Promise<void> {
  // Run initial job after a short delay (let other systems initialize)
  setTimeout(() => {
    runRetentionJob().catch((err) => {
      console.error('[MetricsRetention] Initial run failed:', err);
    });
  }, 10000); // 10 seconds after startup

  // Schedule daily job
  const retentionTimer = setInterval(() => {
    runRetentionJob().catch((err) => {
      console.error('[MetricsRetention] Scheduled run failed:', err);
    });
  }, CLEANUP_INTERVAL_MS);

  // Cleanup on shutdown
  fastify.addHook('onClose', async () => {
    clearInterval(retentionTimer);
  });

  fastify.log.info(
    `[MetricsRetention] Initialized - retention: system=${RETENTION_SYSTEM_METRICS}d, request=${RETENTION_REQUEST_METRICS}d, alerts=${RETENTION_ALERTS}d`
  );
}

export default fp(metricsRetentionPlugin, {
  name: 'metrics-retention',
  fastify: '5.x',
});
