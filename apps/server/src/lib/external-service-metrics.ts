/**
 * External Service Metrics
 *
 * Tracks usage and errors for external services (Cloudinary, Resend).
 * Provides quota monitoring and error tracking.
 *
 * Features:
 * - In-memory accumulation with periodic flush
 * - Quota tracking with configurable limits
 * - Error logging for debugging
 */

import { prisma } from './prisma.js';

// =============================================================================
// TYPES
// =============================================================================

export type ServiceName = 'cloudinary' | 'resend';

interface ServiceMetrics {
  apiCalls: number;
  bytesUsed: bigint;
  quotaUsed: number;
  errorCount: number;
  lastError: string | null;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Cloudinary: 25 credits/month on free tier
// Each transformation counts as 1 credit, uploads count as 1-3 credits
const CLOUDINARY_MONTHLY_LIMIT = parseInt(process.env.CLOUDINARY_MONTHLY_LIMIT || '25', 10);

// Resend: 100 emails/day on free tier
const RESEND_DAILY_LIMIT = parseInt(process.env.RESEND_DAILY_LIMIT || '100', 10);

// Flush interval in ms (1 minute)
const FLUSH_INTERVAL_MS = 60 * 1000;

// =============================================================================
// STATE
// =============================================================================

// In-memory buffer for current hour's metrics
// Key: service name -> ServiceMetrics
const metricsBuffer = new Map<ServiceName, ServiceMetrics>();

// Track last flush time
let lastFlushTime = Date.now();

// Daily/monthly counters for quota tracking
let cloudinaryMonthlyUsage = 0;
let resendDailyUsage = 0;
let lastQuotaResetDay = new Date().toDateString();
let lastQuotaResetMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get the current hour as ISO string (truncated to hour)
 */
function getCurrentHour(): Date {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now;
}

/**
 * Initialize or get metrics buffer for a service
 */
function getBuffer(service: ServiceName): ServiceMetrics {
  let buffer = metricsBuffer.get(service);
  if (!buffer) {
    buffer = {
      apiCalls: 0,
      bytesUsed: BigInt(0),
      quotaUsed: 0,
      errorCount: 0,
      lastError: null,
    };
    metricsBuffer.set(service, buffer);
  }
  return buffer;
}

/**
 * Reset quotas if period has changed
 */
function checkQuotaReset(): void {
  const today = new Date().toDateString();
  const thisMonth = new Date().toISOString().slice(0, 7);

  // Reset daily quota (Resend)
  if (today !== lastQuotaResetDay) {
    resendDailyUsage = 0;
    lastQuotaResetDay = today;
  }

  // Reset monthly quota (Cloudinary)
  if (thisMonth !== lastQuotaResetMonth) {
    cloudinaryMonthlyUsage = 0;
    lastQuotaResetMonth = thisMonth;
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Track a Cloudinary API call
 *
 * @param bytes - Bytes uploaded (for bandwidth tracking)
 * @param credits - Credits used (default: 1)
 * @param error - Error message if call failed
 */
export function trackCloudinaryCall(
  bytes: number = 0,
  credits: number = 1,
  error?: string
): void {
  checkQuotaReset();

  const buffer = getBuffer('cloudinary');
  buffer.apiCalls++;
  buffer.bytesUsed += BigInt(bytes);
  buffer.quotaUsed += credits;

  if (error) {
    buffer.errorCount++;
    buffer.lastError = error.slice(0, 500);
  }

  // Update monthly usage
  cloudinaryMonthlyUsage += credits;

  // Check if approaching limit
  if (cloudinaryMonthlyUsage >= CLOUDINARY_MONTHLY_LIMIT * 0.9) {
    console.warn(
      `[ExternalMetrics] Cloudinary quota at ${cloudinaryMonthlyUsage}/${CLOUDINARY_MONTHLY_LIMIT} credits (${Math.round(
        (cloudinaryMonthlyUsage / CLOUDINARY_MONTHLY_LIMIT) * 100
      )}%)`
    );
  }

  maybeFlush();
}

/**
 * Track a Resend API call
 *
 * @param error - Error message if call failed
 */
export function trackResendCall(error?: string): void {
  checkQuotaReset();

  const buffer = getBuffer('resend');
  buffer.apiCalls++;
  buffer.quotaUsed++;

  if (error) {
    buffer.errorCount++;
    buffer.lastError = error.slice(0, 500);
  }

  // Update daily usage
  resendDailyUsage++;

  // Check if approaching limit
  if (resendDailyUsage >= RESEND_DAILY_LIMIT * 0.9) {
    console.warn(
      `[ExternalMetrics] Resend daily quota at ${resendDailyUsage}/${RESEND_DAILY_LIMIT} emails (${Math.round(
        (resendDailyUsage / RESEND_DAILY_LIMIT) * 100
      )}%)`
    );
  }

  maybeFlush();
}

/**
 * Get current usage summary for external services
 */
export function getExternalServicesSummary(): {
  cloudinary: {
    used: number;
    limit: number;
    percent: number;
    errors: number;
  };
  resend: {
    usedToday: number;
    limitToday: number;
    percentToday: number;
    errors: number;
  };
} {
  checkQuotaReset();

  const cloudinaryBuffer = metricsBuffer.get('cloudinary');
  const resendBuffer = metricsBuffer.get('resend');

  return {
    cloudinary: {
      used: cloudinaryMonthlyUsage,
      limit: CLOUDINARY_MONTHLY_LIMIT,
      percent: Math.round((cloudinaryMonthlyUsage / CLOUDINARY_MONTHLY_LIMIT) * 100),
      errors: cloudinaryBuffer?.errorCount || 0,
    },
    resend: {
      usedToday: resendDailyUsage,
      limitToday: RESEND_DAILY_LIMIT,
      percentToday: Math.round((resendDailyUsage / RESEND_DAILY_LIMIT) * 100),
      errors: resendBuffer?.errorCount || 0,
    },
  };
}

/**
 * Check if we should flush and do it
 */
function maybeFlush(): void {
  if (Date.now() - lastFlushTime >= FLUSH_INTERVAL_MS) {
    flushMetrics().catch((err) => {
      console.error('[ExternalMetrics] Background flush failed:', err);
    });
  }
}

/**
 * Flush metrics to database
 */
export async function flushMetrics(): Promise<void> {
  if (metricsBuffer.size === 0) return;

  const hour = getCurrentHour();

  for (const [service, buffer] of metricsBuffer.entries()) {
    if (buffer.apiCalls === 0 && buffer.errorCount === 0) continue;

    const quotaLimit = service === 'cloudinary' ? CLOUDINARY_MONTHLY_LIMIT : RESEND_DAILY_LIMIT;

    try {
      await prisma.externalServiceMetric.upsert({
        where: {
          service_hour: {
            service,
            hour,
          },
        },
        update: {
          apiCalls: { increment: buffer.apiCalls },
          bytesUsed: { increment: buffer.bytesUsed },
          quotaUsed: { increment: buffer.quotaUsed },
          quotaLimit,
          errorCount: { increment: buffer.errorCount },
          lastError: buffer.lastError,
        },
        create: {
          service,
          hour,
          apiCalls: buffer.apiCalls,
          bytesUsed: buffer.bytesUsed,
          quotaUsed: buffer.quotaUsed,
          quotaLimit,
          errorCount: buffer.errorCount,
          lastError: buffer.lastError,
        },
      });

      // Reset buffer
      buffer.apiCalls = 0;
      buffer.bytesUsed = BigInt(0);
      buffer.quotaUsed = 0;
      buffer.errorCount = 0;
      buffer.lastError = null;
    } catch (error) {
      console.error(`[ExternalMetrics] Failed to flush ${service} metrics:`, error);
    }
  }

  lastFlushTime = Date.now();
}

// Periodic flush timer reference (for graceful shutdown)
let flushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Stop periodic flush (for graceful shutdown)
 */
export function stopExternalMetricsFlush(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

/**
 * Initialize external metrics (load current usage from DB)
 */
export async function initExternalMetrics(): Promise<void> {
  checkQuotaReset();

  try {
    // Load current month's Cloudinary usage
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const cloudinaryMetrics = await prisma.externalServiceMetric.findMany({
      where: {
        service: 'cloudinary',
        hour: { gte: currentMonth },
      },
    });

    cloudinaryMonthlyUsage = cloudinaryMetrics.reduce((sum, m) => sum + m.quotaUsed, 0);

    // Load today's Resend usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const resendMetrics = await prisma.externalServiceMetric.findMany({
      where: {
        service: 'resend',
        hour: { gte: today },
      },
    });

    resendDailyUsage = resendMetrics.reduce((sum, m) => sum + m.quotaUsed, 0);

    console.log(
      `[ExternalMetrics] Initialized - Cloudinary: ${cloudinaryMonthlyUsage}/${CLOUDINARY_MONTHLY_LIMIT}, Resend: ${resendDailyUsage}/${RESEND_DAILY_LIMIT}`
    );

    // Start periodic flush to ensure metrics are persisted even without new calls
    if (!flushTimer) {
      flushTimer = setInterval(() => {
        flushMetrics().catch((err) => {
          console.error('[ExternalMetrics] Scheduled flush failed:', err);
        });
      }, FLUSH_INTERVAL_MS);
      flushTimer.unref();
    }
  } catch (error) {
    console.error('[ExternalMetrics] Failed to initialize from DB:', error);
  }
}
