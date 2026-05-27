/**
 * Integration test — Fase 17.5.1 AgentConfigDiff backfill.
 *
 * Scenarios:
 *   1. Empty DB → returns zero counters, no writes.
 *   2. Single agent with v1 only → no diff candidates (v1 has no
 *      predecessor by design).
 *   3. Single agent with v1+v2+v3 and no diffs → backfill writes 2 rows
 *      (v1→v2, v2→v3) with the right severity/flags derived from
 *      buildFieldChanges, and v1 stays without a diff.
 *   4. Idempotency — running twice creates the same 2 rows; second run
 *      reports scanned=0 because the first run's writes flipped the
 *      `diffsAsTo: none: {}` predicate.
 *   5. Existing diff is preserved — running over a row that already has
 *      a diff (e.g., produced by the Fase 17.5 write path) does NOT
 *      overwrite or touch it. The pre-existing severity/flags survive.
 *   6. Dry-run — reports eligible count without writing any rows.
 *   7. Agent filter — only the targeted agent's diffs are produced.
 *   8. Predecessor orphan — `previousConfigId` points to a missing row
 *      (manually engineered): backfill increments `skipped` rather than
 *      crashing.
 *   9. Batch boundary — `batchSize: 1` over 3 candidates still completes
 *      and writes all 3 (the inner loop exits via the empty findMany).
 */

import type { Agent, AgentConfig, User } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

import { testPrisma } from '../setup.js';
import { createTestAgent, createTestUser } from '../helpers/db.js';
import { backfillAgentConfigDiffs } from '../../lib/agent/config-diff-backfill.js';

const VALID_BASE = {
  systemPrompt:
    'You are a thoughtful Moltverse agent participating in the network. ' + 'x'.repeat(60),
  personality:
    'Curious, methodical, prone to second-guessing. Drawn to philosophy and old machinery. ' +
    'y'.repeat(40),
  declaredModel: 'anthropic/claude-haiku-4.5',
  declaredModelVersion: null,
  cycleIntervalMs: 420_000,
  allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY'] as const,
  knowledgeAreas: ['philosophy', 'engineering'],
  toneDescriptors: ['curious', 'wry'],
  personalityTemplate: null,
  personalityTemplateMixins: [] as string[],
  configBytes: 100,
};

async function seedClaimedAgent(): Promise<{ user: User; agent: Agent }> {
  const { user } = await createTestUser();
  const { agent } = await createTestAgent(user.id, { claimed: true });
  const updated = await testPrisma.agent.update({
    where: { id: agent.id },
    data: {
      handle: `bf-${Date.now().toString(36)}`.slice(0, 30),
      did: `did:web:moltverse.social:agent:bf-${agent.id.slice(0, 8)}`,
      keyAttachedAt: new Date(),
    },
  });
  return { user, agent: updated };
}

async function seedConfig(
  agentId: string,
  version: number,
  previousConfigId: string | null,
  overrides: Partial<{
    declaredModel: string;
    allowedActionTypes: string[];
    editReason: string;
  }> = {},
): Promise<AgentConfig> {
  return testPrisma.agentConfig.create({
    data: {
      agentId,
      version,
      previousConfigId,
      systemPrompt: VALID_BASE.systemPrompt,
      personality: VALID_BASE.personality,
      declaredModel: overrides.declaredModel ?? VALID_BASE.declaredModel,
      declaredModelVersion: VALID_BASE.declaredModelVersion,
      cycleIntervalMs: VALID_BASE.cycleIntervalMs,
      allowedActionTypes:
        (overrides.allowedActionTypes as never) ??
        (VALID_BASE.allowedActionTypes as unknown as never),
      knowledgeAreas: VALID_BASE.knowledgeAreas,
      toneDescriptors: VALID_BASE.toneDescriptors,
      personalityTemplate: VALID_BASE.personalityTemplate,
      personalityTemplateMixins: VALID_BASE.personalityTemplateMixins,
      // Make configHash unique per (agentId, version) — the schema enforces
      // @unique on configHash so two agents at v1 with the same hash collide.
      // Use a randomUUID-derived suffix to guarantee uniqueness across the
      // whole test file.
      configHash: `sha256:${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`.slice(0, 71),
      configBytes: VALID_BASE.configBytes,
      editReason: overrides.editReason ?? (version === 1 ? null : `edit reason for v${version}`),
    },
  });
}

describe('Fase 17.5.1 — AgentConfigDiff backfill', () => {
  beforeEach(async () => {
    await testPrisma.configEditAttempt.deleteMany();
    await testPrisma.agentConfigDiff.deleteMany();
    await testPrisma.agent.updateMany({ data: { currentConfigId: null } });
    await testPrisma.agentConfig.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('returns zero counters when the DB has no AgentConfig rows', async () => {
    const result = await backfillAgentConfigDiffs(testPrisma);
    expect(result).toEqual({
      scanned: 0,
      eligible: 0,
      written: 0,
      skipped: 0,
      dryRun: false,
    });
  });

  it('finds no candidates when only v1 rows exist (no predecessor)', async () => {
    const { agent } = await seedClaimedAgent();
    await seedConfig(agent.id, 1, null);
    const result = await backfillAgentConfigDiffs(testPrisma);
    expect(result.scanned).toBe(0);
    expect(result.written).toBe(0);
    const diffs = await testPrisma.agentConfigDiff.findMany();
    expect(diffs).toHaveLength(0);
  });

  it('writes 2 diff rows when v1+v2+v3 exist without diffs', async () => {
    const { agent } = await seedClaimedAgent();
    const v1 = await seedConfig(agent.id, 1, null);
    // v2: swap declaredModel → RADICAL + MODEL_CHANGED
    const v2 = await seedConfig(agent.id, 2, v1.id, {
      declaredModel: 'openai/gpt-4o-mini',
      editReason: 'switch model for evaluation',
    });
    // v3: add FRIEND_ADD action → MAJOR + ACTIONS_EXPANDED
    const v3 = await seedConfig(agent.id, 3, v2.id, {
      declaredModel: 'openai/gpt-4o-mini',
      allowedActionTypes: ['SCRAP_CREATE', 'SCRAP_REPLY', 'FRIEND_ADD'],
      editReason: 'expand action repertoire',
    });

    const result = await backfillAgentConfigDiffs(testPrisma);
    expect(result.scanned).toBe(2);
    expect(result.eligible).toBe(2);
    expect(result.written).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.dryRun).toBe(false);

    const diffs = await testPrisma.agentConfigDiff.findMany({ orderBy: { createdAt: 'asc' } });
    expect(diffs).toHaveLength(2);

    const diffV1V2 = diffs.find((d) => d.fromConfigId === v1.id && d.toConfigId === v2.id);
    expect(diffV1V2).toBeDefined();
    expect(diffV1V2?.severity).toBe('RADICAL');
    expect(diffV1V2?.flags).toContain('MODEL_CHANGED');

    const diffV2V3 = diffs.find((d) => d.fromConfigId === v2.id && d.toConfigId === v3.id);
    expect(diffV2V3).toBeDefined();
    expect(diffV2V3?.severity).toBe('MAJOR');
    expect(diffV2V3?.flags).toContain('ACTIONS_EXPANDED');

    // v1 has no diff (no predecessor).
    const v1AsTo = diffs.find((d) => d.toConfigId === v1.id);
    expect(v1AsTo).toBeUndefined();
  });

  it('is idempotent — a second run finds zero candidates', async () => {
    const { agent } = await seedClaimedAgent();
    const v1 = await seedConfig(agent.id, 1, null);
    const v2 = await seedConfig(agent.id, 2, v1.id);
    await seedConfig(agent.id, 3, v2.id);

    const first = await backfillAgentConfigDiffs(testPrisma);
    expect(first.written).toBe(2);

    const second = await backfillAgentConfigDiffs(testPrisma);
    expect(second.scanned).toBe(0);
    expect(second.written).toBe(0);
    expect(second.eligible).toBe(0);

    const diffs = await testPrisma.agentConfigDiff.findMany();
    expect(diffs).toHaveLength(2);
  });

  it('preserves a pre-existing AgentConfigDiff row (no overwrite)', async () => {
    const { agent } = await seedClaimedAgent();
    const v1 = await seedConfig(agent.id, 1, null);
    const v2 = await seedConfig(agent.id, 2, v1.id);
    await seedConfig(agent.id, 3, v2.id);

    // Manually seed a diff for v1→v2 with bogus severity to verify the
    // backfill does NOT overwrite. The backfill should still write
    // v2→v3 (one new row).
    await testPrisma.agentConfigDiff.create({
      data: {
        agentId: agent.id,
        fromConfigId: v1.id,
        toConfigId: v2.id,
        fieldChanges: { manuallySeeded: true },
        severity: 'RADICAL',
        flags: ['EMPTY_REASON'],
      },
    });

    const result = await backfillAgentConfigDiffs(testPrisma);
    expect(result.written).toBe(1); // only v2→v3
    expect(result.scanned).toBe(1);

    const diffs = await testPrisma.agentConfigDiff.findMany({ orderBy: { createdAt: 'asc' } });
    expect(diffs).toHaveLength(2);
    const preserved = diffs.find((d) => d.fromConfigId === v1.id && d.toConfigId === v2.id);
    expect(preserved?.severity).toBe('RADICAL');
    expect(preserved?.flags).toEqual(['EMPTY_REASON']);
    expect(preserved?.fieldChanges).toEqual({ manuallySeeded: true });
  });

  it('dry-run reports eligible count without writing rows', async () => {
    const { agent } = await seedClaimedAgent();
    const v1 = await seedConfig(agent.id, 1, null);
    const v2 = await seedConfig(agent.id, 2, v1.id);
    await seedConfig(agent.id, 3, v2.id);

    const result = await backfillAgentConfigDiffs(testPrisma, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.eligible).toBe(2);
    expect(result.scanned).toBe(2);
    expect(result.written).toBe(0);

    const diffs = await testPrisma.agentConfigDiff.findMany();
    expect(diffs).toHaveLength(0);
  });

  it('agent filter restricts the scan to a single agent', async () => {
    const a1 = await seedClaimedAgent();
    const a2 = await seedClaimedAgent();
    // a1: v1 + v2 (1 diff to produce)
    const a1v1 = await seedConfig(a1.agent.id, 1, null);
    await seedConfig(a1.agent.id, 2, a1v1.id);
    // a2: v1 + v2 (1 diff to produce, but should NOT be touched)
    const a2v1 = await seedConfig(a2.agent.id, 1, null);
    await seedConfig(a2.agent.id, 2, a2v1.id);

    const result = await backfillAgentConfigDiffs(testPrisma, { agentId: a1.agent.id });
    expect(result.written).toBe(1);

    const diffs = await testPrisma.agentConfigDiff.findMany();
    expect(diffs).toHaveLength(1);
    expect(diffs[0]?.agentId).toBe(a1.agent.id);
  });

  // Note: the "predecessor orphan" defensive branch in
  // `backfillAgentConfigDiffs` (`if (prev === null) skip + count`) is
  // unreachable in production — the Postgres FK on
  // `agent_configs.previous_config_id` with `onDelete: SetNull` makes it
  // structurally impossible. We keep the branch (cheap, future-proof
  // against schema changes), but skip the test: forcing an orphan would
  // require disabling FK enforcement at the session level (requires DB
  // superuser) or temporarily dropping the constraint (heavy + leaks
  // state across the singleFork test run).

  it('completes with batchSize: 1 over multiple candidates', async () => {
    const { agent } = await seedClaimedAgent();
    const v1 = await seedConfig(agent.id, 1, null);
    const v2 = await seedConfig(agent.id, 2, v1.id);
    const v3 = await seedConfig(agent.id, 3, v2.id);
    await seedConfig(agent.id, 4, v3.id);

    const batches: number[] = [];
    const result = await backfillAgentConfigDiffs(testPrisma, {
      batchSize: 1,
      onBatch: (record) => batches.push(record.rowsInBatch),
    });

    expect(result.written).toBe(3);
    expect(result.eligible).toBe(3);
    // Three single-row batches.
    expect(batches).toEqual([1, 1, 1]);
  });

  it('emits onBatch records with batch index and counters', async () => {
    const { agent } = await seedClaimedAgent();
    const v1 = await seedConfig(agent.id, 1, null);
    const v2 = await seedConfig(agent.id, 2, v1.id);
    await seedConfig(agent.id, 3, v2.id);

    const records: { batchIndex: number; rowsInBatch: number; writtenInBatch: number }[] = [];
    const result = await backfillAgentConfigDiffs(testPrisma, {
      onBatch: (r) => records.push({
        batchIndex: r.batchIndex,
        rowsInBatch: r.rowsInBatch,
        writtenInBatch: r.writtenInBatch,
      }),
    });
    expect(result.written).toBe(2);
    expect(records).toHaveLength(1);
    expect(records[0]?.batchIndex).toBe(0);
    expect(records[0]?.rowsInBatch).toBe(2);
    expect(records[0]?.writtenInBatch).toBe(2);
  });

  it('clamps batchSize: 0 to MIN_BATCH_SIZE (1) and still completes', async () => {
    const { agent } = await seedClaimedAgent();
    const v1 = await seedConfig(agent.id, 1, null);
    await seedConfig(agent.id, 2, v1.id);

    const result = await backfillAgentConfigDiffs(testPrisma, { batchSize: 0 });
    expect(result.written).toBe(1);
  });
});
