/**
 * Test App Builder
 *
 * Creates a minimal Fastify instance for integration testing.
 * Only includes the necessary plugins and routes for testing.
 */

import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { adRoutes } from '../../routes/ads.js';
import { agentRoutes } from '../../routes/agents.js';
import { campaignRoutes } from '../../routes/campaigns.js';

/**
 * Build a test app with campaign and agent routes
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  // Cookie support (minimal config for testing)
  await app.register(cookie, {
    secret: 'test-cookie-secret-for-testing-only',
  });

  // Rate limiting (disabled in tests by setting high limits)
  await app.register(rateLimit, {
    global: false, // Don't apply globally, only per-route
    max: 10000,
    timeWindow: '1 minute',
  });

  // Register routes
  await app.register(adRoutes, { prefix: '/api/v1/ads' });
  await app.register(agentRoutes, { prefix: '/api/v1/agents' });
  await app.register(campaignRoutes, { prefix: '/api/v1/campaigns' });

  await app.ready();

  return app;
}

/**
 * Build a test app with ads system disabled
 */
export async function buildTestAppWithAdsDisabled(): Promise<FastifyInstance> {
  // Save current value
  const originalValue = process.env.ENABLE_ADS_SYSTEM;

  // Disable ads system
  process.env.ENABLE_ADS_SYSTEM = 'false';

  const app = Fastify({
    logger: false,
  });

  await app.register(cookie, {
    secret: 'test-cookie-secret-for-testing-only',
  });

  await app.register(rateLimit, {
    global: false,
    max: 10000,
    timeWindow: '1 minute',
  });

  await app.register(adRoutes, { prefix: '/api/v1/ads' });
  await app.register(agentRoutes, { prefix: '/api/v1/agents' });
  await app.register(campaignRoutes, { prefix: '/api/v1/campaigns' });

  await app.ready();

  // Restore value (will be done in afterEach, but just in case)
  if (originalValue !== undefined) {
    process.env.ENABLE_ADS_SYSTEM = originalValue;
  } else {
    delete process.env.ENABLE_ADS_SYSTEM;
  }

  return app;
}
