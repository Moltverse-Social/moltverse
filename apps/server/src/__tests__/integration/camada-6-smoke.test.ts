/**
 * End-to-end smoke test for Camada 6 — Asymmetric feed.
 *
 * Exercises the full snapshot-builder → FeedSnapshot row → web route
 * pipeline against a live Postgres DB and a Fastify instance:
 *
 *   1. Seed an agent with handle + tier=SILVER. Seed Scrap + Testimonial
 *      rows authored by the agent's User in the recent window.
 *   2. Seed a USER-ONLY row (sender has no Agent) — should be filtered
 *      out by the `sender.agent: { isNot: null }` clause.
 *   3. Seed a non-approved testimonial — should not surface (`approved: false`).
 *   4. `buildGlobalFeedSnapshot` writes a `FeedSnapshot` row keyed
 *      `(GLOBAL_FEED, 'global')` with the agent's two items.
 *   5. `GET /api/v1/web/feed/global` (no auth) returns the snapshot.
 *   6. The same request with an agent API key returns 403 — asymmetry
 *      gate (agents must use the SSE feed, deferred).
 *   7. Snapshot-builder is idempotent — running it twice updates
 *      `generatedAt` but keeps the row id stable.
 *
 * Source coverage: this smoke focuses on Scrap + Testimonial. The
 * 3-source merge math (including TopicComment) is locked in by the
 * unit test against a fake Prisma. Avoiding a Topic+Cluster seed keeps
 * the smoke focused on the Camada 6 contract, not legacy fixtures.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testPrisma } from '../setup.js';
import { createTestUser } from '../helpers/db.js';
import { hashApiKey, generateApiKey, generateVerificationCode } from '../../lib/auth.js';
import { buildGlobalFeedSnapshot } from '../../lib/feed/snapshot-builder.js';
import { webFeedRoutes } from '../../routes/web-feed.js';

async function seedAgent(opts: {
  handle: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
}): Promise<{ agentId: string; userId: string; apiKey: string }> {
  const { user } = await createTestUser();
  const apiKey = generateApiKey();
  const agent = await testPrisma.agent.create({
    data: {
      name: `Feed Agent ${opts.handle}`,
      apiKeyHash: hashApiKey(apiKey),
      verificationCode: generateVerificationCode(),
      claimed: true,
      claimedAt: new Date(),
      userId: user.id,
      createdAt: new Date(),
      handle: opts.handle,
      tier: opts.tier,
      status: 'ACTIVE',
    },
  });
  return { agentId: agent.id, userId: user.id, apiKey };
}

async function seedUserWithoutAgent(): Promise<{ userId: string }> {
  const { user } = await createTestUser();
  return { userId: user.id };
}

async function seedScrap(
  senderId: string,
  receiverId: string,
  body: string,
  ageSec: number,
): Promise<number> {
  const row = await testPrisma.scrap.create({
    data: {
      senderId,
      receiverId,
      body,
      createdAt: new Date(Date.now() - ageSec * 1_000),
    },
  });
  return row.id;
}

async function seedTestimonial(
  senderId: string,
  receiverId: string,
  body: string,
  approved: boolean,
  ageSec: number,
): Promise<number> {
  const row = await testPrisma.testimonial.create({
    data: {
      senderId,
      receiverId,
      body,
      approved,
      createdAt: new Date(Date.now() - ageSec * 1_000),
    },
  });
  return row.id;
}

async function buildWebApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(webFeedRoutes, { prefix: '/api/v1/web' });
  await app.ready();
  return app;
}

describe('Camada 6 — asymmetric feed smoke', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Order matters — child rows first.
    await testPrisma.feedSnapshot.deleteMany();
    await testPrisma.testimonial.deleteMany();
    await testPrisma.scrap.deleteMany();
    await testPrisma.attestation.deleteMany();
    await testPrisma.approvedComposeHash.deleteMany();
    await testPrisma.agentTierTransition.deleteMany();
    await testPrisma.tierDispute.deleteMany();
    await testPrisma.behaviorScoreHistory.deleteMany();
    await testPrisma.agentBehaviorScore.deleteMany();
    await testPrisma.behaviorFlag.deleteMany();
    await testPrisma.observerSession.deleteMany();
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
    app = await buildWebApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('builds a snapshot from Scrap+Testimonial and surfaces it via the web endpoint', async () => {
    // Sender agent + recipient user (recipient does NOT need an agent —
    // we filter on sender.agent.isNot:null, not on receiver).
    const sender = await seedAgent({ handle: 'feedsmoke-snd', tier: 'SILVER' });
    const recipient = await seedAgent({ handle: 'feedsmoke-rcv', tier: 'BRONZE' });

    const scrapId = await seedScrap(sender.userId, recipient.userId, 'hello from a smoke test', 60);
    const testId = await seedTestimonial(
      sender.userId,
      recipient.userId,
      'this agent is trustworthy',
      true,
      120,
    );

    const r = await buildGlobalFeedSnapshot(testPrisma, { now: new Date() });
    expect(r.itemsWritten).toBe(2);

    const snapshot = await testPrisma.feedSnapshot.findUniqueOrThrow({
      where: { snapshotKind_snapshotKey: { snapshotKind: 'GLOBAL_FEED', snapshotKey: 'global' } },
    });
    expect(snapshot.totalItems).toBe(2);

    const items = snapshot.items as Array<{
      actionType: string;
      actionRef: string;
      agentHandle: string;
      agentTier: string;
    }>;
    const refs = items.map((i) => i.actionRef).sort();
    expect(refs).toEqual([`scrap.create:${String(scrapId)}`, `testimonial.write:${String(testId)}`].sort());
    expect(items.every((i) => i.agentHandle === 'feedsmoke-snd')).toBe(true);
    expect(items.every((i) => i.agentTier === 'SILVER')).toBe(true);

    // Public read — no auth.
    const res = await app.inject({ method: 'GET', url: '/api/v1/web/feed/global' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: unknown[];
      totalItems: number;
      windowMinutes: number;
      delayMinutes: number;
      snapshotGeneratedAt: string;
    };
    expect(body.totalItems).toBe(2);
    expect(body.items).toHaveLength(2);
    expect(body.windowMinutes).toBe(180);
    expect(body.delayMinutes).toBeGreaterThanOrEqual(0);
  });

  it('filters out senders without an Agent row and unapproved testimonials', async () => {
    const sender = await seedAgent({ handle: 'feedsmoke-good', tier: 'BRONZE' });
    const orphan = await seedUserWithoutAgent();
    const recipient = await seedAgent({ handle: 'feedsmoke-rcv2', tier: 'BRONZE' });

    // 1 scrap from agent-backed sender — should appear.
    await seedScrap(sender.userId, recipient.userId, 'agent scrap', 30);
    // 1 scrap from user-only sender — should be filtered.
    await seedScrap(orphan.userId, recipient.userId, 'orphan scrap', 30);
    // 1 testimonial approved — should appear.
    await seedTestimonial(sender.userId, recipient.userId, 'approved', true, 60);
    // 1 testimonial unapproved — should be filtered.
    await seedTestimonial(sender.userId, recipient.userId, 'rejected', false, 60);

    const r = await buildGlobalFeedSnapshot(testPrisma, { now: new Date() });
    expect(r.itemsWritten).toBe(2);
  });

  it('returns 403 for AGENT callers (asymmetry policy)', async () => {
    const sender = await seedAgent({ handle: 'feedsmoke-agent', tier: 'BRONZE' });
    await seedScrap(sender.userId, sender.userId, 'self scrap', 60);
    await buildGlobalFeedSnapshot(testPrisma, { now: new Date() });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/web/feed/global',
      headers: { Authorization: `Bearer ${sender.apiKey}` },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { code: string }).code).toBe(
      'WEB_ENDPOINT_NOT_AVAILABLE_TO_CALLER_TYPE',
    );
  });

  it('returns 503 when no snapshot has been built yet', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/web/feed/global' });
    expect(res.statusCode).toBe(503);
    expect((res.json() as { code: string }).code).toBe('WEB_SNAPSHOT_UNAVAILABLE');
  });

  it('is idempotent — second build updates generatedAt but keeps row id', async () => {
    const sender = await seedAgent({ handle: 'feedsmoke-idem', tier: 'BRONZE' });
    const recipient = await seedAgent({ handle: 'feedsmoke-rcv3', tier: 'BRONZE' });
    await seedScrap(sender.userId, recipient.userId, 'idempotent scrap', 60);

    const firstNow = new Date('2026-05-12T12:00:00Z');
    await buildGlobalFeedSnapshot(testPrisma, { now: firstNow });
    const first = await testPrisma.feedSnapshot.findUniqueOrThrow({
      where: { snapshotKind_snapshotKey: { snapshotKind: 'GLOBAL_FEED', snapshotKey: 'global' } },
    });

    const secondNow = new Date('2026-05-12T12:05:00Z');
    await buildGlobalFeedSnapshot(testPrisma, { now: secondNow });
    const second = await testPrisma.feedSnapshot.findUniqueOrThrow({
      where: { snapshotKind_snapshotKey: { snapshotKind: 'GLOBAL_FEED', snapshotKey: 'global' } },
    });

    expect(second.id).toBe(first.id);
    expect(second.generatedAt.getTime()).toBeGreaterThan(first.generatedAt.getTime());
  });
});
