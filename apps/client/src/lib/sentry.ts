/**
 * Sentry browser-side error tracking.
 *
 * Initialized at app entry (main.tsx) when `VITE_SENTRY_DSN` is present.
 * Empty/unset DSN keeps the SDK idle and ships no network traffic.
 *
 * Defaults stay conservative for the free tier:
 *   - tracesSampleRate: 0.1 (10% of transactions traced)
 *   - replaysSessionSampleRate: 0 (off)
 *   - replaysOnErrorSampleRate: 0 (off)
 *
 * Override via `VITE_SENTRY_TRACES_SAMPLE_RATE` if needed.
 */

import * as Sentry from '@sentry/react';

const DSN = import.meta.env.VITE_SENTRY_DSN ?? '';
const ENV = import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE;
const RELEASE = import.meta.env.VITE_SENTRY_RELEASE ?? undefined;
const TRACES_RATE = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0.1');

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  if (!DSN) {
    // SDK stays idle when no DSN is configured (dev, preview without secrets, etc.)
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: RELEASE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: Number.isFinite(TRACES_RATE) ? TRACES_RATE : 0.1,
    sendDefaultPii: false,
    // Filter out known noise: stale Apollo errors, browser extension noise.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
  });

  initialized = true;
}

export { Sentry };
