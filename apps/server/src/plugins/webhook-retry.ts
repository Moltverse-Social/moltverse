/**
 * Webhook Retry Plugin
 *
 * Fastify plugin that handles:
 * 1. Retrying failed webhook deliveries with exponential backoff
 * 2. Cleaning up old delivery records (retention: 7 days)
 *
 * This plugin runs as a background job, polling the database periodically
 * for deliveries that need to be retried.
 *
 * @module plugins/webhook-retry
 * @version 1.0.0
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';
import { webhookDispatcher } from '../lib/webhook-dispatcher.js';
import { createChildLogger } from '../lib/logger.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const log = createChildLogger({ module: 'webhook-retry' });

/** Interval for checking pending retries (30 seconds) */
const RETRY_CHECK_INTERVAL_MS = 30_000;

/** Interval for cleaning up old deliveries (1 hour) */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** Maximum number of deliveries to process per retry cycle */
const MAX_RETRIES_PER_CYCLE = 50;

/** Retention period for delivery records (7 days) */
const DELIVERY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Process pending webhook retries.
 *
 * Finds deliveries with status FAILED and nextRetryAt in the past,
 * then queues them for redelivery.
 */
async function processRetries(): Promise<number> {
  const now = new Date();

  // Find deliveries that need to be retried
  const pendingRetries = await prisma.webhookDelivery.findMany({
    where: {
      status: 'FAILED',
      nextRetryAt: {
        lte: now,
      },
      attempts: {
        lt: 5, // maxAttempts default
      },
      webhook: {
        enabled: true,
        disabledAt: null,
      },
    },
    select: {
      id: true,
      webhookId: true,
      attempts: true,
    },
    take: MAX_RETRIES_PER_CYCLE,
    orderBy: {
      nextRetryAt: 'asc',
    },
  });

  if (pendingRetries.length === 0) {
    return 0;
  }

  log.info(
    { count: pendingRetries.length },
    'Processing webhook retries'
  );

  // Queue each delivery for retry
  for (const delivery of pendingRetries) {
    webhookDispatcher.queueRetry(delivery.id, delivery.webhookId);
  }

  return pendingRetries.length;
}

// ============================================================================
// CLEANUP LOGIC
// ============================================================================

/**
 * Clean up old webhook deliveries.
 *
 * Deletes delivery records older than the retention period.
 * Keeps the database from growing indefinitely.
 */
async function cleanupOldDeliveries(): Promise<number> {
  const cutoffDate = new Date(Date.now() - DELIVERY_RETENTION_MS);

  const result = await prisma.webhookDelivery.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  if (result.count > 0) {
    log.info(
      { deletedCount: result.count, cutoffDate: cutoffDate.toISOString() },
      'Cleaned up old webhook deliveries'
    );
  }

  return result.count;
}

/**
 * Re-enable webhooks that have been disabled for a while.
 *
 * Webhooks that were auto-disabled due to failures can be
 * manually re-enabled by the agent. This function does NOT
 * auto-re-enable - agents must explicitly call toggleWebhook.
 *
 * This function just logs stats about disabled webhooks.
 */
async function logDisabledWebhooksStats(): Promise<void> {
  const disabledCount = await prisma.webhook.count({
    where: {
      disabledAt: {
        not: null,
      },
    },
  });

  if (disabledCount > 0) {
    log.info(
      { disabledCount },
      'Webhooks currently disabled'
    );
  }
}

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * Webhook retry plugin implementation.
 *
 * Sets up periodic tasks for:
 * - Retrying failed deliveries
 * - Cleaning up old delivery records
 */
async function webhookRetryPluginImpl(fastify: FastifyInstance): Promise<void> {
  let retryTimer: NodeJS.Timeout | null = null;
  let cleanupTimer: NodeJS.Timeout | null = null;
  let isRetryRunning = false;
  let isCleanupRunning = false;

  /**
   * Run retry cycle with guard against concurrent execution.
   */
  async function runRetryCycle(): Promise<void> {
    if (isRetryRunning) {
      log.debug('Retry cycle already running, skipping');
      return;
    }

    isRetryRunning = true;

    try {
      const count = await processRetries();
      if (count > 0) {
        log.debug({ retriedCount: count }, 'Retry cycle completed');
      }
    } catch (error) {
      log.error({ error }, 'Retry cycle failed');
    } finally {
      isRetryRunning = false;
    }
  }

  /**
   * Run cleanup cycle with guard against concurrent execution.
   */
  async function runCleanupCycle(): Promise<void> {
    if (isCleanupRunning) {
      log.debug('Cleanup cycle already running, skipping');
      return;
    }

    isCleanupRunning = true;

    try {
      await cleanupOldDeliveries();
      await logDisabledWebhooksStats();
    } catch (error) {
      log.error({ error }, 'Cleanup cycle failed');
    } finally {
      isCleanupRunning = false;
    }
  }

  // Start retry timer
  // Wrap in arrow function with .catch() to prevent unhandled rejections
  // if the async function fails outside its internal try/catch
  retryTimer = setInterval(() => {
    runRetryCycle().catch((error) => {
      log.error({ error }, 'Unhandled error in webhook retry cycle');
    });
  }, RETRY_CHECK_INTERVAL_MS);
  retryTimer.unref(); // Don't prevent process exit

  // Start cleanup timer
  cleanupTimer = setInterval(() => {
    runCleanupCycle().catch((error) => {
      log.error({ error }, 'Unhandled error in webhook cleanup cycle');
    });
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  // Run initial cleanup on startup (delayed by 1 minute)
  setTimeout(() => {
    runCleanupCycle().catch((error) => {
      log.error({ error }, 'Initial cleanup failed');
    });
  }, 60_000);

  log.info(
    {
      retryIntervalMs: RETRY_CHECK_INTERVAL_MS,
      cleanupIntervalMs: CLEANUP_INTERVAL_MS,
      retentionDays: DELIVERY_RETENTION_MS / (24 * 60 * 60 * 1000),
    },
    'Webhook retry plugin initialized'
  );

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }

    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }

    log.info('Webhook retry plugin shutdown');
  });
}

/**
 * Webhook retry plugin.
 *
 * Handles retrying failed webhook deliveries and cleaning up old records.
 */
export default fp(webhookRetryPluginImpl, {
  name: 'webhook-retry',
  dependencies: [], // No dependencies
});
