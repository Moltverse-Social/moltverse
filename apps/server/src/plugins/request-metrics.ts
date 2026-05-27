/**
 * Request Metrics Plugin
 *
 * Tracks request metrics for all endpoints (REST + GraphQL).
 * Collects latency, error rates, and rate limit counts.
 * Flushes to database periodically (every minute).
 *
 * Features:
 * - Real-time request tracking
 * - Latency percentile calculation (P50, P95, P99)
 * - Hourly aggregation with upsert
 * - Memory-efficient buffer with periodic flush
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';

// =============================================================================
// TYPES
// =============================================================================

interface RequestData {
  endpoint: string;
  latencyMs: number;
  isError: boolean;
  isRateLimited: boolean;
  timestamp: Date;
}

interface HourlyBucket {
  requestCount: number;
  errorCount: number;
  rateLimitCount: number;
  latencies: number[];
}

// =============================================================================
// STATE
// =============================================================================

// In-memory buffer for current hour's metrics
// Key: "YYYY-MM-DDTHH:endpoint" -> HourlyBucket
const metricsBuffer = new Map<string, HourlyBucket>();

// Track last flush time
let lastFlushTime = Date.now();

// Flush interval in ms (1 minute)
const FLUSH_INTERVAL_MS = 60 * 1000;

// Max latencies to store per bucket (for memory efficiency)
const MAX_LATENCIES_PER_BUCKET = 10000;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get the current hour as ISO string (truncated to hour)
 */
function getCurrentHour(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString();
}

/**
 * Generate bucket key for metrics
 */
function getBucketKey(hour: string, endpoint: string): string {
  return `${hour}|${endpoint}`;
}

/**
 * Parse bucket key back to hour and endpoint
 */
function parseBucketKey(key: string): { hour: string; endpoint: string } {
  const separatorIndex = key.indexOf('|');
  const hour = key.slice(0, separatorIndex);
  const endpoint = key.slice(separatorIndex + 1);
  return { hour, endpoint };
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArray: number[], p: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)] ?? 0;
}

/**
 * Extract endpoint name from request
 * For GraphQL: extracts operation name from body
 * For REST: uses URL path
 */
function extractEndpoint(request: FastifyRequest): string {
  const url = request.url;

  // GraphQL endpoint
  if (url.startsWith('/graphql')) {
    try {
      const body = request.body as { operationName?: string; query?: string } | undefined;
      if (body?.operationName) {
        return `graphql:${body.operationName}`;
      }
      // Try to extract operation from query
      if (body?.query) {
        const match = body.query.match(/(?:query|mutation)\s+(\w+)/);
        if (match) {
          return `graphql:${match[1]}`;
        }
      }
      return 'graphql:anonymous';
    } catch {
      return 'graphql:unknown';
    }
  }

  // REST endpoints - normalize path params
  // e.g., /api/v1/agents/abc123 -> /api/v1/agents/:id
  let normalizedPath = url.split('?')[0] ?? url; // Remove query params

  // Normalize UUID parameters
  normalizedPath = normalizedPath.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );

  // Normalize numeric IDs
  normalizedPath = normalizedPath.replace(/\/\d+(?=\/|$)/g, '/:id');

  return `rest:${normalizedPath}`;
}

/**
 * Record a request in the metrics buffer
 */
function recordRequest(data: RequestData): void {
  const hour = getCurrentHour();
  const key = getBucketKey(hour, data.endpoint);

  let bucket = metricsBuffer.get(key);
  if (!bucket) {
    bucket = {
      requestCount: 0,
      errorCount: 0,
      rateLimitCount: 0,
      latencies: [],
    };
    metricsBuffer.set(key, bucket);
  }

  bucket.requestCount++;
  if (data.isError) bucket.errorCount++;
  if (data.isRateLimited) bucket.rateLimitCount++;

  // Store latency (with cap for memory efficiency)
  if (bucket.latencies.length < MAX_LATENCIES_PER_BUCKET) {
    bucket.latencies.push(data.latencyMs);
  }
}

/**
 * Flush metrics to database
 */
async function flushMetrics(): Promise<void> {
  if (metricsBuffer.size === 0) return;

  const currentHour = getCurrentHour();
  const entriesToFlush: Array<{ key: string; bucket: HourlyBucket }> = [];

  // Collect all entries to flush (including current hour for near-real-time data)
  for (const [key, bucket] of metricsBuffer.entries()) {
    entriesToFlush.push({ key, bucket });
  }

  if (entriesToFlush.length === 0) return;

  // Process each bucket
  for (const { key, bucket } of entriesToFlush) {
    const { hour, endpoint } = parseBucketKey(key);

    // Sort latencies for percentile calculation
    const sortedLatencies = [...bucket.latencies].sort((a, b) => a - b);

    const latencyP50 = sortedLatencies.length > 0 ? percentile(sortedLatencies, 50) : null;
    const latencyP95 = sortedLatencies.length > 0 ? percentile(sortedLatencies, 95) : null;
    const latencyP99 = sortedLatencies.length > 0 ? percentile(sortedLatencies, 99) : null;
    const latencyAvg =
      sortedLatencies.length > 0
        ? sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length
        : null;
    const latencyMax =
      sortedLatencies.length > 0 ? Math.max(...sortedLatencies) : null;

    try {
      // Upsert to handle concurrent flushes and restarts
      await prisma.requestMetric.upsert({
        where: {
          hour_endpoint: {
            hour: new Date(hour),
            endpoint,
          },
        },
        update: {
          requestCount: { increment: bucket.requestCount },
          errorCount: { increment: bucket.errorCount },
          rateLimitCount: { increment: bucket.rateLimitCount },
          // Latency stats are recomputed from the full hour's latency
          // array each flush, so overwriting here is correct.
          latencyP50,
          latencyP95,
          latencyP99,
          latencyAvg,
          latencyMax,
        },
        create: {
          hour: new Date(hour),
          endpoint,
          requestCount: bucket.requestCount,
          errorCount: bucket.errorCount,
          rateLimitCount: bucket.rateLimitCount,
          latencyP50,
          latencyP95,
          latencyP99,
          latencyAvg,
          latencyMax,
        },
      });

      // Clear flushed bucket if not current hour
      if (hour !== currentHour) {
        metricsBuffer.delete(key);
      } else {
        // Reset counts (DB uses increment, so we zero out the delta).
        // Keep latencies array intact so the next flush computes
        // percentiles from ALL data collected this hour, not just
        // the slice since last flush.
        bucket.requestCount = 0;
        bucket.errorCount = 0;
        bucket.rateLimitCount = 0;
      }
    } catch (error) {
      console.error('[RequestMetrics] Failed to flush metrics:', error);
    }
  }

  lastFlushTime = Date.now();
}

/**
 * Get current metrics summary (for admin dashboard and alerting).
 *
 * Counts reflect unflushed delta since last flush.
 * Latency stats reflect the full current hour (latencies
 * are never reset mid-hour).
 */
export function getRequestMetricsSummary(): {
  requestsTotal: number;
  errorsTotal: number;
  rateLimitsTotal: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
} {
  let requestsTotal = 0;
  let errorsTotal = 0;
  let rateLimitsTotal = 0;
  const allLatencies: number[] = [];

  for (const bucket of metricsBuffer.values()) {
    requestsTotal += bucket.requestCount;
    errorsTotal += bucket.errorCount;
    rateLimitsTotal += bucket.rateLimitCount;
    allLatencies.push(...bucket.latencies);
  }

  let avgLatencyMs: number | null = null;
  let p95LatencyMs: number | null = null;

  if (allLatencies.length > 0) {
    avgLatencyMs = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
    const sorted = [...allLatencies].sort((a, b) => a - b);
    p95LatencyMs = percentile(sorted, 95);
  }

  return {
    requestsTotal,
    errorsTotal,
    rateLimitsTotal,
    avgLatencyMs,
    p95LatencyMs,
  };
}

// =============================================================================
// PLUGIN
// =============================================================================

async function requestMetricsPlugin(fastify: FastifyInstance): Promise<void> {
  // Track request start time
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    (request as FastifyRequest & { startTime: number }).startTime = Date.now();
  });

  // Record metrics on response
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = (request as FastifyRequest & { startTime?: number }).startTime;
    if (!startTime) return;

    const latencyMs = Date.now() - startTime;
    const endpoint = extractEndpoint(request);
    const isError = reply.statusCode >= 400;
    const isRateLimited = reply.statusCode === 429;

    recordRequest({
      endpoint,
      latencyMs,
      isError,
      isRateLimited,
      timestamp: new Date(),
    });

    // Check if we should flush
    if (Date.now() - lastFlushTime >= FLUSH_INTERVAL_MS) {
      // Fire and forget - don't block response
      flushMetrics().catch((err) => {
        console.error('[RequestMetrics] Background flush failed:', err);
      });
    }
  });

  // Schedule periodic flush
  const flushTimer = setInterval(() => {
    flushMetrics().catch((err) => {
      console.error('[RequestMetrics] Scheduled flush failed:', err);
    });
  }, FLUSH_INTERVAL_MS);

  // Cleanup on shutdown
  fastify.addHook('onClose', async () => {
    clearInterval(flushTimer);
    // Final flush on shutdown
    await flushMetrics();
  });

  fastify.log.info('[RequestMetrics] Plugin initialized');
}

export default fp(requestMetricsPlugin, {
  name: 'request-metrics',
  fastify: '5.x',
});
