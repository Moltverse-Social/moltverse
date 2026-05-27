/**
 * Integration test — Fase 16a GraphQL bridge for AgentConfig.
 *
 * Verifies that `Query.myAgentConfig` + `Mutation.updateMyAgentConfig`
 * mirror `POST /api/v1/agents/me/config` semantically while being gated
 * by session cookie (ctx.currentUser → linked agent via Agent.userId)
 * instead of agent API-key.
 *
 * Scenarios:
 *   1. AUTH_REQUIRED when no current user.
 *   2. NOT_AN_AGENT when current user has no linked agent.
 *   3. HANDLE_REQUIRED when agent exists but never attached a key/handle.
 *   4. V1 success: first-config flow creates v1 row + sets currentConfigId.
 *   5. V2+ idempotent replay: same canonical hash → IDEMPOTENT_REPLAY.
 *   6. CONFIG_PERSONALITY_TEMPLATE_UNKNOWN for unknown template slug.
 *   7. CONFIG_TEMPLATE_MIXIN_UNKNOWN for unknown mixin slug.
 *   8. VALIDATION_FAILED for short systemPrompt.
 *   9. myAgentConfig query returns null when no config, populated row otherwise.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testPrisma } from '../setup.js';
import { createTestUser, createTestAgent } from '../helpers/db.js';
import { createLoaders } from '../../graphql/loaders.js';
import { agentConfigQueries, agentConfigMutations } from '../../graphql/resolvers/agent-config.js';
import type { GraphQLContext } from '../../graphql/context.js';
import type { Agent, User } from '@prisma/client';

function makeContext(user: User | null, agent: Agent | null = null): GraphQLContext {
  return {
    prisma: testPrisma,
    currentUser: user,
    currentAgent: agent,
    currentObserver: null,
    isObserver: false,
    loaders: createLoaders(testPrisma, user?.id ?? null),
    req: { headers: {}, ip: '127.0.0.1' },
    reply: { setCookie: vi.fn(), clearCookie: vi.fn() },
  } as unknown as GraphQLContext;
}

const VALID_INPUT = {
  systemPrompt:
    'You are a thoughtful Moltverse agent participating in the network. ' + 'x'.repeat(60),
  personality:
    'Curious, methodical, prone to second-guessing. Drawn to philosophy and old machinery. ' +
    'y'.repeat(40),
  declaredModel: 'anthropic/claude-haiku-4.5',
  declaredModelVersion: null,
  cycleIntervalMs: 420_000,
  allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY', 'FRIEND_ADD', 'TESTIMONIAL_WRITE'],
  knowledgeAreas: ['philosophy', 'engineering'],
  toneDescriptors: ['curious', 'wry'],
  personalityTemplate: null,
  personalityTemplateMixins: [],
};

async function seedClaimedAgentWithHandle(): Promise<{ user: User; agent: Agent }> {
  const { user } = await createTestUser();
  const { agent } = await createTestAgent(user.id, { claimed: true });
  const updated = await testPrisma.agent.update({
    where: { id: agent.id },
    data: {
      handle: `rune-${Date.now().toString(36)}`.slice(0, 30),
      did: `did:web:moltverse.social:agent:rune-${agent.id.slice(0, 8)}`,
      keyAttachedAt: new Date(),
    },
  });
  return { user, agent: updated };
}

describe('Fase 16a — GraphQL bridge for agent config', () => {
  beforeEach(async () => {
    // Clean DB state in FK-respecting order.
    await testPrisma.configEditAttempt.deleteMany();
    await testPrisma.agentConfigDiff.deleteMany();
    await testPrisma.agent.updateMany({ data: { currentConfigId: null } });
    await testPrisma.agentConfig.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('auth gating', () => {
    it('returns AUTH_REQUIRED when no current user', async () => {
      const ctx = makeContext(null);
      const result = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: VALID_INPUT },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.code).toBe('AUTH_REQUIRED');
    });

    it('returns NOT_AN_AGENT when user has no linked agent', async () => {
      const { user } = await createTestUser();
      const ctx = makeContext(user);
      const result = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: VALID_INPUT },
        ctx,
      );
      expect(result.code).toBe('NOT_AN_AGENT');
    });

    it('returns HANDLE_REQUIRED when agent has no handle', async () => {
      const { user } = await createTestUser();
      await createTestAgent(user.id, { claimed: true }); // no handle set
      const ctx = makeContext(user);
      const result = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: VALID_INPUT },
        ctx,
      );
      expect(result.code).toBe('HANDLE_REQUIRED');
    });
  });

  describe('V1 (first config)', () => {
    it('creates v1 + sets currentConfigId on the agent', async () => {
      const { user, agent } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      const result = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: VALID_INPUT },
        ctx,
      );
      expect(result.success).toBe(true);
      expect(result.code).toBe('SUCCESS');
      expect(result.config?.version).toBe(1);
      expect(result.config?.configHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      // currentConfigId pointer was updated.
      const refreshed = await testPrisma.agent.findUnique({ where: { id: agent.id } });
      expect(refreshed?.currentConfigId).toBe(result.config?.id);
      // Audit row was created.
      const attempts = await testPrisma.configEditAttempt.findMany({ where: { agentId: agent.id } });
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.result).toBe('SUCCESS');
    });
  });

  describe('V2+ flow', () => {
    it('idempotent replay returns IDEMPOTENT_REPLAY with the existing config row', async () => {
      const { user, agent } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      // V1 success.
      const first = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: VALID_INPUT },
        ctx,
      );
      expect(first.code).toBe('SUCCESS');
      const firstHash = first.config?.configHash;
      // V2 with same input → IDEMPOTENT_REPLAY (the V2+ flow needs editReason
      // by the subsequent schema; same input adds it as required so we re-submit
      // an explicit reason).
      const second = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: { ...VALID_INPUT, editReason: 'no-change re-submit, expecting idempotent replay' } },
        ctx,
      );
      expect(second.code).toBe('IDEMPOTENT_REPLAY');
      expect(second.config?.configHash).toBe(firstHash);
      // Still only one config row.
      const configs = await testPrisma.agentConfig.findMany({ where: { agentId: agent.id } });
      expect(configs).toHaveLength(1);
    });
  });

  describe('resolver error codes', () => {
    it('returns CONFIG_PERSONALITY_TEMPLATE_UNKNOWN for unknown slug', async () => {
      const { user, agent } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      const result = await agentConfigMutations.updateMyAgentConfig(
        null,
        {
          input: {
            ...VALID_INPUT,
            personalityTemplate: 'no-such-template-anywhere',
          },
        },
        ctx,
      );
      expect(result.success).toBe(false);
      expect(result.code).toBe('CONFIG_PERSONALITY_TEMPLATE_UNKNOWN');
      const attempts = await testPrisma.configEditAttempt.findMany({ where: { agentId: agent.id } });
      expect(attempts[0]?.errorCode).toBe('CONFIG_PERSONALITY_TEMPLATE_UNKNOWN');
    });

    it('returns CONFIG_TEMPLATE_MIXIN_UNKNOWN for mixin not in template', async () => {
      const { user, agent } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      const result = await agentConfigMutations.updateMyAgentConfig(
        null,
        {
          input: {
            ...VALID_INPUT,
            personalityTemplate: 'cynic-philosopher',
            personalityTemplateMixins: ['not-a-real-mixin'],
          },
        },
        ctx,
      );
      expect(result.code).toBe('CONFIG_TEMPLATE_MIXIN_UNKNOWN');
      const attempts = await testPrisma.configEditAttempt.findMany({ where: { agentId: agent.id } });
      expect(attempts[0]?.errorCode).toBe('CONFIG_TEMPLATE_MIXIN_UNKNOWN');
    });

    it('returns VALIDATION_FAILED for systemPrompt too short', async () => {
      const { user } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      const result = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: { ...VALID_INPUT, systemPrompt: 'too short' } },
        ctx,
      );
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(result.message).toMatch(/systemPrompt/i);
    });
  });

  describe('Query.myAgentConfig', () => {
    it('returns null when current user has no agent', async () => {
      const { user } = await createTestUser();
      const ctx = makeContext(user);
      const result = await agentConfigQueries.myAgentConfig(null, {}, ctx);
      expect(result).toBeNull();
    });

    it('returns null when agent has no current config yet', async () => {
      const { user } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      const result = await agentConfigQueries.myAgentConfig(null, {}, ctx);
      expect(result).toBeNull();
    });

    it('returns the current config row with cooldown computed', async () => {
      const { user } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      const created = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: VALID_INPUT },
        ctx,
      );
      expect(created.code).toBe('SUCCESS');
      const result = await agentConfigQueries.myAgentConfig(null, {}, ctx);
      expect(result).not.toBeNull();
      expect(result?.version).toBe(1);
      expect(result?.configHash).toBe(created.config?.configHash);
      expect(result?.nextEditAvailableAt).toBeInstanceOf(Date);
    });
  });

  describe('Query.myAgentConfigHistory', () => {
    it('returns [] for an unauthenticated caller', async () => {
      const ctx = makeContext(null);
      const result = await agentConfigQueries.myAgentConfigHistory(null, { limit: 20 }, ctx);
      expect(result).toEqual([]);
    });

    it('returns [] when user has no agent', async () => {
      const { user } = await createTestUser();
      const ctx = makeContext(user);
      const result = await agentConfigQueries.myAgentConfigHistory(null, { limit: 20 }, ctx);
      expect(result).toEqual([]);
    });

    it('returns [] when agent has no config yet', async () => {
      const { user } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      const result = await agentConfigQueries.myAgentConfigHistory(null, { limit: 20 }, ctx);
      expect(result).toEqual([]);
    });

    it('returns single v1 row after the first successful update', async () => {
      const { user } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      const created = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: VALID_INPUT },
        ctx,
      );
      expect(created.code).toBe('SUCCESS');
      const history = await agentConfigQueries.myAgentConfigHistory(null, { limit: 20 }, ctx);
      expect(history).toHaveLength(1);
      expect(history[0]?.version).toBe(1);
      expect(history[0]?.previousConfigId).toBeNull();
      expect(history[0]?.editReason).toBeNull();
      expect(history[0]?.nextEditAvailableAt).toBeInstanceOf(Date);
    });

    it('returns rows in version-DESC order and respects the limit clamp', async () => {
      const { user, agent } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      // Seed 3 historical rows + 1 current. Direct DB writes — bypasses the
      // cooldown gate so we can lay down a multi-version lineage without
      // waiting tier cooldown windows.
      const baseInput = {
        systemPrompt: VALID_INPUT.systemPrompt,
        personality: VALID_INPUT.personality,
        declaredModel: VALID_INPUT.declaredModel,
        cycleIntervalMs: VALID_INPUT.cycleIntervalMs,
        allowedActionTypes: VALID_INPUT.allowedActionTypes as never,
        knowledgeAreas: VALID_INPUT.knowledgeAreas,
        toneDescriptors: VALID_INPUT.toneDescriptors,
        personalityTemplate: null,
        personalityTemplateMixins: [],
        configBytes: 100,
      };
      const v1 = await testPrisma.agentConfig.create({
        data: {
          agentId: agent.id,
          version: 1,
          configHash: 'sha256:' + '1'.repeat(64),
          ...baseInput,
        },
      });
      const v2 = await testPrisma.agentConfig.create({
        data: {
          agentId: agent.id,
          version: 2,
          previousConfigId: v1.id,
          configHash: 'sha256:' + '2'.repeat(64),
          editReason: 'tone shift',
          ...baseInput,
        },
      });
      const v3 = await testPrisma.agentConfig.create({
        data: {
          agentId: agent.id,
          version: 3,
          previousConfigId: v2.id,
          configHash: 'sha256:' + '3'.repeat(64),
          editReason: 'model swap',
          ...baseInput,
        },
      });
      await testPrisma.agent.update({
        where: { id: agent.id },
        data: { currentConfigId: v3.id },
      });

      // Default (no limit) — returns all 3 newest-first.
      const all = await agentConfigQueries.myAgentConfigHistory(null, { limit: null }, ctx);
      expect(all.map((r) => r.version)).toEqual([3, 2, 1]);
      expect(all[0]?.editReason).toBe('model swap');
      expect(all[1]?.editReason).toBe('tone shift');
      expect(all[2]?.previousConfigId).toBeNull();

      // Explicit limit 2 — returns only the 2 newest.
      const top2 = await agentConfigQueries.myAgentConfigHistory(null, { limit: 2 }, ctx);
      expect(top2.map((r) => r.version)).toEqual([3, 2]);

      // Limit out-of-range clamps to [1, 50] silently.
      const clamped = await agentConfigQueries.myAgentConfigHistory(null, { limit: 0 }, ctx);
      expect(clamped).toHaveLength(1);
      const overshot = await agentConfigQueries.myAgentConfigHistory(null, { limit: 999 }, ctx);
      expect(overshot).toHaveLength(3); // still bounded by the actual row count
    });
  });

  // --------------------------------------------------------------------
  // Fase 17.5 — AgentConfigDiff persistence + read-path enrichment
  // --------------------------------------------------------------------

  describe('Fase 17.5 — AgentConfigDiff', () => {
    it('persists an AgentConfigDiff row on a successful v2 mutation', async () => {
      const { user, agent } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);

      // v1.
      const v1Result = await agentConfigMutations.updateMyAgentConfig(
        null,
        { input: VALID_INPUT },
        ctx,
      );
      expect(v1Result.code).toBe('SUCCESS');
      const v1Id = v1Result.config?.id as string;

      // Backdate v1.createdAt so the v2 mutation isn't blocked by the
      // tier cooldown (7 days for BRONZE). The mutator reads
      // current.createdAt to compute isCooldownActive(), so a past
      // date is enough — no need to touch the agent.tier.
      await testPrisma.agentConfig.update({
        where: { id: v1Id },
        data: { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000) },
      });

      // v2 with a behavior-defining change (declaredModel swap → RADICAL).
      const v2Result = await agentConfigMutations.updateMyAgentConfig(
        null,
        {
          input: {
            ...VALID_INPUT,
            declaredModel: 'openai/gpt-4o-mini',
            editReason: 'switch to a different vendor for evaluation',
          },
        },
        ctx,
      );
      expect(v2Result.code).toBe('SUCCESS');
      const v2Id = v2Result.config?.id as string;
      expect(v2Id).not.toBe(v1Id);

      // AgentConfigDiff was written inside the same transaction.
      const diffs = await testPrisma.agentConfigDiff.findMany({
        where: { agentId: agent.id },
      });
      expect(diffs).toHaveLength(1);
      expect(diffs[0]?.fromConfigId).toBe(v1Id);
      expect(diffs[0]?.toConfigId).toBe(v2Id);
      expect(diffs[0]?.severity).toBe('RADICAL'); // model swap
      expect(diffs[0]?.flags).toContain('MODEL_CHANGED');

      // The mutation result also carries the diff summary so the
      // client can render it without an extra round-trip.
      expect(v2Result.config?.changesFromPrevious).not.toBeNull();
      expect(v2Result.config?.changesFromPrevious?.severity).toBe('RADICAL');
      expect(v2Result.config?.changesFromPrevious?.flags).toContain('MODEL_CHANGED');
      expect(v2Result.config?.changesFromPrevious?.fromConfigId).toBe(v1Id);
      expect(v2Result.config?.changesFromPrevious?.toConfigId).toBe(v2Id);
    });

    it('myAgentConfigHistory attaches the diff to v2 and returns null for v1', async () => {
      const { user, agent } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);

      // Seed v1 + v2 directly via DB, then a matching AgentConfigDiff.
      const baseInput = {
        systemPrompt: VALID_INPUT.systemPrompt,
        personality: VALID_INPUT.personality,
        declaredModel: VALID_INPUT.declaredModel,
        cycleIntervalMs: VALID_INPUT.cycleIntervalMs,
        allowedActionTypes: VALID_INPUT.allowedActionTypes as never,
        knowledgeAreas: VALID_INPUT.knowledgeAreas,
        toneDescriptors: VALID_INPUT.toneDescriptors,
        personalityTemplate: null,
        personalityTemplateMixins: [],
        configBytes: 100,
      };
      const v1 = await testPrisma.agentConfig.create({
        data: {
          agentId: agent.id,
          version: 1,
          configHash: 'sha256:' + 'a'.repeat(64),
          ...baseInput,
        },
      });
      const v2 = await testPrisma.agentConfig.create({
        data: {
          agentId: agent.id,
          version: 2,
          previousConfigId: v1.id,
          configHash: 'sha256:' + 'b'.repeat(64),
          editReason: 'tone shift',
          ...baseInput,
        },
      });
      await testPrisma.agentConfigDiff.create({
        data: {
          agentId: agent.id,
          fromConfigId: v1.id,
          toConfigId: v2.id,
          fieldChanges: {
            systemPrompt: { changed: false },
            allowedActionTypes: { changed: true, added: ['FRIEND_ADD'] },
          },
          severity: 'MINOR',
          flags: ['ACTIONS_EXPANDED'],
        },
      });
      await testPrisma.agent.update({
        where: { id: agent.id },
        data: { currentConfigId: v2.id },
      });

      const rows = await agentConfigQueries.myAgentConfigHistory(null, { limit: 20 }, ctx);
      // Newest-first ordering.
      expect(rows.map((r) => r.version)).toEqual([2, 1]);
      // v2 carries the diff summary.
      expect(rows[0]?.changesFromPrevious).not.toBeNull();
      expect(rows[0]?.changesFromPrevious?.severity).toBe('MINOR');
      expect(rows[0]?.changesFromPrevious?.flags).toEqual(['ACTIONS_EXPANDED']);
      expect(rows[0]?.changesFromPrevious?.fromConfigId).toBe(v1.id);
      // v1 has no predecessor → null.
      expect(rows[1]?.changesFromPrevious).toBeNull();
    });

    it('myAgentConfigHistory returns null for v2+ rows without a persisted diff (legacy)', async () => {
      const { user, agent } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);

      // Seed v1 + v2 directly WITHOUT an AgentConfigDiff row (simulates
      // rows written before Fase 17.5).
      const baseInput = {
        systemPrompt: VALID_INPUT.systemPrompt,
        personality: VALID_INPUT.personality,
        declaredModel: VALID_INPUT.declaredModel,
        cycleIntervalMs: VALID_INPUT.cycleIntervalMs,
        allowedActionTypes: VALID_INPUT.allowedActionTypes as never,
        knowledgeAreas: VALID_INPUT.knowledgeAreas,
        toneDescriptors: VALID_INPUT.toneDescriptors,
        personalityTemplate: null,
        personalityTemplateMixins: [],
        configBytes: 100,
      };
      const v1 = await testPrisma.agentConfig.create({
        data: {
          agentId: agent.id,
          version: 1,
          configHash: 'sha256:' + 'c'.repeat(64),
          ...baseInput,
        },
      });
      const v2 = await testPrisma.agentConfig.create({
        data: {
          agentId: agent.id,
          version: 2,
          previousConfigId: v1.id,
          configHash: 'sha256:' + 'd'.repeat(64),
          editReason: 'legacy edit',
          ...baseInput,
        },
      });
      await testPrisma.agent.update({
        where: { id: agent.id },
        data: { currentConfigId: v2.id },
      });

      const rows = await agentConfigQueries.myAgentConfigHistory(null, { limit: 20 }, ctx);
      expect(rows.map((r) => r.version)).toEqual([2, 1]);
      // Both rows fall back to null because no AgentConfigDiff exists.
      expect(rows[0]?.changesFromPrevious).toBeNull();
      expect(rows[1]?.changesFromPrevious).toBeNull();
    });

    it('myAgentConfig attaches the diff for the current version', async () => {
      const { user, agent } = await seedClaimedAgentWithHandle();
      const ctx = makeContext(user);
      const baseInput = {
        systemPrompt: VALID_INPUT.systemPrompt,
        personality: VALID_INPUT.personality,
        declaredModel: VALID_INPUT.declaredModel,
        cycleIntervalMs: VALID_INPUT.cycleIntervalMs,
        allowedActionTypes: VALID_INPUT.allowedActionTypes as never,
        knowledgeAreas: VALID_INPUT.knowledgeAreas,
        toneDescriptors: VALID_INPUT.toneDescriptors,
        personalityTemplate: null,
        personalityTemplateMixins: [],
        configBytes: 100,
      };
      const v1 = await testPrisma.agentConfig.create({
        data: {
          agentId: agent.id,
          version: 1,
          configHash: 'sha256:' + 'e'.repeat(64),
          ...baseInput,
        },
      });
      const v2 = await testPrisma.agentConfig.create({
        data: {
          agentId: agent.id,
          version: 2,
          previousConfigId: v1.id,
          configHash: 'sha256:' + 'f'.repeat(64),
          editReason: 'major edit',
          ...baseInput,
        },
      });
      await testPrisma.agentConfigDiff.create({
        data: {
          agentId: agent.id,
          fromConfigId: v1.id,
          toConfigId: v2.id,
          fieldChanges: { declaredModel: { changed: true } },
          severity: 'RADICAL',
          flags: ['MODEL_CHANGED'],
        },
      });
      await testPrisma.agent.update({
        where: { id: agent.id },
        data: { currentConfigId: v2.id },
      });

      const result = await agentConfigQueries.myAgentConfig(null, {}, ctx);
      expect(result?.version).toBe(2);
      expect(result?.changesFromPrevious?.severity).toBe('RADICAL');
      expect(result?.changesFromPrevious?.flags).toEqual(['MODEL_CHANGED']);
    });
  });
});
