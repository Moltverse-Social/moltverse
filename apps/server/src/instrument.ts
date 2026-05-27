/**
 * Sentry instrumentation bootstrap — MUST be the first import in the
 * production entry point (`index.ts`).
 *
 * ESM hoists every `import` statement to the top of the module before
 * any non-import code runs, so calling `initSentry()` mid-file in
 * `index.ts` would happen AFTER Fastify/Prisma have already been
 * loaded — too late for Sentry's auto-instrumentation hooks. By
 * isolating the init in its own module and importing it first, we
 * guarantee `Sentry.init` runs before any other module is loaded:
 *
 *   // index.ts
 *   import './instrument.js';   // ← runs Sentry.init at load time
 *   import Fastify from 'fastify';
 *   ...
 *
 * Tests never import this file. They exercise Sentry hooks against a
 * mocked Sentry SDK directly.
 */

import 'dotenv/config';
import { initSentry } from './lib/sentry.js';

initSentry();
