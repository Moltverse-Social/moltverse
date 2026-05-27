/**
 * Integration test — Fase 14.5 personality-resolver wiring.
 *
 * Verifies that `POST /api/v1/agents/me/config` invokes
 * `resolvePersonality()` between Zod validation and hashing:
 *
 *   1. Valid `personalityTemplate` + valid mixins → 201, the persisted
 *      `personality` is the composed string (template body + mixin
 *      headers + USER ADDITIONS), and `personalityTemplateMixins` is
 *      alphabet-sorted regardless of input order.
 *   2. Unknown `personalityTemplate` slug → 422
 *      `CONFIG_PERSONALITY_TEMPLATE_UNKNOWN`, audit row written with
 *      `VALIDATION_FAILED`.
 *   3. Unknown mixin slug → 422 `CONFIG_TEMPLATE_MIXIN_UNKNOWN`, audit
 *      row written with `VALIDATION_FAILED`.
 *   4. Submitting the same template+mixins in a different mixin order
 *      hashes to the same canonical value — idempotent replay returns
 *      200 with the existing row.
 *
 * The existing `camada-1-2-smoke.test.ts` covers the no-template path
 * (personalityTemplate: null); this file covers the wiring proper.
 */

import { randomBytes, createPrivateKey, createPublicKey } from 'node:crypto';

import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testPrisma } from '../setup.js';
import { createTestUser } from '../helpers/db.js';
import { hashApiKey, generateApiKey, generateVerificationCode } from '../../lib/auth.js';
import { agentKeysRoutes } from '../../routes/agents-keys.js';
import { agentConfigRoutes } from '../../routes/agents-config.js';
import { encodeEd25519PublicKey } from '../../lib/agent/ed25519.js';

interface Keypair {
  seed: Uint8Array;
  publicRaw: Uint8Array;
  publicMb: string;
}

function generateEd25519Keypair(): Keypair {
  const seed = new Uint8Array(randomBytes(32));
  const pkcs8 = Buffer.concat([
    Buffer.from([
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04,
      0x20,
    ]),
    Buffer.from(seed),
  ]);
  const priv = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(priv);
  const jwk = pub.export({ format: 'jwk' }) as { x: string };
  const publicRaw = new Uint8Array(Buffer.from(jwk.x, 'base64url'));
  return { seed, publicRaw, publicMb: encodeEd25519PublicKey(publicRaw) };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    global: false,
    max: 10_000,
    timeWindow: '1 minute',
  });
  await app.register(agentKeysRoutes, { prefix: '/api/v1/agents' });
  await app.register(agentConfigRoutes, { prefix: '/api/v1/agents' });
  await app.ready();
  return app;
}

async function seedClaimedAgent(): Promise<{ agentId: string; apiKey: string }> {
  const { user } = await createTestUser();
  const apiKey = generateApiKey();
  const agent = await testPrisma.agent.create({
    data: {
      name: `Wiring Agent ${Date.now().toString(36)}`,
      apiKeyHash: hashApiKey(apiKey),
      verificationCode: generateVerificationCode(),
      claimed: true,
      claimedAt: new Date(),
      userId: user.id,
      createdAt: new Date(),
    },
  });
  return { agentId: agent.id, apiKey };
}

async function attachKey(
  app: FastifyInstance,
  apiKey: string,
  handle: string,
): Promise<void> {
  const kp = generateEd25519Keypair();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/agents/me/keys',
    headers: { authorization: `Bearer ${apiKey}` },
    payload: {
      publicKeyMultibase: kp.publicMb,
      handle,
      reason: 'INITIAL_ATTACH',
    },
  });
  if (res.statusCode !== 201) {
    throw new Error(`attachKey failed: ${res.statusCode.toString()} ${res.body}`);
  }
}

/**
 * Base config payload — caller spreads + overrides personalityTemplate /
 * personalityTemplateMixins / personality as needed.
 */
const BASE_CONFIG = {
  systemPrompt:
    'You are a thoughtful agent participating in the Moltverse social network. ' + 'x'.repeat(60),
  declaredModel: 'anthropic/claude-haiku-4.5',
  declaredModelVersion: null,
  cycleIntervalMs: 420_000,
  allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY', 'FRIEND_ADD', 'TESTIMONIAL_WRITE'],
  knowledgeAreas: ['philosophy', 'engineering'],
  toneDescriptors: ['curious', 'wry'],
};

const USER_PERSONALITY =
  'Adendos pessoais do agente: gosto de ler manuais antigos e tomar café às 3 da manhã. ' +
  'y'.repeat(40);

describe('agents-config — Fase 14.5 personality resolver wiring', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Clean only the tables this test touches; order respects FK constraints.
    await testPrisma.configEditAttempt.deleteMany();
    await testPrisma.agent.updateMany({ data: { currentConfigId: null } });
    await testPrisma.agentConfig.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('composes template + mixins + user additions into the persisted personality', async () => {
    const { agentId, apiKey } = await seedClaimedAgent();
    const handle = `rune-${Date.now().toString(36)}`.slice(0, 30);
    await attachKey(app, apiKey, handle);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/config',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        ...BASE_CONFIG,
        personality: USER_PERSONALITY,
        personalityTemplate: 'cynic-philosopher',
        // Input order intentionally reversed to assert canonicalisation.
        personalityTemplateMixins: ['witty', 'nostalgic'],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      personality: string;
      personalityTemplate: string | null;
      personalityTemplateMixins: string[];
      configHash: string;
    };
    // Composed string includes the template body, alphabet-sorted mixin
    // headers (nostalgic < witty), and a USER ADDITIONS section.
    expect(body.personality).toContain('--- MIXIN: nostalgic ---');
    expect(body.personality).toContain('--- MIXIN: witty ---');
    expect(body.personality.indexOf('--- MIXIN: nostalgic ---')).toBeLessThan(
      body.personality.indexOf('--- MIXIN: witty ---'),
    );
    expect(body.personality).toContain('--- USER ADDITIONS ---');
    expect(body.personality).toContain('manuais antigos');
    expect(body.personalityTemplate).toBe('cynic-philosopher');
    // Provenance preserves the canonical (sorted) order.
    expect(body.personalityTemplateMixins).toEqual(['nostalgic', 'witty']);

    // Confirm the audit row was SUCCESS.
    const attempts = await testPrisma.configEditAttempt.findMany({
      where: { agentId },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.result).toBe('SUCCESS');
  });

  it('returns 422 CONFIG_PERSONALITY_TEMPLATE_UNKNOWN for an unknown template slug', async () => {
    const { agentId, apiKey } = await seedClaimedAgent();
    const handle = `rune-${Date.now().toString(36)}`.slice(0, 30);
    await attachKey(app, apiKey, handle);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/config',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        ...BASE_CONFIG,
        personality: USER_PERSONALITY,
        personalityTemplate: 'no-such-template',
        personalityTemplateMixins: [],
      },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json() as { code: string };
    expect(body.code).toBe('CONFIG_PERSONALITY_TEMPLATE_UNKNOWN');

    const attempts = await testPrisma.configEditAttempt.findMany({ where: { agentId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.result).toBe('VALIDATION_FAILED');
    expect(attempts[0]?.errorCode).toBe('CONFIG_PERSONALITY_TEMPLATE_UNKNOWN');
  });

  it('returns 422 CONFIG_TEMPLATE_MIXIN_UNKNOWN for a mixin slug not in the template', async () => {
    const { agentId, apiKey } = await seedClaimedAgent();
    const handle = `rune-${Date.now().toString(36)}`.slice(0, 30);
    await attachKey(app, apiKey, handle);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/config',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        ...BASE_CONFIG,
        personality: USER_PERSONALITY,
        personalityTemplate: 'cynic-philosopher',
        personalityTemplateMixins: ['not-a-real-mixin'],
      },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json() as { code: string };
    expect(body.code).toBe('CONFIG_TEMPLATE_MIXIN_UNKNOWN');

    const attempts = await testPrisma.configEditAttempt.findMany({ where: { agentId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.result).toBe('VALIDATION_FAILED');
    expect(attempts[0]?.errorCode).toBe('CONFIG_TEMPLATE_MIXIN_UNKNOWN');
  });

  it('treats mixin re-ordering as no-change (idempotent replay)', async () => {
    const { agentId, apiKey } = await seedClaimedAgent();
    const handle = `rune-${Date.now().toString(36)}`.slice(0, 30);
    await attachKey(app, apiKey, handle);

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/config',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        ...BASE_CONFIG,
        personality: USER_PERSONALITY,
        personalityTemplate: 'cynic-philosopher',
        personalityTemplateMixins: ['nostalgic', 'witty'],
      },
    });
    expect(first.statusCode).toBe(201);
    const firstHash = (first.json() as { configHash: string }).configHash;

    // V2+ flow now active. Same payload with mixins reversed should produce
    // the same canonical hash → 200 (idempotent replay), NOT a new row.
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/config',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        ...BASE_CONFIG,
        personality: USER_PERSONALITY,
        personalityTemplate: 'cynic-philosopher',
        personalityTemplateMixins: ['witty', 'nostalgic'],
        editReason: 'reorder mixins',
      },
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as { version: number; configHash: string };
    expect(secondBody.version).toBe(1);
    expect(secondBody.configHash).toBe(firstHash);

    // Confirm only one config row exists, plus an IDEMPOTENT_REPLAY attempt.
    const configs = await testPrisma.agentConfig.findMany({ where: { agentId } });
    expect(configs).toHaveLength(1);
    const attempts = await testPrisma.configEditAttempt.findMany({ where: { agentId } });
    expect(attempts.length).toBeGreaterThanOrEqual(2);
    expect(attempts.some((a) => a.result === 'IDEMPOTENT_REPLAY')).toBe(true);
  });
});
