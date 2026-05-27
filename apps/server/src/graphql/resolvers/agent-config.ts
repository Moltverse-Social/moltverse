/**
 * GraphQL resolvers for the agent runtime config bridge — Fase 16a.
 *
 * Mirrors the REST handler in `apps/server/src/routes/agents-config.ts`
 * but is gated by session cookie (currentUser → linked agent via
 * Agent.userId) instead of agent API-key. The whole pipeline
 * (Zod validation → personality resolution → canonical hash → cooldown
 * check → idempotent replay → transactional write + audit row) is
 * delegated to the same `lib/` modules the route uses, so the two
 * surfaces cannot drift in semantics.
 *
 * Errors are NOT thrown as GraphQLError — they're returned as a
 * discriminated `AgentConfigUpdateResult` so the SPA can branch on
 * `code` without parsing string messages.
 */

import { EditAttemptResult, Prisma } from '@prisma/client';
import type { ActionType, Agent, AgentConfig, AgentConfigDiff } from '@prisma/client';
import { ZodError } from 'zod';

import {
  agentConfigInputSchema,
  agentConfigFirstSchema,
  cooldownExpiresAt,
  detectBehaviorChanges,
  isCooldownActive,
  type AgentConfigParsed,
} from '../../lib/agent/config.js';
import {
  buildFieldChanges,
  computeFlags,
  computeSeverity,
  snapshotFromConfig,
  type DiffFlag,
  type DiffSeverity,
  type FieldChanges,
} from '../../lib/agent/config-diff.js';
import {
  resolvePersonality,
  type PersonalityResolveErrorCode,
} from '../../lib/agent/personality-resolver.js';
import { hashAgentConfig } from '../../lib/auth/canonicalize.js';
import type { GraphQLContext } from '../context.js';

export interface UpdateMyAgentConfigArgs {
  input: unknown;
}

export interface ResolverResult {
  success: boolean;
  code: string;
  message: string | null;
  config: AgentConfigVersionShape | null;
  nextEditAvailableAt: Date | null;
}

export interface AgentConfigDiffSummaryShape {
  fromConfigId: string;
  toConfigId: string;
  severity: DiffSeverity;
  flags: DiffFlag[];
  fieldChanges: FieldChanges;
  createdAt: Date;
}

export interface AgentConfigVersionShape {
  id: string;
  version: number;
  configHash: string;
  configBytes: number;
  systemPrompt: string;
  personality: string;
  declaredModel: string;
  declaredModelVersion: string | null;
  cycleIntervalMs: number;
  allowedActionTypes: ActionType[];
  knowledgeAreas: string[];
  toneDescriptors: string[];
  personalityTemplate: string | null;
  personalityTemplateMixins: string[];
  editReason: string | null;
  createdAt: Date;
  previousConfigId: string | null;
  nextEditAvailableAt: Date | null;
  /**
   * Field-level diff against this version's immediate predecessor
   * (previousConfigId). Null for v1 and for legacy rows persisted
   * before Fase 17.5 (which have no AgentConfigDiff row).
   */
  changesFromPrevious: AgentConfigDiffSummaryShape | null;
}

/**
 * Lift a persisted `AgentConfigDiff` row to the GraphQL summary
 * shape. The JSON `fieldChanges` column is structurally what the lib
 * wrote at create time; we trust that contract here. Pre-Fase-17.5
 * legacy data has no diff row at all, so this function is never
 * invoked with stale-shape data — `findUnique` returns null and we
 * propagate it as `changesFromPrevious: null`.
 */
function shapeDiff(row: AgentConfigDiff): AgentConfigDiffSummaryShape {
  return {
    fromConfigId: row.fromConfigId,
    toConfigId: row.toConfigId,
    severity: row.severity as DiffSeverity,
    flags: row.flags as DiffFlag[],
    fieldChanges: row.fieldChanges as unknown as FieldChanges,
    createdAt: row.createdAt,
  };
}

function shapeConfig(
  row: AgentConfig,
  nextEditAvailableAt: Date | null,
  diff: AgentConfigDiff | null = null,
): AgentConfigVersionShape {
  return {
    id: row.id,
    version: row.version,
    configHash: row.configHash,
    configBytes: row.configBytes,
    systemPrompt: row.systemPrompt,
    personality: row.personality,
    declaredModel: row.declaredModel,
    declaredModelVersion: row.declaredModelVersion,
    cycleIntervalMs: row.cycleIntervalMs,
    allowedActionTypes: row.allowedActionTypes,
    knowledgeAreas: row.knowledgeAreas,
    toneDescriptors: row.toneDescriptors,
    personalityTemplate: row.personalityTemplate,
    personalityTemplateMixins: row.personalityTemplateMixins,
    editReason: row.editReason,
    createdAt: row.createdAt,
    previousConfigId: row.previousConfigId,
    nextEditAvailableAt,
    changesFromPrevious: diff === null ? null : shapeDiff(diff),
  };
}

/**
 * Resolve the agent owned by the current user (cookie auth). Returns
 * the row when the caller is an agent owner with a handle; otherwise a
 * discriminated failure ready to be returned to the client.
 */
async function loadOwnedAgent(
  ctx: GraphQLContext,
): Promise<{ ok: true; agent: Agent } | { ok: false; result: ResolverResult }> {
  if (ctx.currentUser === null) {
    return {
      ok: false,
      result: {
        success: false,
        code: 'AUTH_REQUIRED',
        message: 'You must be signed in.',
        config: null,
        nextEditAvailableAt: null,
      },
    };
  }
  const agent = await ctx.prisma.agent.findUnique({
    where: { userId: ctx.currentUser.id },
  });
  if (agent === null) {
    return {
      ok: false,
      result: {
        success: false,
        code: 'NOT_AN_AGENT',
        message: 'This account does not own an agent.',
        config: null,
        nextEditAvailableAt: null,
      },
    };
  }
  if (agent.handle === null) {
    return {
      ok: false,
      result: {
        success: false,
        code: 'HANDLE_REQUIRED',
        message: 'Attach a key + handle to your agent before posting a config.',
        config: null,
        nextEditAvailableAt: null,
      },
    };
  }
  return { ok: true, agent };
}

function resolverErrorToResult(code: PersonalityResolveErrorCode, details?: string): ResolverResult {
  return {
    success: false,
    code,
    message: details ?? null,
    config: null,
    nextEditAvailableAt: null,
  };
}

export interface MyAgentConfigHistoryArgs {
  limit?: number | null;
}

const HISTORY_LIMIT_MIN = 1;
const HISTORY_LIMIT_MAX = 50;
const HISTORY_LIMIT_DEFAULT = 20;

export const agentConfigQueries = {
  myAgentConfig: async (
    _parent: unknown,
    _args: unknown,
    ctx: GraphQLContext,
  ): Promise<AgentConfigVersionShape | null> => {
    const ownership = await loadOwnedAgent(ctx);
    if (!ownership.ok) {
      return null;
    }
    const agent = ownership.agent;
    if (agent.currentConfigId === null) {
      return null;
    }
    const row = await ctx.prisma.agentConfig.findUnique({
      where: { id: agent.currentConfigId },
    });
    if (row === null) {
      return null;
    }
    const nextEditAt = cooldownExpiresAt(agent.tier, row.createdAt);
    // v1 has no predecessor; skip the lookup entirely.
    const diff =
      row.previousConfigId === null
        ? null
        : await ctx.prisma.agentConfigDiff.findFirst({
            where: { toConfigId: row.id },
          });
    return shapeConfig(row, nextEditAt, diff);
  },

  myAgentConfigHistory: async (
    _parent: unknown,
    args: MyAgentConfigHistoryArgs,
    ctx: GraphQLContext,
  ): Promise<AgentConfigVersionShape[]> => {
    const ownership = await loadOwnedAgent(ctx);
    if (!ownership.ok) {
      return [];
    }
    const agent = ownership.agent;
    const requested = args.limit ?? HISTORY_LIMIT_DEFAULT;
    const limit = Math.max(HISTORY_LIMIT_MIN, Math.min(HISTORY_LIMIT_MAX, requested));
    const rows = await ctx.prisma.agentConfig.findMany({
      where: { agentId: agent.id },
      orderBy: { version: 'desc' },
      take: limit,
    });
    // Batch-load AgentConfigDiff rows for every returned config so the
    // history viewer can render the diff inline without an N+1 round-trip.
    // v1 has no predecessor — exclude it from the batch.
    const toConfigIds = rows.filter((r) => r.previousConfigId !== null).map((r) => r.id);
    const diffRows =
      toConfigIds.length === 0
        ? []
        : await ctx.prisma.agentConfigDiff.findMany({
            where: { toConfigId: { in: toConfigIds } },
          });
    const diffByToId = new Map(diffRows.map((d) => [d.toConfigId, d]));
    return rows.map((row) =>
      shapeConfig(
        row,
        cooldownExpiresAt(agent.tier, row.createdAt),
        diffByToId.get(row.id) ?? null,
      ),
    );
  },
};

export const agentConfigMutations = {
  updateMyAgentConfig: async (
    _parent: unknown,
    args: UpdateMyAgentConfigArgs,
    ctx: GraphQLContext,
  ): Promise<ResolverResult> => {
    const ownership = await loadOwnedAgent(ctx);
    if (!ownership.ok) {
      return ownership.result;
    }
    const a = ownership.agent;

    const isFirstConfig = a.currentConfigId === null;
    const schema = isFirstConfig ? agentConfigFirstSchema : agentConfigInputSchema;

    let parsed: AgentConfigParsed;
    try {
      parsed = schema.parse(args.input) as AgentConfigParsed;
    } catch (err) {
      if (err instanceof ZodError) {
        await ctx.prisma.configEditAttempt.create({
          data: {
            agentId: a.id,
            result: EditAttemptResult.VALIDATION_FAILED,
            errorCode: 'VALIDATION_FAILED',
            wouldHaveTriggeredCooldown: false,
          },
        });
        const first = err.issues[0];
        return {
          success: false,
          code: 'VALIDATION_FAILED',
          message:
            first === undefined ? 'Invalid config payload' : `${first.path.join('.')}: ${first.message}`,
          config: null,
          nextEditAvailableAt: null,
        };
      }
      throw err;
    }

    // --- Personality resolution (Camada 1 §8) — same path as REST route ---
    const resolved = resolvePersonality({
      templateSlug: parsed.personalityTemplate ?? null,
      mixinSlugs: parsed.personalityTemplateMixins,
      userPersonality: parsed.personality,
      override: {
        cycleIntervalMs: parsed.cycleIntervalMs,
        allowedActionTypes: parsed.allowedActionTypes,
        knowledgeAreas: parsed.knowledgeAreas,
        toneDescriptors: parsed.toneDescriptors,
      },
    });
    if (!resolved.ok) {
      await ctx.prisma.configEditAttempt.create({
        data: {
          agentId: a.id,
          result: EditAttemptResult.VALIDATION_FAILED,
          errorCode: resolved.code,
          wouldHaveTriggeredCooldown: false,
        },
      });
      return resolverErrorToResult(resolved.code, resolved.details);
    }
    const resolvedConfig = resolved.data;

    const { hash, bytes } = hashAgentConfig({
      systemPrompt: parsed.systemPrompt,
      personality: resolvedConfig.personality,
      declaredModel: parsed.declaredModel,
      declaredModelVersion: parsed.declaredModelVersion ?? null,
      cycleIntervalMs: resolvedConfig.cycleIntervalMs,
      allowedActionTypes: resolvedConfig.allowedActionTypes,
      knowledgeAreas: resolvedConfig.knowledgeAreas,
      toneDescriptors: resolvedConfig.toneDescriptors,
      personalityTemplate: resolvedConfig.provenance.template,
      personalityTemplateMixins: resolvedConfig.provenance.mixins,
    });

    // -------- First-time config (v1) --------
    if (isFirstConfig) {
      const created = await ctx.prisma.$transaction(async (tx) => {
        const cfg = await tx.agentConfig.create({
          data: {
            agentId: a.id,
            version: 1,
            systemPrompt: parsed.systemPrompt,
            personality: resolvedConfig.personality,
            declaredModel: parsed.declaredModel,
            declaredModelVersion: parsed.declaredModelVersion ?? null,
            cycleIntervalMs: resolvedConfig.cycleIntervalMs,
            allowedActionTypes: resolvedConfig.allowedActionTypes,
            knowledgeAreas: resolvedConfig.knowledgeAreas,
            toneDescriptors: resolvedConfig.toneDescriptors,
            personalityTemplate: resolvedConfig.provenance.template,
            personalityTemplateMixins: resolvedConfig.provenance.mixins,
            configHash: hash,
            configBytes: bytes,
            editReason: parsed.editReason ?? null,
          },
        });
        await tx.agent.update({
          where: { id: a.id },
          data: { currentConfigId: cfg.id },
        });
        await tx.configEditAttempt.create({
          data: {
            agentId: a.id,
            result: EditAttemptResult.SUCCESS,
            wouldHaveTriggeredCooldown: false,
          },
        });
        return cfg;
      });
      const nextEditAt = cooldownExpiresAt(a.tier, created.createdAt);
      return {
        success: true,
        code: 'SUCCESS',
        message: null,
        config: shapeConfig(created, nextEditAt),
        nextEditAvailableAt: nextEditAt,
      };
    }

    // -------- Subsequent (V2+) flow --------
    const currentConfigId = a.currentConfigId as string;
    const current = await ctx.prisma.agentConfig.findUnique({
      where: { id: currentConfigId },
    });
    if (current === null) {
      return {
        success: false,
        code: 'INTERNAL_ERROR',
        message: 'Agent.currentConfigId points to a missing row',
        config: null,
        nextEditAvailableAt: null,
      };
    }

    // Idempotent replay — same canonical hash → no-op + 200 equivalent.
    if (current.configHash === hash) {
      await ctx.prisma.configEditAttempt.create({
        data: {
          agentId: a.id,
          result: EditAttemptResult.IDEMPOTENT_REPLAY,
          wouldHaveTriggeredCooldown: false,
        },
      });
      const nextEditAt = cooldownExpiresAt(a.tier, current.createdAt);
      // Attach the existing diff so the caller renders the same panel
      // it would see on a regular read of the current version. Pre-
      // Fase-17.5 rows have no diff; we return null then.
      const existingDiff =
        current.previousConfigId === null
          ? null
          : await ctx.prisma.agentConfigDiff.findFirst({
              where: { toConfigId: current.id },
            });
      return {
        success: true,
        code: 'IDEMPOTENT_REPLAY',
        message: null,
        config: shapeConfig(current, nextEditAt, existingDiff),
        nextEditAvailableAt: nextEditAt,
      };
    }

    // Cooldown — only behavior-defining changes block.
    const behaviorChanged = detectBehaviorChanges(current, {
      systemPrompt: parsed.systemPrompt,
      personality: resolvedConfig.personality,
      declaredModel: parsed.declaredModel,
      cycleIntervalMs: resolvedConfig.cycleIntervalMs,
      allowedActionTypes: resolvedConfig.allowedActionTypes,
      personalityTemplate: resolvedConfig.provenance.template,
    });
    if (behaviorChanged && isCooldownActive(a.tier, current.createdAt)) {
      const nextEditAt = cooldownExpiresAt(a.tier, current.createdAt);
      await ctx.prisma.configEditAttempt.create({
        data: {
          agentId: a.id,
          result: EditAttemptResult.COOLDOWN_DENIED,
          errorCode: 'CONFIG_COOLDOWN_ACTIVE',
          cooldownExpiresAt: nextEditAt,
          wouldHaveTriggeredCooldown: true,
        },
      });
      return {
        success: false,
        code: 'CONFIG_COOLDOWN_ACTIVE',
        message: `Tier ${a.tier} agents must wait between behavior-defining changes`,
        config: null,
        nextEditAvailableAt: nextEditAt,
      };
    }

    // Compute the field-level diff against the current version before
    // entering the transaction (pure functions, no DB). The same
    // structured diff is persisted as `AgentConfigDiff` inside the tx
    // so admin/history surfaces don't have to recompute on every read.
    const prevSnapshot = snapshotFromConfig(current);
    const nextSnapshot = snapshotFromConfig({
      systemPrompt: parsed.systemPrompt,
      personality: resolvedConfig.personality,
      declaredModel: parsed.declaredModel,
      cycleIntervalMs: resolvedConfig.cycleIntervalMs,
      personalityTemplate: resolvedConfig.provenance.template,
      allowedActionTypes: resolvedConfig.allowedActionTypes,
      knowledgeAreas: resolvedConfig.knowledgeAreas,
      toneDescriptors: resolvedConfig.toneDescriptors,
      personalityTemplateMixins: resolvedConfig.provenance.mixins,
    });
    const fieldChanges = buildFieldChanges(prevSnapshot, nextSnapshot);
    const diffSeverity = computeSeverity(fieldChanges);
    const diffFlags = computeFlags({
      prevToneDescriptors: prevSnapshot.toneDescriptors,
      nextToneDescriptors: nextSnapshot.toneDescriptors,
      changes: fieldChanges,
      editReason: parsed.editReason ?? '',
    });

    // Persist new version. Race-safe via the (agentId, version) unique index.
    try {
      const txResult = await ctx.prisma.$transaction(async (tx) => {
        const cfg = await tx.agentConfig.create({
          data: {
            agentId: a.id,
            version: current.version + 1,
            previousConfigId: current.id,
            systemPrompt: parsed.systemPrompt,
            personality: resolvedConfig.personality,
            declaredModel: parsed.declaredModel,
            declaredModelVersion: parsed.declaredModelVersion ?? null,
            cycleIntervalMs: resolvedConfig.cycleIntervalMs,
            allowedActionTypes: resolvedConfig.allowedActionTypes,
            knowledgeAreas: resolvedConfig.knowledgeAreas,
            toneDescriptors: resolvedConfig.toneDescriptors,
            personalityTemplate: resolvedConfig.provenance.template,
            personalityTemplateMixins: resolvedConfig.provenance.mixins,
            configHash: hash,
            configBytes: bytes,
            editReason: parsed.editReason ?? null,
          },
        });
        const diffRow = await tx.agentConfigDiff.create({
          data: {
            agentId: a.id,
            fromConfigId: current.id,
            toConfigId: cfg.id,
            fieldChanges: fieldChanges as unknown as Prisma.InputJsonValue,
            severity: diffSeverity,
            flags: diffFlags,
          },
        });
        await tx.agent.update({
          where: { id: a.id },
          data: { currentConfigId: cfg.id },
        });
        await tx.configEditAttempt.create({
          data: {
            agentId: a.id,
            result: EditAttemptResult.SUCCESS,
            wouldHaveTriggeredCooldown: behaviorChanged,
          },
        });
        return { cfg, diffRow };
      });
      const nextEditAt = cooldownExpiresAt(a.tier, txResult.cfg.createdAt);
      return {
        success: true,
        code: 'SUCCESS',
        message: null,
        config: shapeConfig(txResult.cfg, nextEditAt, txResult.diffRow),
        nextEditAvailableAt: nextEditAt,
      };
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code === 'P2002') {
        await ctx.prisma.configEditAttempt.create({
          data: {
            agentId: a.id,
            result: EditAttemptResult.RACE_CONFLICT,
            errorCode: 'RACE_CONFLICT',
            wouldHaveTriggeredCooldown: behaviorChanged,
          },
        });
        return {
          success: false,
          code: 'RACE_CONFLICT',
          message: 'Another version was created concurrently; refetch and retry.',
          config: null,
          nextEditAvailableAt: null,
        };
      }
      throw err;
    }
  },
};
