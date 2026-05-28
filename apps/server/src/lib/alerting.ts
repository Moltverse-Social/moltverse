/**
 * Alerting System
 *
 * Provides persistent alerting with lifecycle management.
 * Supports configurable thresholds, auto-resolution, and deduplication.
 *
 * Features:
 * - Persistent alerts in database
 * - Auto-resolution when metrics normalize
 * - Deduplication via fingerprint
 * - Configurable thresholds from database
 */

import crypto from 'crypto';
import { prisma } from './prisma.js';
import { getRequestMetricsSummary } from '../plugins/request-metrics.js';
import { getExternalServicesSummary } from './external-service-metrics.js';

// =============================================================================
// TYPES
// =============================================================================

export type AlertLevel = 'warning' | 'critical';

export interface AlertDefinition {
  metric: string;
  level: AlertLevel;
  message: string;
  value: number;
  threshold: number;
}

interface ThresholdConfig {
  warningThreshold: number;
  criticalThreshold: number;
  enabled: boolean;
  operator: 'gte' | 'lte' | 'gt' | 'lt';
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Default thresholds (used if not in database)
const DEFAULT_THRESHOLDS: Record<string, ThresholdConfig> = {
  memory_percent: {
    warningThreshold: 80,
    criticalThreshold: 90,
    enabled: true,
    operator: 'gte',
  },
  db_latency_ms: {
    warningThreshold: 200,
    criticalThreshold: 500,
    enabled: true,
    operator: 'gte',
  },
  cloudinary_quota_percent: {
    warningThreshold: 80,
    criticalThreshold: 95,
    enabled: true,
    operator: 'gte',
  },
  resend_daily_percent: {
    warningThreshold: 80,
    criticalThreshold: 95,
    enabled: true,
    operator: 'gte',
  },
  error_rate_percent: {
    warningThreshold: 5,
    criticalThreshold: 10,
    enabled: true,
    operator: 'gte',
  },
};

// Evaluation interval in ms (1 minute)
const EVAL_INTERVAL_MS = parseInt(process.env.ALERT_EVAL_INTERVAL || '60', 10) * 1000;

// =============================================================================
// STATE
// =============================================================================

let evalTimer: ReturnType<typeof setInterval> | null = null;
const thresholdsCache: Map<string, ThresholdConfig> = new Map();
let lastThresholdLoad = 0;
const THRESHOLD_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate fingerprint for alert deduplication
 */
function generateFingerprint(metric: string, level: AlertLevel): string {
  const data = `${metric}:${level}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Check if value exceeds threshold based on operator
 */
function exceedsThreshold(value: number, threshold: number, operator: string): boolean {
  switch (operator) {
    case 'gte':
      return value >= threshold;
    case 'gt':
      return value > threshold;
    case 'lte':
      return value <= threshold;
    case 'lt':
      return value < threshold;
    default:
      return value >= threshold;
  }
}

/**
 * Load thresholds from database with caching
 */
async function loadThresholds(): Promise<void> {
  if (Date.now() - lastThresholdLoad < THRESHOLD_CACHE_TTL_MS && thresholdsCache.size > 0) {
    return;
  }

  try {
    const dbThresholds = await prisma.alertThreshold.findMany({
      where: { enabled: true },
    });

    thresholdsCache.clear();

    // Load from database
    for (const t of dbThresholds) {
      thresholdsCache.set(t.metric, {
        warningThreshold: t.warningThreshold,
        criticalThreshold: t.criticalThreshold,
        enabled: t.enabled,
        operator: t.operator as 'gte' | 'lte' | 'gt' | 'lt',
      });
    }

    // Fill in defaults for missing metrics
    for (const [metric, config] of Object.entries(DEFAULT_THRESHOLDS)) {
      if (!thresholdsCache.has(metric)) {
        thresholdsCache.set(metric, config);
      }
    }

    lastThresholdLoad = Date.now();
  } catch (error) {
    console.error('[Alerting] Failed to load thresholds:', error);
    // Use defaults on error
    for (const [metric, config] of Object.entries(DEFAULT_THRESHOLDS)) {
      thresholdsCache.set(metric, config);
    }
  }
}

/**
 * Get threshold for a metric
 */
function getThreshold(metric: string): ThresholdConfig | undefined {
  return thresholdsCache.get(metric) || DEFAULT_THRESHOLDS[metric];
}

// =============================================================================
// ALERT LIFECYCLE
// =============================================================================

/**
 * Create or update an alert.
 *
 * Uses findFirst + create/update pattern. The partial unique index
 * (fingerprint WHERE resolved_at IS NULL) prevents duplicates at the
 * DB level. If a race condition causes P2002, we retry as an update.
 */
async function triggerAlert(alert: AlertDefinition): Promise<void> {
  const fingerprint = generateFingerprint(alert.metric, alert.level);

  try {
    // Check for existing unresolved alert with same fingerprint
    const existing = await prisma.alert.findFirst({
      where: {
        fingerprint,
        resolvedAt: null,
      },
    });

    if (existing) {
      // Update existing alert with new value
      await prisma.alert.update({
        where: { id: existing.id },
        data: {
          value: alert.value,
          message: alert.message,
        },
      });
    } else {
      // Create new alert
      await prisma.alert.create({
        data: {
          metric: alert.metric,
          level: alert.level,
          message: alert.message,
          value: alert.value,
          threshold: alert.threshold,
          fingerprint,
        },
      });

      console.warn(`[Alerting] ${alert.level.toUpperCase()}: ${alert.message} (${alert.value})`);
    }
  } catch (error) {
    // P2002 = unique constraint violation from the partial index.
    // Another process created the alert between our findFirst and create.
    // Fall back to updating the existing alert instead.
    const prismaError = error as { code?: string };
    if (prismaError.code === 'P2002') {
      try {
        const existing = await prisma.alert.findFirst({
          where: { fingerprint, resolvedAt: null },
        });
        if (existing) {
          await prisma.alert.update({
            where: { id: existing.id },
            data: { value: alert.value, message: alert.message },
          });
        }
      } catch (retryError) {
        console.error('[Alerting] Failed to update alert after race condition:', retryError);
      }
      return;
    }
    console.error('[Alerting] Failed to trigger alert:', error);
  }
}

/**
 * Resolve alerts for a metric when value normalizes
 */
async function resolveAlerts(metric: string): Promise<void> {
  try {
    await prisma.alert.updateMany({
      where: {
        metric,
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
      },
    });
  } catch (error) {
    console.error('[Alerting] Failed to resolve alerts:', error);
  }
}

// =============================================================================
// METRIC EVALUATION
// =============================================================================

/**
 * Evaluate a single metric against thresholds
 */
async function evaluateMetric(
  metric: string,
  value: number,
  getMessage: (level: AlertLevel) => string
): Promise<void> {
  const config = getThreshold(metric);
  if (!config || !config.enabled) return;

  const { warningThreshold, criticalThreshold, operator } = config;

  // Check critical first (higher priority)
  if (exceedsThreshold(value, criticalThreshold, operator)) {
    await triggerAlert({
      metric,
      level: 'critical',
      message: getMessage('critical'),
      value,
      threshold: criticalThreshold,
    });
  } else if (exceedsThreshold(value, warningThreshold, operator)) {
    await triggerAlert({
      metric,
      level: 'warning',
      message: getMessage('warning'),
      value,
      threshold: warningThreshold,
    });
  } else {
    // Value is normal - resolve any existing alerts
    await resolveAlerts(metric);
  }
}

/**
 * Collect current metrics and evaluate all thresholds
 */
async function evaluateAllMetrics(): Promise<void> {
  await loadThresholds();

  try {
    // Memory metrics (RSS vs container limit, not V8 heap)
    const memoryUsage = process.memoryUsage();
    const containerMemoryMb = parseInt(process.env.CONTAINER_MEMORY_MB || '512', 10);
    const memoryPercent = Math.min(100, Math.round(
      (memoryUsage.rss / 1024 / 1024 / containerMemoryMb) * 100
    ));

    await evaluateMetric('memory_percent', memoryPercent, (level) =>
      level === 'critical'
        ? 'Memory usage critically high'
        : 'Memory usage high'
    );

    // Database latency
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - dbStart;

    await evaluateMetric('db_latency_ms', dbLatencyMs, (level) =>
      level === 'critical'
        ? 'Database response time critically slow'
        : 'Database response time slow'
    );

    // External services
    const externalServices = getExternalServicesSummary();

    await evaluateMetric(
      'cloudinary_quota_percent',
      externalServices.cloudinary.percent,
      (level) =>
        level === 'critical'
          ? 'Cloudinary quota critically high'
          : 'Cloudinary quota nearing limit'
    );

    await evaluateMetric(
      'resend_daily_percent',
      externalServices.resend.percentToday,
      (level) =>
        level === 'critical'
          ? 'Resend daily quota critically high'
          : 'Resend daily quota nearing limit'
    );

    // Error rate
    const requestMetrics = getRequestMetricsSummary();
    const errorRate =
      requestMetrics.requestsTotal > 0
        ? (requestMetrics.errorsTotal / requestMetrics.requestsTotal) * 100
        : 0;

    await evaluateMetric('error_rate_percent', errorRate, (level) =>
      level === 'critical'
        ? 'Error rate critically high'
        : 'Error rate elevated'
    );
  } catch (error) {
    console.error('[Alerting] Failed to evaluate metrics:', error);
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get active (unresolved) alerts
 */
export async function getActiveAlerts(): Promise<
  Array<{
    id: string;
    metric: string;
    level: string;
    message: string;
    value: number;
    threshold: number;
    triggeredAt: Date;
    acknowledged: boolean;
  }>
> {
  return prisma.alert.findMany({
    where: { resolvedAt: null },
    orderBy: { triggeredAt: 'desc' },
    select: {
      id: true,
      metric: true,
      level: true,
      message: true,
      value: true,
      threshold: true,
      triggeredAt: true,
      acknowledged: true,
    },
  });
}

/**
 * Get alert history (including resolved)
 */
export async function getAlertHistory(
  limit: number = 50
): Promise<
  Array<{
    id: string;
    metric: string;
    level: string;
    message: string;
    value: number;
    threshold: number;
    triggeredAt: Date;
    resolvedAt: Date | null;
    acknowledged: boolean;
  }>
> {
  return prisma.alert.findMany({
    orderBy: { triggeredAt: 'desc' },
    take: limit,
    select: {
      id: true,
      metric: true,
      level: true,
      message: true,
      value: true,
      threshold: true,
      triggeredAt: true,
      resolvedAt: true,
      acknowledged: true,
    },
  });
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId: string): Promise<boolean> {
  try {
    await prisma.alert.update({
      where: { id: alertId },
      data: { acknowledged: true },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Start the alerting system
 */
export function startAlerting(): void {
  if (evalTimer) return;

  // Initial evaluation
  evaluateAllMetrics().catch((err) => {
    console.error('[Alerting] Initial evaluation failed:', err);
  });

  // Schedule periodic evaluation
  evalTimer = setInterval(() => {
    evaluateAllMetrics().catch((err) => {
      console.error('[Alerting] Scheduled evaluation failed:', err);
    });
  }, EVAL_INTERVAL_MS);

  console.log(`[Alerting] Started with ${EVAL_INTERVAL_MS / 1000}s evaluation interval`);
}

/**
 * Stop the alerting system
 */
export function stopAlerting(): void {
  if (evalTimer) {
    clearInterval(evalTimer);
    evalTimer = null;
    console.log('[Alerting] Stopped');
  }
}

/**
 * Seed default alert thresholds
 */
export async function seedAlertThresholds(): Promise<void> {
  for (const [metric, config] of Object.entries(DEFAULT_THRESHOLDS)) {
    try {
      await prisma.alertThreshold.upsert({
        where: { metric },
        update: {}, // Don't update existing
        create: {
          metric,
          warningThreshold: config.warningThreshold,
          criticalThreshold: config.criticalThreshold,
          enabled: config.enabled,
          operator: config.operator,
        },
      });
    } catch (error) {
      console.error(`[Alerting] Failed to seed threshold for ${metric}:`, error);
    }
  }
  console.log('[Alerting] Default thresholds seeded');
}
