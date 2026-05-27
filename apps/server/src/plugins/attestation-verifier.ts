/**
 * Attestation verifier plugin — Camada 5 §5.3.
 *
 * Polls the `PENDING_VERIFICATION` queue and runs
 * {@link processNextAttestation} per row. Same shape as the
 * tier-evaluator plugin: setInterval-driven, re-entrancy guarded,
 * disabled in NODE_ENV=test.
 *
 * Verifier choice:
 *   - `TEE_USE_DCAP_VERIFIER=true` opts in to the real Intel DCAP
 *     path. Until the native binding lands the stub fails closed.
 *   - Otherwise the mock verifier is used — useful in dev/test where
 *     we don't have hardware-rooted attestation to verify.
 *
 * We log a warning at boot when the real verifier isn't wired so
 * operators see why submitted quotes resolve `INVALID` with code
 * `not_configured`.
 */

import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import {
  createDcapVerifier,
  createMockTdxQuoteVerifier,
} from '../lib/attestation/quote-verifier.js';
import type { TdxQuoteVerifier } from '../lib/attestation/quote-verifier.js';
import { loadActiveComposeHashes } from '../lib/attestation/whitelist.js';
import { loadQuoteBytesFromMemory, processNextAttestation } from '../lib/attestation/worker.js';
import { createChildLogger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

const log = createChildLogger({ module: 'attestation-verifier' });

const INITIAL_DELAY_MS = 18_000;
/** Max attestations processed per tick before yielding back. */
const MAX_PER_TICK = 5;

let initialTimer: ReturnType<typeof setTimeout> | null = null;
let intervalTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function selectVerifier(): { verifier: TdxQuoteVerifier; live: boolean } {
  if (process.env.TEE_USE_DCAP_VERIFIER === 'true') {
    const libPath = process.env.TEE_DCAP_LIB_PATH;
    return {
      verifier: createDcapVerifier(libPath !== undefined ? { libPath } : {}),
      live: true,
    };
  }
  return { verifier: createMockTdxQuoteVerifier(), live: false };
}

async function runTick(verifier: TdxQuoteVerifier): Promise<void> {
  // Resolve once per tick — `loadActiveComposeHashes` caches internally
  // for 5 minutes, so this is a no-op DB-wise in the steady state and
  // a single SELECT after a TTL expiry or an admin invalidate. Passing
  // the merged list to every `processNextAttestation` keeps the worker
  // module itself pure and DB-source-agnostic.
  const whitelist = await loadActiveComposeHashes(prisma);

  for (let i = 0; i < MAX_PER_TICK; i += 1) {
    const r = await processNextAttestation({
      prisma,
      verifier,
      loadQuoteBytes: loadQuoteBytesFromMemory,
      whitelist,
    });
    if (r.state === 'idle') return;
    if (r.state === 'invalidated') {
      log.warn(
        { attestationId: r.attestationId, agentId: r.agentId, reason: r.reason },
        'Attestation invalidated',
      );
    }
  }
}

function attestationVerifierPlugin(fastify: FastifyInstance): void {
  if (process.env.NODE_ENV === 'test') {
    log.debug('Skipping attestation-verifier registration in test env');
    return;
  }

  const { verifier, live } = selectVerifier();
  const pollSec = parsePositiveInt(process.env.TEE_VERIFIER_POLL_SEC, 30);
  const intervalMs = pollSec * 1_000;

  if (!live) {
    log.warn(
      'TEE_USE_DCAP_VERIFIER=false — using mock verifier. Real production deployments must opt in once the DCAP bridge is bundled.',
    );
  }

  const fire = (): void => {
    if (running) {
      log.debug('Verifier tick already running — skipping');
      return;
    }
    running = true;
    void runTick(verifier)
      .catch((err: unknown) => {
        log.error({ err }, 'Attestation verifier tick crashed');
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

  log.info({ pollSec, live }, 'Attestation verifier initialized');
}

export const attestationVerifier = fp(attestationVerifierPlugin, {
  name: 'attestation-verifier',
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

/** @internal */
export async function _runOnceForTests(verifier: TdxQuoteVerifier): Promise<void> {
  await runTick(verifier);
}
