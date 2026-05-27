/**
 * Sentry server-side observability.
 *
 * Two design choices worth flagging:
 *
 *   1. Empty-DSN escape hatch. `initSentry()` is a no-op when
 *      `SENTRY_DSN` is undefined or empty string. This is the
 *      supported way to disable Sentry in production without a rebuild
 *      — flip the env var to `''` and the next deploy stops sending
 *      events. The boot path is identical with or without a DSN, so
 *      dev and production share the same code path.
 *
 *   2. Free-tier quota guardrails embedded in code. Default
 *      `tracesSampleRate` is 0.1 (10 %), errors stay at 100 %, replay
 *      is off, `sendDefaultPii: false`. The `ignoreErrors` list filters
 *      the most common expected-4xx error codes so they never hit the
 *      Sentry quota. The `beforeSend` hook is a second filter that
 *      drops events explicitly tagged `expected_4xx=true` — the
 *      Fastify error hook in `index.ts` tags errors based on the reply
 *      status code so anything in the 4xx band gets filtered even if
 *      the message text doesn't match `ignoreErrors`.
 */

import type { ErrorEvent, EventHint } from '@sentry/node';
import * as Sentry from '@sentry/node';

const IGNORED_ERROR_CODES: readonly string[] = [
  'AUTH_REQUIRED',
  'SIG_INVALID',
  'SIG_NONCE_REPLAYED',
  'RATE_LIMIT_EXCEEDED',
  'ADMIN_ROLE_REQUIRED',
  'INVALID_API_KEY',
  'AGENT_NOT_FOUND',
  'AGENT_NOT_CLAIMED',
];

let initialized = false;

function parseSampleRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return fallback;
  return parsed;
}

/**
 * Initialise the Sentry SDK. Idempotent — repeated calls after the
 * first do nothing. Safe to call before the Fastify app is built
 * (Sentry's recommended order is "init first, then build your app").
 */
export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (dsn === undefined || dsn === '') {
    return;
  }

  const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development';
  const release = process.env.SENTRY_RELEASE;
  const tracesSampleRate = parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1);

  Sentry.init({
    dsn,
    environment,
    ...(release !== undefined ? { release } : {}),
    tracesSampleRate,
    sampleRate: 1.0,
    sendDefaultPii: false,
    ignoreErrors: [...IGNORED_ERROR_CODES],
    beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
      if (event.tags?.expected_4xx === 'true') return null;
      return event;
    },
  });

  initialized = true;
  console.log(`[SENTRY] initialised — env=${environment} tracesSampleRate=${tracesSampleRate}`);
}

/**
 * Flush in-flight events and shut down the SDK. Called from the
 * graceful-shutdown path in `index.ts` so SIGTERM doesn't lose the
 * last batch of events. No-op when init never ran.
 */
export async function closeSentry(timeoutMs = 2_000): Promise<boolean> {
  if (!initialized) return true;
  return Sentry.close(timeoutMs);
}

export function isSentryInitialized(): boolean {
  return initialized;
}

/** @internal — test seam so the init flag can be reset between specs. */
export function _resetForTests(): void {
  initialized = false;
}

export const _internals = { IGNORED_ERROR_CODES };
