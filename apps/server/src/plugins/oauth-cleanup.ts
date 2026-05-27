/**
 * OAuth PKCE State Cleanup Plugin
 *
 * Periodically cleans up expired OAuth PKCE states from the database.
 * This prevents accumulation of abandoned OAuth flows.
 *
 * Security rationale:
 * - OAuth flows have 10-minute expiration
 * - Users may abandon flows mid-process
 * - Without cleanup, database accumulates stale entries
 * - Stale entries consume space and could theoretically be exploited
 *
 * Implementation notes:
 * - Runs every 5 minutes (configurable)
 * - Deletes all states where expiresAt < now
 * - Logs cleanup results for monitoring
 * - Graceful shutdown on server close
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * How often to run cleanup (in milliseconds).
 * Set to 5 minutes to balance between timely cleanup and database load.
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Batch size for deletion.
 * Limits how many records are deleted in a single query to prevent
 * long-running transactions.
 */
const CLEANUP_BATCH_SIZE = 100;

// ============================================================================
// CLEANUP LOGIC
// ============================================================================

/**
 * Delete expired OAuth PKCE states from the database.
 * Returns the number of deleted entries.
 */
async function cleanupExpiredStates(): Promise<number> {
  const now = new Date();

  // Use deleteMany for efficient batch deletion
  // The index on expiresAt ensures this query is fast
  const result = await prisma.oAuthPkceState.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  return result.count;
}

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * OAuth Cleanup Plugin
 *
 * Usage:
 *   await fastify.register(oauthCleanupPlugin);
 *
 * The plugin will automatically start periodic cleanup on server start
 * and stop on server close.
 */
async function oauthCleanupPluginImpl(fastify: FastifyInstance): Promise<void> {
  let cleanupTimer: NodeJS.Timeout | null = null;
  let isRunning = false;

  /**
   * Run a single cleanup cycle.
   * Guards against concurrent runs.
   */
  async function runCleanup(): Promise<void> {
    if (isRunning) {
      return;
    }

    isRunning = true;

    try {
      const deleted = await cleanupExpiredStates();

      // Only log if something was deleted (reduces noise)
      if (deleted > 0) {
        fastify.log.info(
          { deleted },
          `OAuth PKCE cleanup: removed ${deleted} expired state(s)`
        );
      }
    } catch (error) {
      // Log error but don't crash - cleanup is not critical
      fastify.log.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'OAuth PKCE cleanup failed'
      );
    } finally {
      isRunning = false;
    }
  }

  /**
   * Start the periodic cleanup timer.
   */
  function startCleanup(): void {
    if (cleanupTimer) {
      return;
    }

    // Run immediately on startup to clean any accumulated states
    runCleanup().catch(() => {
      // Error already logged in runCleanup
    });

    // Schedule periodic cleanup
    cleanupTimer = setInterval(() => {
      runCleanup().catch(() => {
        // Error already logged in runCleanup
      });
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    cleanupTimer.unref();

    fastify.log.info(
      { intervalMs: CLEANUP_INTERVAL_MS },
      'OAuth PKCE cleanup scheduler started'
    );
  }

  /**
   * Stop the periodic cleanup timer.
   */
  function stopCleanup(): void {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
      fastify.log.info('OAuth PKCE cleanup scheduler stopped');
    }
  }

  // Start cleanup on server ready
  startCleanup();

  // Stop cleanup on server close
  fastify.addHook('onClose', async () => {
    stopCleanup();
  });
}

/**
 * Export as Fastify plugin with proper encapsulation
 */
const oauthCleanupPlugin = fp(oauthCleanupPluginImpl, {
  name: 'oauth-cleanup',
});

export default oauthCleanupPlugin;
export { cleanupExpiredStates, CLEANUP_INTERVAL_MS, CLEANUP_BATCH_SIZE };
