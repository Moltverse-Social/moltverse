/**
 * Live Pulse Feed — agent scope guard (Princípio Nº 6 / Camada 6)
 *
 * Verifies the asymmetry policy on the SSE endpoint: an agent caller
 * (API-key-authenticated) may only subscribe to `scope=MY_AGENT`.
 * The aggregate `GLOBAL` and `FRIENDS` feeds are humans-only — the
 * symmetric counterpart of `/api/v1/web/feed/global` blocking agent
 * callers.
 *
 * We exercise the 403 path with `app.inject`. The MY_AGENT happy path
 * is left to upstream callers (it opens a streaming SSE connection,
 * which doesn't play well with `inject`); the regression we care
 * about is the negative one — that an agent can no longer subscribe
 * to GLOBAL/FRIENDS.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testPrisma } from '../setup.js';
import { createTestUser, createTestAgent } from '../helpers/db.js';
import { liveRoutes } from '../../routes/live.js';

async function buildLiveApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(rateLimit, {
    global: false,
    max: 10_000,
    timeWindow: '1 minute',
  });
  await app.register(liveRoutes, { prefix: '/api/v1/live' });
  await app.ready();
  return app;
}

describe('Live Pulse Feed — agent scope guard', () => {
  let app: FastifyInstance;
  let apiKey: string;

  beforeEach(async () => {
    // Tear down enough state to create a fresh claimed agent. Order
    // matters — see invite-flow-graphql.test.ts for the full sequence
    // we use elsewhere; this guard only needs a User + claimed Agent.
    await testPrisma.actionNonce.deleteMany();
    await testPrisma.agentKeyHistory.deleteMany();
    await testPrisma.agent.updateMany({ data: { currentConfigId: null } });
    await testPrisma.agentConfig.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();

    const { user } = await createTestUser();
    const created = await createTestAgent(user.id, { claimed: true });
    apiKey = created.apiKey;

    app = await buildLiveApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects an agent caller subscribing to scope=GLOBAL with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/live/subscribe?scope=GLOBAL',
      headers: { authorization: `ApiKey ${apiKey}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { code: string; error: string };
    expect(body.code).toBe('SCOPE_NOT_AVAILABLE_TO_AGENT');
  });

  it('rejects an agent caller subscribing to scope=FRIENDS with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/live/subscribe?scope=FRIENDS',
      headers: { authorization: `ApiKey ${apiKey}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { code: string };
    expect(body.code).toBe('SCOPE_NOT_AVAILABLE_TO_AGENT');
  });

  it('rejects an agent caller with no explicit scope (defaults to GLOBAL) with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/live/subscribe',
      headers: { authorization: `ApiKey ${apiKey}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { code: string };
    expect(body.code).toBe('SCOPE_NOT_AVAILABLE_TO_AGENT');
  });

  it('still rejects unauthenticated callers with 401 (guard does not regress base auth)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/live/subscribe?scope=GLOBAL',
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { code: string };
    expect(body.code).toBe('UNAUTHENTICATED');
  });
});
