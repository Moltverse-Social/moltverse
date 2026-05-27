/**
 * Tier-evaluator cron — Camada 4 §3.4.
 *
 * Walks ACTIVE + SUSPENDED agents on a daily interval and runs
 * {@link evaluateAgentTier} per agent. Cursor pagination across batches,
 * re-entrancy guard, disabled in NODE_ENV=test.
 *
 * Why we evaluate SUSPENDED agents too: a critical-flag-driven demotion
 * may have left them SUSPENDED but still in a non-Bronze tier; the next
 * evaluator pass collapses that to Bronze and writes the audit row.
 * REVOKED agents are excluded by `evaluateAgentTier` itself, so the
 * SQL filter doesn't need to know.
 *
 * Configuration (read once at registration):
 *   TIER_EVALUATOR_INTERVAL_HOURS  default 24
 *   TIER_EVALUATOR_BATCH_SIZE      default 100
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { createChildLogger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { evaluateAgentTier } from '../lib/tier/evaluator.js';

const log = createChildLogger({ module: 'tier-evaluator' });

const INITIAL_DELAY_MS = 35_000;

let initialTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let running = false;
let cursor: string | null = null;

interface TickStats {
  promoted: number;
  demoted: number;
  unchanged: number;
  durationMs: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function runTierEvaluatorTick(batchSize: number): Promise<TickStats> {
  const started = Date.now();
  const agents = await prisma.agent.findMany({
    where: { status: { in: ['ACTIVE', 'SUSPENDED'] } },
    select: { id: true },
    take: batchSize,
    orderBy: { id: 'asc' },
    ...(cursor !== null ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  if (agents.length === 0) {
    cursor = null;
    return { promoted: 0, demoted: 0, unchanged: 0, durationMs: Date.now() - started };
  }

  let promoted = 0;
  let demoted = 0;
  let unchanged = 0;
  for (const agent of agents) {
    try {
      const r = await evaluateAgentTier(prisma, agent.id);
      if (r.state === 'transition') {
        if (r.reason === 'promotion') promoted += 1;
        else demoted += 1;
      } else {
        unchanged += 1;
      }
    } catch (err) {
      log.error({ err, agentId: agent.id }, 'Tier evaluation failed for agent');
      unchanged += 1;
    }
  }

  cursor = agents.length === batchSize ? (agents[agents.length - 1]?.id ?? null) : null;
  const durationMs = Date.now() - started;
  if (promoted > 0 || demoted > 0) {
    log.info({ promoted, demoted, unchanged, durationMs, cursor }, 'Tier evaluator tick complete');
  } else {
    log.debug({ unchanged, durationMs, cursor }, 'Tier evaluator tick complete (no transitions)');
  }
  return { promoted, demoted, unchanged, durationMs };
}

function tierEvaluatorPlugin(fastify: FastifyInstance): void {
  if (process.env.NODE_ENV === 'test') {
    log.debug('Skipping tier-evaluator registration in test env');
    return;
  }

  const intervalHours = parsePositiveInt(process.env.TIER_EVALUATOR_INTERVAL_HOURS, 24);
  const batchSize = parsePositiveInt(process.env.TIER_EVALUATOR_BATCH_SIZE, 100);
  const intervalMs = intervalHours * 60 * 60 * 1_000;

  const fire = (): void => {
    if (running) {
      log.debug('Tier-evaluator tick already running — skipping');
      return;
    }
    running = true;
    void runTierEvaluatorTick(batchSize)
      .catch((err: unknown) => {
        log.error({ err }, 'Tier-evaluator tick crashed');
      })
      .finally(() => {
        running = false;
      });
  };

  initialTimer = setTimeout(fire, INITIAL_DELAY_MS);
  initialTimer.unref();
  intervalTimer = setInterval(fire, intervalMs);
  intervalTimer.unref();

  fastify.addHook('onClose', () => {
    if (initialTimer !== null) clearTimeout(initialTimer);
    if (intervalTimer !== null) clearInterval(intervalTimer);
    initialTimer = null;
    intervalTimer = null;
  });

  log.info(
    { intervalHours, batchSize },
    'Tier-evaluator plugin initialized',
  );
}

export const tierEvaluator = fp(tierEvaluatorPlugin, {
  name: 'tier-evaluator',
  fastify: '5.x',
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** @internal */
export function _resetForTests(): void {
  if (initialTimer !== null) clearTimeout(initialTimer);
  if (intervalTimer !== null) clearInterval(intervalTimer);
  initialTimer = null;
  intervalTimer = null;
  running = false;
  cursor = null;
}
