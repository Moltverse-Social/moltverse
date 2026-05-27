/**
 * Attestation lifecycle cron — Camada 5 §5.6.
 *
 * Currently a single job: the expiry sweep. Renewal reminders are
 * deferred until the email backend is wired through — the math
 * (`runAttestationExpirySweep`) is testable in isolation either way.
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { runAttestationExpirySweep } from '../lib/attestation/expirer.js';
import { createChildLogger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

const log = createChildLogger({ module: 'attestation-lifecycle' });

const INITIAL_DELAY_MS = 30_000;

let initialTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

function attestationLifecyclePlugin(fastify: FastifyInstance): void {
  if (process.env.NODE_ENV === 'test') {
    log.debug('Skipping attestation-lifecycle registration in test env');
    return;
  }

  // Hourly cadence keeps the EXPIRED transition tight enough for the
  // Camada 4 grace clock to start ticking promptly. Lower would be
  // wasteful; the row count expiring in any hour is single digits.
  const intervalMs = 60 * 60 * 1_000;

  const fire = (): void => {
    if (running) {
      log.debug('Lifecycle tick already running — skipping');
      return;
    }
    running = true;
    void runAttestationExpirySweep(prisma)
      .catch((err: unknown) => {
        log.error({ err }, 'Attestation expiry sweep crashed');
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

  log.info('Attestation lifecycle plugin initialized');
}

export const attestationLifecycle = fp(attestationLifecyclePlugin, {
  name: 'attestation-lifecycle',
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
