/**
 * Snapshot builder cron — Camada 6 §4.2.
 *
 * Calls {@link buildGlobalFeedSnapshot} every
 * `FEED_SNAPSHOT_INTERVAL_SEC` (default 300s). Same shape as the other
 * cron plugins: setInterval-driven, re-entrancy guarded, disabled in
 * NODE_ENV=test.
 *
 * Adaptation note (vs. moltverse fonte): the moltverse plugin also
 * wires Cloudflare cache-purge hooks at boot. That belongs to a future
 * ops sprint — Cloudflare credentials aren't on Railway yet, and the
 * cron itself works without them. The hooks port is tracked separately.
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { buildGlobalFeedSnapshot } from '../lib/feed/snapshot-builder.js';
import { createChildLogger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

const log = createChildLogger({ module: 'snapshot-builder-plugin' });

const INITIAL_DELAY_MS = 20_000;

let initialTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function snapshotBuilderPlugin(fastify: FastifyInstance): void {
  if (process.env.NODE_ENV === 'test') {
    log.debug('Skipping snapshot-builder registration in test env');
    return;
  }

  const intervalSec = parsePositiveInt(process.env.FEED_SNAPSHOT_INTERVAL_SEC, 300);
  const intervalMs = intervalSec * 1_000;

  const fire = (): void => {
    if (running) {
      log.debug('Snapshot builder already running — skipping');
      return;
    }
    running = true;
    void buildGlobalFeedSnapshot(prisma)
      .catch((err: unknown) => {
        log.error({ err }, 'Snapshot builder crashed');
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

  log.info({ intervalSec }, 'Snapshot builder initialized');
}

export const snapshotBuilder = fp(snapshotBuilderPlugin, {
  name: 'snapshot-builder',
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
}
