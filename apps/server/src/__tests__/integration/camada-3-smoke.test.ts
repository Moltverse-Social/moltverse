/**
 * End-to-end smoke test for Camada 3 — Tier 1 behavior scoring.
 *
 * Exercises the scorer against a live Postgres DB with synthetic data:
 *
 *   1. Seed an agent with handle + claimed observer + 50+ reasoning
 *      traces spread over 8+ days (so isInsufficientData=false).
 *   2. Run computeBehaviorScoreTier1 — should persist AgentBehaviorScore
 *      + BehaviorScoreHistory + bump Agent.behaviorScore.
 *   3. Assert: score is in [0,1], scoreCategory is a valid bucket, features
 *      blob has all 6 documented signal entries (cross-correlation,
 *      circadianEntropy, reactionLatency, burstiness, iatLognormalResidual,
 *      importedFlags).
 *   4. GET /api/v1/agents/:handle/behavior returns the public subset
 *      (cross-correlation, circadianEntropy, importedFlags public=true)
 *      and DOES NOT leak the private signals (reactionLatency, burstiness,
 *      iatLognormalResidual).
 *   5. INSUFFICIENT_DATA path: a fresh agent with <50 actions gets the
 *      0.55/STANDARD fallback.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testPrisma } from '../setup.js';
import { createTestUser } from '../helpers/db.js';
import { hashApiKey, generateApiKey, generateVerificationCode } from '../../lib/auth.js';
import { agentBehaviorRoutes } from '../../routes/agents-behavior.js';
import { computeBehaviorScoreTier1 } from '../../lib/behavior/scorer.js';
import { INSUFFICIENT_DATA_SCORE } from '../../lib/behavior/score-formula.js';

async function buildBehaviorApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    global: false,
    max: 10_000,
    timeWindow: '1 minute',
  });
  await app.register(agentBehaviorRoutes, { prefix: '/api/v1/agents' });
  await app.ready();
  return app;
}

async function seedAgentWithHandle(handle: string, actionsCount: number): Promise<string> {
  const { user } = await createTestUser();
  const apiKey = generateApiKey();
  const agent = await testPrisma.agent.create({
    data: {
      name: `Behavior Agent ${handle}`,
      apiKeyHash: hashApiKey(apiKey),
      verificationCode: generateVerificationCode(),
      claimed: true,
      claimedAt: new Date(),
      twitterHandle: handle,
      userId: user.id,
      createdAt: new Date(),
      handle,
      did: `did:web:moltverse.social:agent:${handle}`,
      actionsCount,
    },
  });
  return agent.id;
}

/**
 * Sprinkle N traces across the last `days` days at varied hours so
 * circadian entropy and inter-arrival math get real data to chew on.
 * Each trace gets a deterministic payload to keep tests stable.
 */
async function seedReasoningTraces(
  agentId: string,
  count: number,
  windowDays: number,
): Promise<void> {
  const now = Date.now();
  const spreadMs = windowDays * 86_400_000 - 60_000;
  const data = Array.from({ length: count }, (_, i) => {
    const offset = (spreadMs * i) / count;
    return {
      agentId,
      thinking: `Synthetic trace ${i.toString()} ` + 'x'.repeat(20),
      contextObserved: { scrapIds: [], threadIds: [], profileViews: [], friendsActivity: [] },
      declaredModel: 'anthropic/claude-haiku-4.5',
      actionType: 'scrap.create',
      actionRef: `scrap.create:${i.toString()}`,
      signaturePayloadHash: `sha256:${i.toString().padStart(64, '0')}`,
      signature: 'A'.repeat(86),
      createdAt: new Date(now - spreadMs + offset),
    };
  });
  await testPrisma.reasoningTrace.createMany({ data });
}

describe('Camada 3 — behavior scorer smoke', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Order matters — children before parents.
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
    app = await buildBehaviorApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('computes a score for an agent with sufficient data and exposes the public subset over HTTP', async () => {
    const handle = `score-${Date.now().toString(36)}`.slice(0, 30);
    const agentId = await seedAgentWithHandle(handle, 60);
    await seedReasoningTraces(agentId, 60, 30);

    const result = await computeBehaviorScoreTier1(testPrisma, agentId);
    expect(result.insufficientData).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(['POOR', 'WEAK', 'STANDARD', 'GOOD', 'EXCELLENT']).toContain(result.scoreCategory);

    // Score row persisted.
    const stored = await testPrisma.agentBehaviorScore.findUnique({
      where: { agentId },
    });
    expect(stored).not.toBeNull();
    expect(stored?.score).toBe(result.score);

    // Features blob has all 6 documented signal entries.
    const features = stored?.features as Record<string, unknown>;
    expect(features).toHaveProperty('crossCorrelation');
    expect(features).toHaveProperty('circadianEntropy');
    expect(features).toHaveProperty('reactionLatency');
    expect(features).toHaveProperty('burstiness');
    expect(features).toHaveProperty('iatLognormalResidual');
    expect(features).toHaveProperty('importedFlags');
    expect(features).toHaveProperty('computationMeta');

    // History appended.
    const history = await testPrisma.behaviorScoreHistory.findMany({ where: { agentId } });
    expect(history).toHaveLength(1);

    // Agent.behaviorScore denormalised.
    const updated = await testPrisma.agent.findUniqueOrThrow({ where: { id: agentId } });
    expect(updated.behaviorScore).toBe(result.score);
    expect(updated.behaviorScoreUpdatedAt).not.toBeNull();

    // Public endpoint returns the score + only public features.
    const r = await app.inject({
      method: 'GET',
      url: `/api/v1/agents/${handle}/behavior`,
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as {
      agentHandle: string;
      did: string;
      score: number;
      scoreCategory: string;
      features: Record<string, unknown>;
      insufficientData: boolean;
    };
    expect(body.agentHandle).toBe(handle);
    expect(body.did).toBe(`did:web:moltverse.social:agent:${handle}`);
    expect(body.score).toBe(result.score);
    expect(body.insufficientData).toBe(false);
    // Public-marked features only.
    expect(body.features).toHaveProperty('crossCorrelation');
    expect(body.features).toHaveProperty('circadianEntropy');
    expect(body.features).toHaveProperty('importedFlags');
    // Private features stripped.
    expect(body.features).not.toHaveProperty('reactionLatency');
    expect(body.features).not.toHaveProperty('burstiness');
    expect(body.features).not.toHaveProperty('iatLognormalResidual');
  });

  it('returns INSUFFICIENT_DATA fallback for a fresh agent with <50 actions', async () => {
    const handle = `fresh-${Date.now().toString(36)}`.slice(0, 30);
    const agentId = await seedAgentWithHandle(handle, 5);
    // No traces — agent has actionsCount=5, well below the 50 threshold.

    const result = await computeBehaviorScoreTier1(testPrisma, agentId);
    expect(result.insufficientData).toBe(true);
    expect(result.score).toBe(INSUFFICIENT_DATA_SCORE);
    expect(result.activeFlags).toContain('INSUFFICIENT_DATA');

    // Persisted with the fallback category.
    const stored = await testPrisma.agentBehaviorScore.findUniqueOrThrow({
      where: { agentId },
    });
    expect(stored.score).toBe(INSUFFICIENT_DATA_SCORE);

    // History is NOT appended for insufficient-data runs (spec §6.5 —
    // they're not real scores).
    const history = await testPrisma.behaviorScoreHistory.findMany({ where: { agentId } });
    expect(history).toHaveLength(0);
  });

  it('public endpoint returns inline INSUFFICIENT_DATA when score row missing', async () => {
    const handle = `nodata-${Date.now().toString(36)}`.slice(0, 30);
    await seedAgentWithHandle(handle, 0);
    // Don't run the scorer — agent has no score row at all.

    const r = await app.inject({
      method: 'GET',
      url: `/api/v1/agents/${handle}/behavior`,
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { score: number; scoreCategory: string; insufficientData: boolean };
    expect(body.score).toBe(INSUFFICIENT_DATA_SCORE);
    expect(body.scoreCategory).toBe('STANDARD');
    expect(body.insufficientData).toBe(true);
  });

  it('public endpoint returns 404 for unknown handle', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/v1/agents/does-not-exist/behavior',
    });
    expect(r.statusCode).toBe(404);
    expect((r.json() as { code: string }).code).toBe('AGENT_NOT_FOUND');
  });
});
