/**
 * End-to-end smoke test for Camada 5 — TEE attestation pipeline.
 *
 * Exercises submission → worker → public read against a live Postgres
 * DB and a Fastify instance:
 *
 *   1. Agent with ed25519 key submits a 2000-byte synthetic quote. The
 *      quote is hand-crafted so its first 64 bytes match the agent's
 *      report-data binding (sha256(pubkey) || 32-byte zero pad) and
 *      bytes 64..112 carry an RTMR3 whose tail is a whitelisted compose
 *      hash (loaded into the DB via `ApprovedComposeHash`).
 *   2. POST `/api/v1/agents/me/attestation` lands a
 *      `PENDING_VERIFICATION` row + caches the bytes via
 *      `rememberQuoteBytes`.
 *   3. The worker (driven directly via `processNextAttestation`) flips
 *      the row to VALID with composeHash + expiresAt set.
 *   4. GET `/api/v1/agents/:handle/attestation` returns the VALID row.
 *   5. Idempotent re-submission returns the existing row, `created=false`.
 *   6. `runAttestationExpirySweep` flips VALID → EXPIRED when expiresAt
 *      slips into the past.
 *   7. The approved-hashes endpoint reflects the in-tree list (empty in
 *      tests by design — admin-curated rows are surfaced via the worker
 *      path, not this public listing).
 */

import { Buffer } from 'node:buffer';
import { createHash, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';

import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testPrisma } from '../setup.js';
import { createTestUser } from '../helpers/db.js';
import { hashApiKey, generateApiKey, generateVerificationCode } from '../../lib/auth.js';
import { RTMR3_LEN, REPORT_DATA_LEN } from '../../lib/attestation/binding.js';
import { createMockTdxQuoteVerifier } from '../../lib/attestation/quote-verifier.js';
import {
  ATTESTATION_VALIDITY_DAYS,
  loadQuoteBytesFromMemory,
  processNextAttestation,
  _clearQuoteCache,
} from '../../lib/attestation/worker.js';
import { runAttestationExpirySweep } from '../../lib/attestation/expirer.js';
import {
  invalidateWhitelistCache,
  loadActiveComposeHashes,
} from '../../lib/attestation/whitelist.js';
import { agentAttestationRoutes } from '../../routes/agents-attestation.js';
import {
  agentAttestationPublicRoutes,
  attestationApprovedHashesRoutes,
} from '../../routes/agents-attestation-public.js';

interface SeededAgent {
  agentId: string;
  apiKey: string;
  publicKeyRaw: Buffer;
  signQuote(bytes: Buffer): string;
}

async function seedAgentWithKey(handle: string): Promise<SeededAgent> {
  const { user } = await createTestUser();
  const apiKey = generateApiKey();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubJwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const publicKeyRaw = Buffer.from(pubJwk.x, 'base64url');

  const agent = await testPrisma.agent.create({
    data: {
      name: `Attest Agent ${handle}`,
      apiKeyHash: hashApiKey(apiKey),
      verificationCode: generateVerificationCode(),
      claimed: true,
      claimedAt: new Date(),
      userId: user.id,
      createdAt: new Date(),
      handle,
      ed25519PublicKey: publicKeyRaw,
      status: 'ACTIVE',
    },
  });

  return {
    agentId: agent.id,
    apiKey,
    publicKeyRaw,
    signQuote(bytes: Buffer): string {
      const sig = cryptoSign(null, bytes, privateKey);
      return Buffer.from(sig).toString('base64url');
    },
  };
}

/** Build a 2000-byte synthetic quote whose first 64 bytes hash-bind to
 *  the pubkey and whose bytes 64..112 carry an RTMR3 ending in the
 *  given compose-hash hex. The remaining bytes are deterministic
 *  padding so distinct seed values produce distinct quoteHashes. */
function buildQuoteBytes(
  publicKeyRaw: Buffer,
  composeHashHex: string,
  seed: number,
): Buffer {
  const buf = Buffer.alloc(2_000);

  // reportData (offset 0..64): sha256(pubkey) || 32 zero bytes
  const reportData = Buffer.alloc(REPORT_DATA_LEN);
  createHash('sha256').update(publicKeyRaw).digest().copy(reportData, 0);
  reportData.copy(buf, 0);

  // RTMR3 (offset 64..112): 16-byte appId + 32-byte composeHash
  const rtmr3 = Buffer.alloc(RTMR3_LEN);
  rtmr3.write('moltverse-app-id', 0, 16, 'utf8');
  Buffer.from(composeHashHex.slice(2), 'hex').copy(rtmr3, 16);
  rtmr3.copy(buf, 64);

  // Padding (offset 112..) — fill with a seed-derived pattern so distinct
  // seeds yield distinct quoteHashes.
  for (let i = 112; i < buf.length; i += 1) {
    buf[i] = (i + seed) & 0xff;
  }
  return buf;
}

async function buildAttestationApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    global: false,
    max: 10_000,
    timeWindow: '1 minute',
  });
  await app.register(agentAttestationRoutes, { prefix: '/api/v1/agents' });
  await app.register(agentAttestationPublicRoutes, { prefix: '/api/v1/agents' });
  await app.register(attestationApprovedHashesRoutes, { prefix: '/api/v1/attestation' });
  await app.ready();
  return app;
}

async function seedApprovedComposeHash(composeHashHex: string, addedByUserId: string): Promise<void> {
  await testPrisma.approvedComposeHash.create({
    data: {
      composeHash: composeHashHex,
      label: 'phala-test 1.0.0',
      addedByUserId,
    },
  });
  invalidateWhitelistCache();
}

const APPROVED_HASH_HEX = '0x' + '1'.repeat(64);

describe('Camada 5 — attestation submission + worker + public reads smoke', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Clean order: attestation children → agents → users.
    _clearQuoteCache();
    invalidateWhitelistCache();
    await testPrisma.attestation.deleteMany();
    await testPrisma.approvedComposeHash.deleteMany();
    await testPrisma.agentTierTransition.deleteMany();
    await testPrisma.tierDispute.deleteMany();
    await testPrisma.behaviorScoreHistory.deleteMany();
    await testPrisma.agentBehaviorScore.deleteMany();
    await testPrisma.behaviorFlag.deleteMany();
    await testPrisma.observerSession.deleteMany();
    await testPrisma.scrap.deleteMany();
    await testPrisma.testimonial.deleteMany();
    await testPrisma.traceContextAudit.deleteMany();
    await testPrisma.reasoningTrace.deleteMany();
    await testPrisma.actionNonce.deleteMany();
    await testPrisma.configEditAttempt.deleteMany();
    await testPrisma.agentConfigDiff.deleteMany();
    await testPrisma.agentKeyHistory.deleteMany();
    await testPrisma.agent.updateMany({ data: { currentConfigId: null } });
    await testPrisma.agentConfig.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.humanObserver.deleteMany();
    await testPrisma.user.deleteMany();
    app = await buildAttestationApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('submits, verifies, and serves a TEE attestation end-to-end', async () => {
    const seeded = await seedAgentWithKey('attest-happy');
    // We need a user id to record as the "admin" who added the hash.
    // Use the seeded agent's owning user.
    const owner = await testPrisma.agent.findUniqueOrThrow({
      where: { id: seeded.agentId },
      select: { userId: true },
    });
    await seedApprovedComposeHash(APPROVED_HASH_HEX, owner.userId);

    const quoteBytes = buildQuoteBytes(seeded.publicKeyRaw, APPROVED_HASH_HEX, 1);
    const quoteB64 = quoteBytes.toString('base64');
    const quoteSignature = seeded.signQuote(quoteBytes);

    // 1. Submission lands PENDING.
    const submitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/attestation',
      headers: { Authorization: `Bearer ${seeded.apiKey}` },
      payload: { quoteB64, quoteSignature },
    });
    expect(submitRes.statusCode).toBe(202);
    const submitBody = submitRes.json() as {
      attestationId: string;
      status: string;
      created: boolean;
    };
    expect(submitBody.status).toBe('PENDING_VERIFICATION');
    expect(submitBody.created).toBe(true);

    // 2. Worker flips it to VALID.
    const whitelist = await loadActiveComposeHashes(testPrisma);
    expect(whitelist).toHaveLength(1);
    expect(whitelist[0]?.composeHash).toBe(APPROVED_HASH_HEX);

    const verdict = await processNextAttestation({
      prisma: testPrisma,
      verifier: createMockTdxQuoteVerifier(),
      loadQuoteBytes: loadQuoteBytesFromMemory,
      whitelist,
    });
    expect(verdict.state).toBe('verified');
    if (verdict.state !== 'verified') return;

    const row = await testPrisma.attestation.findUniqueOrThrow({
      where: { id: submitBody.attestationId },
    });
    expect(row.status).toBe('VALID');
    expect(row.composeHash).toBe(APPROVED_HASH_HEX);
    expect(row.reportDataHex.length).toBe(128); // 64 bytes hex
    expect(row.rtmr3Hex.length).toBe(96); // 48 bytes hex
    // expiresAt should be ~90 days out.
    const expectedExpiry = row.attestedAt.getTime() + ATTESTATION_VALIDITY_DAYS * 86_400_000;
    expect(Math.abs(row.expiresAt.getTime() - expectedExpiry)).toBeLessThan(5_000);

    // 3. Public endpoint surfaces it.
    const publicRes = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/attest-happy/attestation',
    });
    expect(publicRes.statusCode).toBe(200);
    const publicBody = publicRes.json() as {
      attestation: { status: string; composeHash: string } | null;
    };
    expect(publicBody.attestation).not.toBeNull();
    expect(publicBody.attestation?.status).toBe('VALID');
    expect(publicBody.attestation?.composeHash).toBe(APPROVED_HASH_HEX);
  });

  it('idempotent submission returns the same row with created=false', async () => {
    const seeded = await seedAgentWithKey('attest-idem');
    const owner = await testPrisma.agent.findUniqueOrThrow({
      where: { id: seeded.agentId },
      select: { userId: true },
    });
    await seedApprovedComposeHash(APPROVED_HASH_HEX, owner.userId);

    const quoteBytes = buildQuoteBytes(seeded.publicKeyRaw, APPROVED_HASH_HEX, 42);
    const payload = {
      quoteB64: quoteBytes.toString('base64'),
      quoteSignature: seeded.signQuote(quoteBytes),
    };

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/attestation',
      headers: { Authorization: `Bearer ${seeded.apiKey}` },
      payload,
    });
    expect(first.statusCode).toBe(202);
    const firstId = (first.json() as { attestationId: string }).attestationId;

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/attestation',
      headers: { Authorization: `Bearer ${seeded.apiKey}` },
      payload,
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as { attestationId: string; created: boolean };
    expect(secondBody.attestationId).toBe(firstId);
    expect(secondBody.created).toBe(false);
  });

  it('rejects a quote whose ed25519 signature does not verify', async () => {
    const seeded = await seedAgentWithKey('attest-badsig');
    const quoteBytes = buildQuoteBytes(seeded.publicKeyRaw, APPROVED_HASH_HEX, 7);
    // Build a valid signature over OTHER bytes, then send our quote — sig
    // verification fails because it was made against different message.
    const otherBytes = Buffer.alloc(2_000, 0xff);
    const wrongSignature = seeded.signQuote(otherBytes);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/attestation',
      headers: { Authorization: `Bearer ${seeded.apiKey}` },
      payload: { quoteB64: quoteBytes.toString('base64'), quoteSignature: wrongSignature },
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { code: string }).code).toBe('ATTEST_SUBMITTER_SIG_INVALID');
  });

  it('worker invalidates a quote whose compose-hash is not on the whitelist', async () => {
    const seeded = await seedAgentWithKey('attest-noapprove');
    // No ApprovedComposeHash seeded — whitelist is empty.
    const quoteBytes = buildQuoteBytes(seeded.publicKeyRaw, APPROVED_HASH_HEX, 9);
    await app.inject({
      method: 'POST',
      url: '/api/v1/agents/me/attestation',
      headers: { Authorization: `Bearer ${seeded.apiKey}` },
      payload: {
        quoteB64: quoteBytes.toString('base64'),
        quoteSignature: seeded.signQuote(quoteBytes),
      },
    });

    const whitelist = await loadActiveComposeHashes(testPrisma);
    expect(whitelist).toHaveLength(0);

    const verdict = await processNextAttestation({
      prisma: testPrisma,
      verifier: createMockTdxQuoteVerifier(),
      loadQuoteBytes: loadQuoteBytesFromMemory,
      whitelist,
    });
    expect(verdict.state).toBe('invalidated');
    if (verdict.state !== 'invalidated') return;
    expect(verdict.reason).toBe('compose_hash_unknown');

    const row = await testPrisma.attestation.findFirst({
      where: { agentId: seeded.agentId },
    });
    expect(row?.status).toBe('INVALID');
    expect(row?.invalidatedReason).toMatch(/compose-hash not approved/);
  });

  it('expiry sweep flips a VALID row to EXPIRED when expiresAt is in the past', async () => {
    const seeded = await seedAgentWithKey('attest-expire');
    // Persist a VALID row directly (bypass the worker pipeline).
    const row = await testPrisma.attestation.create({
      data: {
        agentId: seeded.agentId,
        quoteHash: 'sha256:expire-test',
        quoteUri: 'inline:sha256:expire-test',
        status: 'VALID',
        composeHash: APPROVED_HASH_HEX,
        reportDataHex: 'aa'.repeat(64),
        rtmr3Hex: 'bb'.repeat(48),
        quoteVersion: 4,
        attestedAt: new Date(Date.now() - 100 * 86_400_000),
        expiresAt: new Date(Date.now() - 1 * 86_400_000),
      },
    });

    const r = await runAttestationExpirySweep(testPrisma);
    expect(r.expired).toBe(1);

    const updated = await testPrisma.attestation.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.status).toBe('EXPIRED');
  });

  it('approved-hashes public endpoint returns the documented envelope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/attestation/approved-hashes',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      version: string;
      approvedComposeHashes: unknown[];
      generatedAt: string;
    };
    expect(body.version).toBe('1.0');
    // DEFAULT_APPROVED_HASHES is empty by design at boot.
    expect(body.approvedComposeHashes).toHaveLength(0);
    expect(typeof body.generatedAt).toBe('string');
  });
});
