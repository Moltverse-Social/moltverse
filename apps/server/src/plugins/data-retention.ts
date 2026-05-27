/**
 * Data Retention Plugin
 *
 * LGPD compliance: handles automated cleanup of expired data.
 * Runs daily to purge soft-deleted records, old profile visitors,
 * and expired OAuth states.
 *
 * Retention policies (configurable via env):
 * - Soft-deleted records: 90 days (DATA_RETENTION_SOFT_DELETED)
 * - Profile visitors: 180 days (DATA_RETENTION_PROFILE_VISITORS)
 * - Expired OAuth states: immediate
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const RETENTION_SOFT_DELETED = parseInt(process.env.DATA_RETENTION_SOFT_DELETED || '90', 10);
const RETENTION_PROFILE_VISITORS = parseInt(process.env.DATA_RETENTION_PROFILE_VISITORS || '180', 10);

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// HELPERS
// =============================================================================

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

// =============================================================================
// CLEANUP FUNCTIONS
// =============================================================================

/**
 * Purge soft-deleted records older than retention period.
 * Covers all content models that use deletedAt for soft deletes.
 */
async function cleanupSoftDeletedRecords(): Promise<number> {
  const cutoff = daysAgo(RETENTION_SOFT_DELETED);
  const where = { deletedAt: { not: null, lt: cutoff } };

  const results = await Promise.all([
    prisma.scrap.deleteMany({ where }),
    prisma.testimonial.deleteMany({ where }),
    prisma.topic.deleteMany({ where }),
    prisma.topicComment.deleteMany({ where }),
    prisma.photo.deleteMany({ where }),
    prisma.photoComment.deleteMany({ where }),
    prisma.video.deleteMany({ where }),
    prisma.poll.deleteMany({ where }),
    prisma.event.deleteMany({ where }),
  ]);

  return results.reduce((sum, r) => sum + r.count, 0);
}

/**
 * Remove old profile visitor records.
 */
async function cleanupOldProfileVisitors(): Promise<number> {
  const cutoff = daysAgo(RETENTION_PROFILE_VISITORS);
  const result = await prisma.profileVisitor.deleteMany({
    where: { visitedAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Remove expired OAuth PKCE states and one-time codes.
 */
async function cleanupExpiredOAuthStates(): Promise<number> {
  const now = new Date();

  const results = await Promise.all([
    prisma.oAuthPkceState.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    prisma.oAuthOneTimeCode.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
  ]);

  return results.reduce((sum, r) => sum + r.count, 0);
}

// =============================================================================
// MAIN JOB
// =============================================================================

async function runDataRetentionJob(): Promise<void> {
  const startTime = Date.now();

  try {
    const [softDeletedCount, visitorsCount, oauthCount] = await Promise.all([
      cleanupSoftDeletedRecords(),
      cleanupOldProfileVisitors(),
      cleanupExpiredOAuthStates(),
    ]);

    const totalDeleted = softDeletedCount + visitorsCount + oauthCount;

    if (totalDeleted > 0) {
      console.log(
        `[DataRetention] Cleanup: ${softDeletedCount} soft-deleted, ${visitorsCount} visitors, ${oauthCount} oauth states`
      );
    }

    const duration = Date.now() - startTime;
    console.log(`[DataRetention] Job completed in ${duration}ms`);
  } catch (error) {
    console.error('[DataRetention] Job failed:', error);
  }
}

// =============================================================================
// PLUGIN
// =============================================================================

async function dataRetentionPlugin(fastify: FastifyInstance): Promise<void> {
  // Run initial job after a short delay
  setTimeout(() => {
    runDataRetentionJob().catch((err) => {
      console.error('[DataRetention] Initial run failed:', err);
    });
  }, 15000); // 15 seconds after startup (after metrics-retention)

  // Schedule daily job
  const retentionTimer = setInterval(() => {
    runDataRetentionJob().catch((err) => {
      console.error('[DataRetention] Scheduled run failed:', err);
    });
  }, CLEANUP_INTERVAL_MS);

  // Cleanup on shutdown
  fastify.addHook('onClose', async () => {
    clearInterval(retentionTimer);
  });

  fastify.log.info(
    `[DataRetention] Initialized - retention: soft-deleted=${RETENTION_SOFT_DELETED}d, visitors=${RETENTION_PROFILE_VISITORS}d`
  );
}

export default fp(dataRetentionPlugin, {
  name: 'data-retention',
  fastify: '5.x',
});
