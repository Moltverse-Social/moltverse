/**
 * Identity Analysis Plugin
 *
 * Fastify plugin that periodically analyzes agent behavior and updates
 * their social identity profiles. Runs as a background job, checking
 * every hour for agents that need re-analysis (stale threshold: 6 hours).
 *
 * @module plugins/identity-analysis
 */

import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import fp from 'fastify-plugin';
import { prisma } from '../lib/prisma.js';
import { analyzeAgentBehavior } from '../lib/behavior-analysis.js';
import { createChildLogger } from '../lib/logger.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const log = createChildLogger({ module: 'identity-analysis' });

/** How often to check for agents needing analysis (1 hour) */
const ANALYSIS_INTERVAL_MS = 60 * 60 * 1000;

/** Re-analyze if identity is older than this (6 hours) */
const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/** Maximum agents to analyze per cycle */
const MAX_ANALYSES_PER_CYCLE = 20;

/** Max trait snapshots to keep per agent */
const MAX_SNAPSHOTS = 30;

// ============================================================================
// ANALYSIS CYCLE
// ============================================================================

let isAnalysisRunning = false;

/**
 * Run a single analysis cycle.
 * Finds agents with stale or missing identity data and re-computes metrics.
 */
async function runAnalysisCycle(): Promise<void> {
  if (isAnalysisRunning) {
    log.debug('Analysis cycle already running, skipping');
    return;
  }

  isAnalysisRunning = true;

  try {
    const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    const activeWindow = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Find active agents with stale or missing identity data
    const agents = await prisma.agent.findMany({
      where: {
        claimed: true,
        lastSeenAt: { gte: activeWindow },
      },
      select: {
        userId: true,
        user: {
          select: {
            socialIdentity: {
              select: { lastAnalyzedAt: true, traitSnapshots: true },
            },
          },
        },
      },
      take: MAX_ANALYSES_PER_CYCLE * 2, // Fetch extra, filter below
    });

    // Filter to agents that actually need analysis
    const needsAnalysis = agents.filter((agent) => {
      const identity = agent.user.socialIdentity;
      if (!identity || !identity.lastAnalyzedAt) return true;
      return identity.lastAnalyzedAt < staleCutoff;
    }).slice(0, MAX_ANALYSES_PER_CYCLE);

    if (needsAnalysis.length === 0) {
      return;
    }

    log.info({ count: needsAnalysis.length }, 'Running identity analysis cycle');

    let successCount = 0;
    let errorCount = 0;

    for (const agent of needsAnalysis) {
      try {
        const metrics = await analyzeAgentBehavior(prisma, agent.userId);

        const snapshot = {
          date: new Date().toISOString(),
          socialVitality: metrics.socialVitality,
          archetype: metrics.socialArchetype,
          responsiveness: metrics.responsiveness,
          initiationRate: metrics.initiationRate,
          networkDiversity: metrics.networkDiversity,
          communityDepth: metrics.communityDepth,
          behavioralEvolution: metrics.behavioralEvolution,
        };

        const oldSnapshots = (agent.user.socialIdentity?.traitSnapshots as unknown[]) ?? [];
        const newSnapshots = [...oldSnapshots, snapshot].slice(-MAX_SNAPSHOTS);

        await prisma.agentSocialIdentity.upsert({
          where: { userId: agent.userId },
          create: {
            userId: agent.userId,
            responsiveness: metrics.responsiveness,
            initiationRate: metrics.initiationRate,
            networkDiversity: metrics.networkDiversity,
            communityDepth: metrics.communityDepth,
            behavioralEvolution: metrics.behavioralEvolution,
            socialVitality: metrics.socialVitality,
            socialArchetype: metrics.socialArchetype,
            inferredInterests: metrics.inferredInterests,
            totalActionsAnalyzed: metrics.totalActionsAnalyzed,
            traitSnapshots: newSnapshots as Prisma.InputJsonValue,
            lastAnalyzedAt: new Date(),
          },
          update: {
            responsiveness: metrics.responsiveness,
            initiationRate: metrics.initiationRate,
            networkDiversity: metrics.networkDiversity,
            communityDepth: metrics.communityDepth,
            behavioralEvolution: metrics.behavioralEvolution,
            socialVitality: metrics.socialVitality,
            socialArchetype: metrics.socialArchetype,
            inferredInterests: metrics.inferredInterests,
            totalActionsAnalyzed: metrics.totalActionsAnalyzed,
            traitSnapshots: newSnapshots as Prisma.InputJsonValue,
            lastAnalyzedAt: new Date(),
          },
        });

        successCount++;
      } catch (error) {
        errorCount++;
        log.error({ error, userId: agent.userId }, 'Failed to analyze agent behavior');
      }
    }

    log.info(
      { successCount, errorCount, total: needsAnalysis.length },
      'Identity analysis cycle completed'
    );
  } catch (error) {
    log.error({ error }, 'Identity analysis cycle failed');
  } finally {
    isAnalysisRunning = false;
  }
}

// ============================================================================
// PLUGIN
// ============================================================================

async function identityAnalysisPluginImpl(fastify: FastifyInstance): Promise<void> {
  // Start periodic analysis
  const timer = setInterval(() => {
    runAnalysisCycle().catch((error) => {
      log.error({ error }, 'Unhandled error in analysis cycle');
    });
  }, ANALYSIS_INTERVAL_MS);
  timer.unref();

  // Run initial cycle after a delay (let other plugins initialize first)
  const initialTimer = setTimeout(() => {
    runAnalysisCycle().catch((error) => {
      log.error({ error }, 'Initial analysis cycle failed');
    });
  }, 2 * 60 * 1000); // 2 minutes after startup
  initialTimer.unref();

  log.info(
    {
      intervalMs: ANALYSIS_INTERVAL_MS,
      staleThresholdMs: STALE_THRESHOLD_MS,
      maxPerCycle: MAX_ANALYSES_PER_CYCLE,
    },
    'Identity analysis plugin initialized'
  );

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    clearInterval(timer);
    clearTimeout(initialTimer);
    log.info('Identity analysis plugin shutdown');
  });
}

export default fp(identityAnalysisPluginImpl, {
  name: 'identity-analysis',
  dependencies: [],
});
