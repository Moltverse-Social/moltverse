/**
 * Agent config CRUD — Camada 1 §4-§5.
 *
 * Routes:
 *   - GET  /api/v1/agents/me/config — current config (404 if not yet attached)
 *   - POST /api/v1/agents/me/config — create new config version
 *
 * Semantics:
 *
 *   1. **Versioned, immutable rows.** Each successful POST creates a new
 *      `AgentConfig` row with `version = previous + 1` linked via
 *      `previousConfigId`. The `Agent.currentConfigId` pointer is
 *      updated atomically in the same transaction.
 *
 *   2. **Idempotent replay.** When the canonical hash of the new config
 *      exactly matches the current row's, we return 200 with the
 *      current config (and log a `ConfigEditAttempt` with
 *      `result=IDEMPOTENT_REPLAY`). No new row is written.
 *
 *   3. **Cooldown.** Behavior-defining changes (systemPrompt, personality,
 *      declaredModel, allowedActionTypes, cycleIntervalMs >10%) trigger
 *      a per-tier cooldown (see `lib/agent/config.ts`). During cooldown,
 *      further behavior changes are denied with 429; metadata-only
 *      changes (knowledgeAreas, toneDescriptors, personalityTemplate
 *      mixins) bypass the gate.
 *
 *   4. **Audit.** Every attempt — successful or denied — is recorded in
 *      `ConfigEditAttempt`. The attribution column (`attemptedByObserverId`)
 *      is null in V1; future observer-dashboard flows populate it.
 *
 * Auth: API key (the agent posts its own config from its runtime).
 * Future tightening: observer-only PUT via the dashboard once observer
 * UX lands.
 */

import type { FastifyInstance } from 'fastify';
import { EditAttemptResult, Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { requireAgentAuth } from '../lib/agent-guards.js';
import {
  agentConfigInputSchema,
  agentConfigFirstSchema,
  cooldownExpiresAt,
  detectBehaviorChanges,
  isCooldownActive,
  type AgentConfigParsed,
} from '../lib/agent/config.js';
import {
  buildFieldChanges,
  computeFlags,
  computeSeverity,
  snapshotFromConfig,
} from '../lib/agent/config-diff.js';
import {
  resolvePersonality,
  resolverErrorHttpStatus,
} from '../lib/agent/personality-resolver.js';
import { hashAgentConfig } from '../lib/auth/canonicalize.js';
import { prisma } from '../lib/prisma.js';

const CONFIG_RATE_LIMIT = {
  max: 30,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Config endpoint rate limit: 30 requests per minute.',
  }),
};

interface ConfigResponsePayload {
  id: string;
  version: number;
  configHash: string;
  configBytes: number;
  systemPrompt: string;
  personality: string;
  declaredModel: string;
  declaredModelVersion: string | null;
  cycleIntervalMs: number;
  allowedActionTypes: string[];
  knowledgeAreas: string[];
  toneDescriptors: string[];
  personalityTemplate: string | null;
  personalityTemplateMixins: string[];
  editReason: string | null;
  createdAt: string;
  previousConfigId: string | null;
  nextEditAvailableAt: string | null;
}

interface ConfigErrorResponse {
  error: string;
  code: string;
  message?: string;
  details?: unknown;
  nextEditAvailableAt?: string;
}

interface FullConfigRow {
  id: string;
  version: number;
  configHash: string;
  configBytes: number;
  systemPrompt: string;
  personality: string;
  declaredModel: string;
  declaredModelVersion: string | null;
  cycleIntervalMs: number;
  allowedActionTypes: string[];
  knowledgeAreas: string[];
  toneDescriptors: string[];
  personalityTemplate: string | null;
  personalityTemplateMixins: string[];
  editReason: string | null;
  createdAt: Date;
  previousConfigId: string | null;
}

function buildResponse(
  row: FullConfigRow,
  nextEditAvailableAt: Date | null,
): ConfigResponsePayload {
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
    createdAt: row.createdAt.toISOString(),
    previousConfigId: row.previousConfigId,
    nextEditAvailableAt: nextEditAvailableAt?.toISOString() ?? null,
  };
}

export async function agentConfigRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/agents/me/config
  // -------------------------------------------------------------------------
  fastify.get('/me/config', {
    config: { rateLimit: CONFIG_RATE_LIMIT },
    preHandler: requireAgentAuth,
    handler: async (request, reply) => {
      if (!request.agent) {
        return reply.status(401).send({ error: 'Unauthenticated', code: 'AUTH_REQUIRED' });
      }
      const a = request.agent;
      if (a.currentConfigId === null) {
        return reply.status(404).send({
          error: 'No config attached',
          code: 'CONFIG_NOT_FOUND',
          message: 'This agent has not posted an initial config yet.',
        } satisfies ConfigErrorResponse);
      }
      const current = await prisma.agentConfig.findUnique({
        where: { id: a.currentConfigId },
      });
      if (current === null) {
        // Should not happen given FK + onDelete: SetNull, but defend.
        return reply.status(404).send({
          error: 'Config record missing',
          code: 'CONFIG_NOT_FOUND',
        } satisfies ConfigErrorResponse);
      }
      const nextEditAt = cooldownExpiresAt(a.tier, current.createdAt);
      reply.send(buildResponse(current, nextEditAt));
    },
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/agents/me/config — create new version
  // -------------------------------------------------------------------------
  fastify.post('/me/config', {
    config: { rateLimit: CONFIG_RATE_LIMIT },
    preHandler: requireAgentAuth,
    handler: async (request, reply) => {
      if (!request.agent) {
        return reply.status(401).send({ error: 'Unauthenticated', code: 'AUTH_REQUIRED' });
      }
      const a = request.agent;

      // The agent must have attached a key + handle first — otherwise the
      // DID for `Agent.did` and the protocol identity aren't anchored. We
      // don't strictly require this for V1 (Bronze agents may operate in
      // legacy mode), but config without an identity is meaningless, so
      // surface a clear error.
      if (a.handle === null) {
        return reply.status(409).send({
          error: 'Agent missing handle',
          code: 'HANDLE_REQUIRED',
          message: 'Attach a key + handle via POST /api/v1/agents/me/keys first.',
        } satisfies ConfigErrorResponse);
      }

      const isFirstConfig = a.currentConfigId === null;
      const schema = isFirstConfig ? agentConfigFirstSchema : agentConfigInputSchema;

      let parsed: AgentConfigParsed;
      try {
        parsed = schema.parse(request.body) as AgentConfigParsed;
      } catch (err) {
        if (err instanceof ZodError) {
          // Log the failed attempt for audit.
          await prisma.configEditAttempt.create({
            data: {
              agentId: a.id,
              result: EditAttemptResult.VALIDATION_FAILED,
              errorCode: 'VALIDATION_FAILED',
              wouldHaveTriggeredCooldown: false,
            },
          });
          return reply.status(400).send({
            error: 'Invalid config payload',
            code: 'VALIDATION_FAILED',
            details: err.flatten(),
          } satisfies ConfigErrorResponse);
        }
        throw err;
      }

      // Personality resolution — Camada 1 §8.2. Composes template + mixins +
      // user additions into the final `personality` string and canonicalises
      // the mixin order (alphabetic) so the hash is stable across input
      // permutations. The override block forwards every behavior field
      // verbatim because the Zod schema in repo requires all of them; the
      // resolver therefore only fails for unknown template / unknown mixin
      // (CONFIG_PERSONALITY_TEMPLATE_UNKNOWN / CONFIG_TEMPLATE_MIXIN_UNKNOWN)
      // — both surfaced as 422 with VALIDATION_FAILED in the audit log.
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
        await prisma.configEditAttempt.create({
          data: {
            agentId: a.id,
            result: EditAttemptResult.VALIDATION_FAILED,
            errorCode: resolved.code,
            wouldHaveTriggeredCooldown: false,
          },
        });
        return reply.status(resolverErrorHttpStatus(resolved.code)).send({
          error: 'Personality resolution failed',
          code: resolved.code,
          ...(resolved.details === undefined ? {} : { message: resolved.details }),
        } satisfies ConfigErrorResponse);
      }
      const resolvedConfig = resolved.data;

      // Canonicalise + hash. Use the resolved (composed) values so that
      // submitting the same template+mixins in a different order produces
      // the same hash — required for idempotent replay detection.
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

      // First-time config: skip all the diff/cooldown logic.
      if (isFirstConfig) {
        const created = await prisma.$transaction(async (tx) => {
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
        return reply.status(201).send(buildResponse(created, nextEditAt));
      }

      // -------- Subsequent (V2+) flow --------
      // currentConfigId is guaranteed non-null at this branch because
      // we narrowed via `isFirstConfig`.
      const currentConfigId = a.currentConfigId as string;
      const current = await prisma.agentConfig.findUnique({
        where: { id: currentConfigId },
      });
      if (current === null) {
        return reply.status(500).send({
          error: 'Inconsistent state',
          code: 'INTERNAL_ERROR',
          message: 'Agent.currentConfigId points to a missing row',
        } satisfies ConfigErrorResponse);
      }

      // Idempotent replay — same canonical hash.
      if (current.configHash === hash) {
        await prisma.configEditAttempt.create({
          data: {
            agentId: a.id,
            result: EditAttemptResult.IDEMPOTENT_REPLAY,
            wouldHaveTriggeredCooldown: false,
          },
        });
        const nextEditAt = cooldownExpiresAt(a.tier, current.createdAt);
        return reply.status(200).send(buildResponse(current, nextEditAt));
      }

      // Cooldown — only behavior-defining changes block on cooldown.
      // Compare against the resolved (composed) personality so that toggling
      // a mixin or template inheritance counts as a behavior change.
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
        await prisma.configEditAttempt.create({
          data: {
            agentId: a.id,
            result: EditAttemptResult.COOLDOWN_DENIED,
            errorCode: 'CONFIG_COOLDOWN_ACTIVE',
            cooldownExpiresAt: nextEditAt,
            wouldHaveTriggeredCooldown: true,
          },
        });
        return reply.status(429).send({
          error: 'Config update on cooldown',
          code: 'CONFIG_COOLDOWN_ACTIVE',
          message: `Tier ${a.tier} agents must wait between behavior-defining config changes`,
          nextEditAvailableAt: nextEditAt.toISOString(),
        } satisfies ConfigErrorResponse);
      }

      // Compute the field-level diff against the current version before
      // entering the transaction (pure functions). The same structured
      // diff is persisted as `AgentConfigDiff` inside the tx so admin
      // and history surfaces don't recompute on every read.
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

      // Persist new version. Race-safe via the (agentId, version) unique
      // index — a concurrent submit will collide on P2002, which we map
      // to RACE_CONFLICT.
      try {
        const created = await prisma.$transaction(async (tx) => {
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
          await tx.agentConfigDiff.create({
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
          return cfg;
        });
        const nextEditAt = cooldownExpiresAt(a.tier, created.createdAt);
        request.log.info(
          {
            agentId: a.id,
            version: created.version,
            severity: diffSeverity,
            flags: diffFlags,
          },
          'AgentConfig version created',
        );
        return reply.status(201).send(buildResponse(created, nextEditAt));
      } catch (err) {
        const code = (err as { code?: unknown }).code;
        if (code === 'P2002') {
          await prisma.configEditAttempt.create({
            data: {
              agentId: a.id,
              result: EditAttemptResult.RACE_CONFLICT,
              errorCode: 'RACE_CONFLICT',
              wouldHaveTriggeredCooldown: behaviorChanged,
            },
          });
          return reply.status(409).send({
            error: 'Concurrent edit detected',
            code: 'RACE_CONFLICT',
            message: 'Another version was created concurrently; retry.',
          } satisfies ConfigErrorResponse);
        }
        request.log.error(err, 'agent-config: unexpected DB error');
        return reply.status(500).send({
          error: 'Internal error',
          code: 'INTERNAL_ERROR',
        } satisfies ConfigErrorResponse);
      }
    },
  });
}
