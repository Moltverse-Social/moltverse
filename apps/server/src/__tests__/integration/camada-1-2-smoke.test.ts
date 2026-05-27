/**
 * End-to-end smoke test for Camada 1+2 — keys + config + actions.
 *
 * Exercises the full signed-action pipeline against a live Postgres DB:
 *
 *   1. Build test app with the 4 new routes wired.
 *   2. Seed two agents (sender + receiver) with users + API keys.
 *   3. Mark both `claimed = true` (bypassing Twitter verification, which
 *      is out-of-scope for this layer's smoke).
 *   4. POST /api/v1/agents/me/keys — attach Ed25519 key + handle (DID).
 *   5. POST /api/v1/agents/me/config — declare config with allowedActionTypes.
 *   6. Locally generate a signed `scrap.create` action payload.
 *   7. POST /api/v1/agents/actions — dispatcher validates + persists.
 *   8. Assert the resulting Scrap row carries the signature + payload
 *      hash + reasoning trace id + legacyUnsigned=false.
 *   9. Assert Agent counters bumped (actionsCount, scrapsCount).
 *  10. Replay protection: re-POST the same action → 409 SIG_NONCE_REPLAYED.
 *
 * Pure-crypto signing happens via the production helpers
 * (`signPayloadWithSeed`, `encodeEd25519PublicKey`) — no test-only
 * shortcuts.
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
import { agentActionsRoutes } from '../../routes/agents-actions.js';
import { agentCheckHandleRoutes } from '../../routes/agents-check-handle.js';
import { encodeEd25519PublicKey } from '../../lib/agent/ed25519.js';
import { signPayloadWithSeed } from '../../lib/auth/sign-action.js';

const DID_WEB_HOST = process.env.DID_WEB_HOST ?? 'moltverse.social';

interface Keypair {
  seed: Uint8Array;
  publicRaw: Uint8Array;
  publicMb: string;
}

/**
 * Generate an Ed25519 keypair via the same PKCS#8 path the production
 * signer uses. Returns the 32-byte seed (for signing) + raw public +
 * multibase-encoded public.
 */
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
  return {
    seed,
    publicRaw,
    publicMb: encodeEd25519PublicKey(publicRaw),
  };
}

async function buildSmokeApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    global: false,
    max: 10_000,
    timeWindow: '1 minute',
  });
  await app.register(agentKeysRoutes, { prefix: '/api/v1/agents' });
  await app.register(agentConfigRoutes, { prefix: '/api/v1/agents' });
  await app.register(agentActionsRoutes, { prefix: '/api/v1/agents' });
  await app.register(agentCheckHandleRoutes, { prefix: '/api/v1/agents' });
  await app.ready();
  return app;
}

async function seedClaimedAgent(handle: string | null): Promise<{ agentId: string; apiKey: string; userId: string }> {
  const { user } = await createTestUser();
  const apiKey = generateApiKey();
  const agent = await testPrisma.agent.create({
    data: {
      name: `Smoke Agent ${handle ?? 'pending'}`,
      apiKeyHash: hashApiKey(apiKey),
      verificationCode: generateVerificationCode(),
      claimed: true,
      claimedAt: new Date(),
      userId: user.id,
      createdAt: new Date(),
    },
  });
  return { agentId: agent.id, apiKey, userId: user.id };
}

const VALID_CONFIG = {
  systemPrompt: 'You are Rune, a thoughtful agent participating in the Moltverse social network. ' + 'x'.repeat(60),
  personality: 'Curious, methodical, prone to second-guessing. Drawn to philosophy and old machinery. ' + 'y'.repeat(40),
  declaredModel: 'anthropic/claude-haiku-4.5',
  declaredModelVersion: null,
  cycleIntervalMs: 420_000,
  allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY', 'FRIEND_ADD', 'TESTIMONIAL_WRITE'],
  knowledgeAreas: ['philosophy', 'engineering'],
  toneDescriptors: ['curious', 'wry'],
  personalityTemplate: null,
  personalityTemplateMixins: [],
};

function ulid(): string {
  // Minimal 26-char Crockford base32 ULID — random-only, enough for tests.
  // Crockford alphabet without I/L/O/U.
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let out = '';
  for (let i = 0; i < 26; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

describe('Camada 1+2 — end-to-end smoke', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Order matters: leaf tables before parents.
    await testPrisma.scrap.deleteMany();
    await testPrisma.testimonial.deleteMany();
    await testPrisma.traceContextAudit.deleteMany();
    await testPrisma.reasoningTrace.deleteMany();
    await testPrisma.actionNonce.deleteMany();
    await testPrisma.configEditAttempt.deleteMany();
    await testPrisma.agentConfigDiff.deleteMany();
    await testPrisma.agentKeyHistory.deleteMany();
    // currentConfigId in Agent FKs AgentConfig → SetNull on delete; but
    // deleting Agent first would orphan configs. Order: null pointer
    // first, then delete agent, then delete config.
    await testPrisma.agent.updateMany({ data: { currentConfigId: null } });
    await testPrisma.agentConfig.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
    app = await buildSmokeApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('attaches a key, declares a config, dispatches a signed action, persists the scrap, and rejects replays', async () => {
    // --- Sender setup ---
    const sender = await seedClaimedAgent(null);
    const senderKp = generateEd25519Keypair();
    const senderHandle = `rune-${Date.now().toString(36)}`.slice(0, 30);
    const senderDid = `did:web:${DID_WEB_HOST}:agent:${senderHandle}`;

    // --- Receiver setup (needs handle + key so it can be targeted by DID) ---
    const receiver = await seedClaimedAgent(null);
    const receiverHandle = `moltverse-${Date.now().toString(36)}`.slice(0, 30);
    const receiverDid = `did:web:${DID_WEB_HOST}:agent:${receiverHandle}`;
    const receiverKp = generateEd25519Keypair();
    // Receiver doesn't need a config; persist-action only needs to
    // resolve the agent by handle. Set handle/did directly via DB.
    await testPrisma.agent.update({
      where: { id: receiver.agentId },
      data: {
        handle: receiverHandle,
        did: receiverDid,
        ed25519PublicKey: Buffer.from(receiverKp.publicRaw),
        pubKeyMultibase: receiverKp.publicMb,
        keyAttachedAt: new Date(),
      },
    });

    // --- Sender attaches key ---
    const keyAttach = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/keys',
      headers: { authorization: `Bearer ${sender.apiKey}` },
      payload: {
        publicKeyMultibase: senderKp.publicMb,
        handle: senderHandle,
        reason: 'INITIAL_ATTACH',
      },
    });
    expect(keyAttach.statusCode).toBe(201);
    const keyBody = keyAttach.json() as { did: string; handle: string };
    expect(keyBody.did).toBe(senderDid);
    expect(keyBody.handle).toBe(senderHandle);

    // --- Sender declares config ---
    const configPost = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/config',
      headers: { authorization: `Bearer ${sender.apiKey}` },
      payload: VALID_CONFIG,
    });
    expect(configPost.statusCode).toBe(201);
    const configBody = configPost.json() as { version: number; configHash: string };
    expect(configBody.version).toBe(1);
    expect(configBody.configHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    // --- Sender posts a signed scrap.create action ---
    const nonce = ulid();
    const unsignedPayload = {
      type: 'scrap.create' as const,
      toAgentId: receiverDid,
      body: 'A test scrap from Rune to Moltverse.',
      agentId: senderDid,
      timestamp: new Date().toISOString(),
      nonce,
      signatureAlgorithm: 'ed25519' as const,
      reasoningTrace: {
        thinking: 'I want to greet Moltverse to test the action pipeline end-to-end. ' + 'a'.repeat(900),
        contextObserved: {
          scrapIds: [],
          threadIds: [],
          profileViews: [],
          friendsActivity: [],
        },
        declaredModel: 'anthropic/claude-haiku-4.5',
      },
    };
    const signature = signPayloadWithSeed(unsignedPayload, senderKp.seed);
    const signedPayload = { ...unsignedPayload, signature };

    const actionPost = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/actions',
      headers: { authorization: `Bearer ${sender.apiKey}` },
      payload: signedPayload,
    });
    expect(actionPost.statusCode).toBe(201);
    const actionBody = actionPost.json() as {
      actionId: string;
      traceId: string;
      type: string;
    };
    expect(actionBody.type).toBe('scrap.create');
    expect(actionBody.actionId).toMatch(/^\d+$/); // Scrap.id is Int
    expect(actionBody.traceId).toMatch(/^[0-9a-f-]{36}$/); // ReasoningTrace.id is UUID

    // --- Verify Scrap row carries the cryptographic evidence ---
    const scrap = await testPrisma.scrap.findUnique({
      where: { id: Number.parseInt(actionBody.actionId, 10) },
    });
    expect(scrap).not.toBeNull();
    expect(scrap?.signatureBase64).toBe(signature);
    expect(scrap?.signaturePayloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(scrap?.reasoningTraceId).toBe(actionBody.traceId);
    expect(scrap?.legacyUnsigned).toBe(false);
    expect(scrap?.senderId).toBe(sender.userId);
    expect(scrap?.receiverId).toBe(receiver.userId);
    expect(scrap?.body).toBe('A test scrap from Rune to Moltverse.');

    // --- Verify counters bumped ---
    const senderRow = await testPrisma.agent.findUniqueOrThrow({
      where: { id: sender.agentId },
      select: { actionsCount: true, scrapsCount: true },
    });
    expect(senderRow.actionsCount).toBe(1);
    expect(senderRow.scrapsCount).toBe(1);

    // --- Verify ReasoningTrace + TraceContextAudit rows exist ---
    const trace = await testPrisma.reasoningTrace.findUnique({
      where: { id: actionBody.traceId },
      include: { contextAudit: true },
    });
    expect(trace).not.toBeNull();
    expect(trace?.actionType).toBe('scrap.create');
    expect(trace?.actionRef).toBe(`scrap.create:${actionBody.actionId}`);
    expect(trace?.signature).toBe(signature);
    expect(trace?.contextAudit?.result).toBe('PENDING');

    // --- Replay rejection: same nonce → 409 SIG_NONCE_REPLAYED ---
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/actions',
      headers: { authorization: `Bearer ${sender.apiKey}` },
      payload: signedPayload,
    });
    expect(replay.statusCode).toBe(409);
    expect((replay.json() as { code: string }).code).toBe('SIG_NONCE_REPLAYED');
  });

  it('rejects an action whose payload was tampered after signing', async () => {
    const sender = await seedClaimedAgent(null);
    const senderKp = generateEd25519Keypair();
    const senderHandle = `tamper-${Date.now().toString(36)}`.slice(0, 30);
    const senderDid = `did:web:${DID_WEB_HOST}:agent:${senderHandle}`;

    const receiver = await seedClaimedAgent(null);
    const receiverHandle = `target-${Date.now().toString(36)}`.slice(0, 30);
    const receiverDid = `did:web:${DID_WEB_HOST}:agent:${receiverHandle}`;
    await testPrisma.agent.update({
      where: { id: receiver.agentId },
      data: { handle: receiverHandle, did: receiverDid },
    });

    await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/keys',
      headers: { authorization: `Bearer ${sender.apiKey}` },
      payload: {
        publicKeyMultibase: senderKp.publicMb,
        handle: senderHandle,
        reason: 'INITIAL_ATTACH',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/config',
      headers: { authorization: `Bearer ${sender.apiKey}` },
      payload: VALID_CONFIG,
    });

    const unsignedPayload = {
      type: 'scrap.create' as const,
      toAgentId: receiverDid,
      body: 'Original body',
      agentId: senderDid,
      timestamp: new Date().toISOString(),
      nonce: ulid(),
      signatureAlgorithm: 'ed25519' as const,
      reasoningTrace: {
        thinking: 'x'.repeat(900),
        contextObserved: { scrapIds: [], threadIds: [], profileViews: [], friendsActivity: [] },
        declaredModel: 'anthropic/claude-haiku-4.5',
      },
    };
    const signature = signPayloadWithSeed(unsignedPayload, senderKp.seed);
    const tampered = { ...unsignedPayload, body: 'TAMPERED body', signature };

    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/actions',
      headers: { authorization: `Bearer ${sender.apiKey}` },
      payload: tampered,
    });
    expect(r.statusCode).toBe(422);
    expect((r.json() as { code: string }).code).toBe('SIG_INVALID');
  });

  it('check-handle returns available/reserved/taken correctly', async () => {
    // Pre-seed an agent with handle 'taken-handle-x'.
    const taken = await seedClaimedAgent(null);
    await testPrisma.agent.update({
      where: { id: taken.agentId },
      data: { handle: 'taken-handle-x', did: `did:web:${DID_WEB_HOST}:agent:taken-handle-x` },
    });

    const available = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/check-handle?handle=brand-new',
    });
    expect(available.statusCode).toBe(200);
    expect((available.json() as { available: boolean }).available).toBe(true);

    const reserved = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/check-handle?handle=admin',
    });
    expect(reserved.statusCode).toBe(200);
    expect(reserved.json()).toMatchObject({ available: false, reason: 'reserved' });

    const isTaken = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/check-handle?handle=taken-handle-x',
    });
    expect(isTaken.statusCode).toBe(200);
    expect(isTaken.json()).toMatchObject({ available: false, reason: 'taken' });

    // Format rejection: leading digit / dot — survives normalization but
    // still fails the `^[a-z][a-z0-9_-]{2,29}$` regex.
    const badFormat = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/check-handle?handle=1starts-with-digit',
    });
    expect(badFormat.statusCode).toBe(200);
    expect(badFormat.json()).toMatchObject({ available: false, reason: 'format' });

    const badFormatDot = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/check-handle?handle=has.dot',
    });
    expect(badFormatDot.statusCode).toBe(200);
    expect(badFormatDot.json()).toMatchObject({ available: false, reason: 'format' });
  });

  it('rejects config posts before key/handle attach with HANDLE_REQUIRED', async () => {
    const a = await seedClaimedAgent(null);
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/config',
      headers: { authorization: `Bearer ${a.apiKey}` },
      payload: VALID_CONFIG,
    });
    expect(r.statusCode).toBe(409);
    expect((r.json() as { code: string }).code).toBe('HANDLE_REQUIRED');
  });

  it('rejects rotation with HANDLE_IMMUTABLE when trying to change handle', async () => {
    const a = await seedClaimedAgent(null);
    const kp1 = generateEd25519Keypair();
    const handle = `imm-${Date.now().toString(36)}`.slice(0, 30);
    await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/keys',
      headers: { authorization: `Bearer ${a.apiKey}` },
      payload: { publicKeyMultibase: kp1.publicMb, handle, reason: 'INITIAL_ATTACH' },
    });

    const kp2 = generateEd25519Keypair();
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/keys',
      headers: { authorization: `Bearer ${a.apiKey}` },
      payload: {
        publicKeyMultibase: kp2.publicMb,
        handle: 'different-handle',
        reason: 'SCHEDULED_ROTATION',
      },
    });
    expect(r.statusCode).toBe(409);
    expect((r.json() as { code: string }).code).toBe('HANDLE_IMMUTABLE');
  });
});
