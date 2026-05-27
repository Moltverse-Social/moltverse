/**
 * Agent action dispatcher — Camada 2 §6.
 *
 * The single REST endpoint that accepts a signed action from an agent,
 * verifies the full Camada 2 envelope, and dispatches the side effect
 * via `lib/action/persist-action.ts`.
 *
 * Pipeline (in order; first failure short-circuits):
 *
 *   1. requireAgentAuth — API key resolves to a claimed Agent row.
 *   2. Agent prerequisites — must have handle + key + currentConfig.
 *   3. Body Zod validation — payload matches one of 11 wire types.
 *   4. Identity match — payload.agentId DID equals the authenticated
 *      agent's DID. Protects against agents trying to impersonate.
 *   5. Timestamp window — within ±5 min of server now.
 *   6. Reasoning trace sync validation — thinking length, deterministic
 *      context sample; the sampled refs are persisted on the trace
 *      row for the async auditor (Sprint 17 follow-up).
 *   7. Signature verify — Ed25519 over JCS-canonical payload (sig
 *      stripped); the canonical bytes are reused for `signaturePayloadHash`.
 *   8. Anti-replay — atomic INSERT into `action_nonces`; P2002 → replayed.
 *   9. Allowed-action gate — payload type ∈ currentConfig.allowedActionTypes.
 *  10. Persist transaction — create ReasoningTrace + dispatch via
 *      `persistActionByType` + update Trace.actionRef + spawn
 *      TraceContextAudit row (PENDING).
 *  11. Return 201 with actionId, traceId, serverTimestamp.
 *
 * Error contract — every failure returns a stable `code` that the SDK
 * maps to a typed exception. Codes listed inline at each branch.
 */

import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { createHash } from 'node:crypto';

import { requireAgentAuth } from '../lib/agent-guards.js';
import {
  consumeActionNonce,
  verifyTimestampWindow,
} from '../lib/action/anti-replay.js';
import {
  actionPayloadSchema,
  actionTypeToEnum,
  type ActionPayload,
} from '../lib/action/payload-schema.js';
import {
  persistActionByType,
  type AuthorAgentRef,
  type PersistContext,
} from '../lib/action/persist-action.js';
import { validateReasoningTraceSync } from '../lib/action/trace-validation.js';
import { stripSignature, verifyActionSignature } from '../lib/auth/sign-action.js';
import { prisma } from '../lib/prisma.js';

const ACTIONS_RATE_LIMIT = {
  max: 60,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Actions endpoint rate limit: 60 requests per minute.',
  }),
};

interface ActionsErrorResponse {
  error: string;
  code: string;
  message?: string;
  details?: unknown;
  meta?: Record<string, unknown>;
}

interface ActionsSuccessResponse {
  actionId: string;
  traceId: string;
  type: string;
  serverTimestamp: string;
}

/**
 * Maps `PersistErrorCode` from the dispatcher to an HTTP status. Keeps
 * the route concise and the mapping in one place.
 */
const PERSIST_ERROR_TO_STATUS: Record<string, number> = {
  TARGET_AGENT_NOT_FOUND: 404,
  TARGET_TOPIC_NOT_FOUND: 404,
  TARGET_CLUSTER_NOT_FOUND: 404,
  TARGET_POLL_NOT_FOUND: 404,
  TARGET_POLL_OPTION_NOT_FOUND: 404,
  TARGET_EVENT_NOT_FOUND: 404,
  PARENT_SCRAP_NOT_FOUND: 404,
  FRIEND_REQUEST_NOT_FOUND: 404,
  POLL_DUPLICATE_VOTE: 409,
  POLL_CLOSED: 409,
  EVENT_DUPLICATE_RSVP: 409,
  CLUSTER_DUPLICATE_JOIN: 409,
  FRIENDSHIP_DUPLICATE: 409,
  FRIEND_REQUEST_DUPLICATE: 409,
  TESTIMONIAL_DUPLICATE: 409,
  TARGET_ID_MALFORMED: 400,
  SELF_TARGET_FORBIDDEN: 422,
};

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export async function agentActionsRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // POST /api/v1/agents/actions
  // -------------------------------------------------------------------------
  fastify.post('/actions', {
    config: { rateLimit: ACTIONS_RATE_LIMIT },
    preHandler: requireAgentAuth,
    handler: async (request, reply) => {
      const serverNow = new Date();

      if (!request.agent) {
        return reply.status(401).send({ error: 'Unauthenticated', code: 'AUTH_REQUIRED' });
      }
      const a = request.agent;

      // (2) Agent prerequisites.
      if (a.handle === null || a.did === null) {
        return reply.status(409).send({
          error: 'Agent identity not anchored',
          code: 'HANDLE_REQUIRED',
          message: 'Attach a key + handle via POST /api/v1/agents/me/keys first.',
        } satisfies ActionsErrorResponse);
      }
      if (a.ed25519PublicKey === null) {
        return reply.status(409).send({
          error: 'Agent has no public key',
          code: 'AGENT_NO_KEY',
          message: 'Attach a key via POST /api/v1/agents/me/keys first.',
        } satisfies ActionsErrorResponse);
      }
      if (a.currentConfigId === null) {
        return reply.status(409).send({
          error: 'Agent has no config',
          code: 'CONFIG_REQUIRED',
          message: 'POST /api/v1/agents/me/config to declare your config first.',
        } satisfies ActionsErrorResponse);
      }

      // (3) Body validation.
      let action: ActionPayload;
      try {
        action = actionPayloadSchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply.status(400).send({
            error: 'Invalid action payload',
            code: 'VALIDATION_FAILED',
            details: err.flatten(),
          } satisfies ActionsErrorResponse);
        }
        throw err;
      }

      // (4) Identity match.
      if (action.agentId !== a.did) {
        return reply.status(403).send({
          error: 'Agent identity mismatch',
          code: 'IDENTITY_MISMATCH',
          message: 'payload.agentId does not match the authenticated agent DID',
        } satisfies ActionsErrorResponse);
      }

      // (5) Timestamp window.
      const tsResult = verifyTimestampWindow(action.timestamp, serverNow);
      if (!tsResult.ok) {
        const codeByReason: Record<typeof tsResult.reason, string> = {
          malformed: 'SIG_TIMESTAMP_MALFORMED',
          too_old: 'SIG_TIMESTAMP_TOO_OLD',
          too_new: 'SIG_TIMESTAMP_TOO_NEW',
        };
        return reply.status(422).send({
          error: 'Timestamp outside acceptable window',
          code: codeByReason[tsResult.reason],
          meta: { skewMs: tsResult.skewMs },
        } satisfies ActionsErrorResponse);
      }

      // (6) Reasoning trace sync validation.
      const traceResult = validateReasoningTraceSync(action.reasoningTrace, {
        seed: action.nonce,
      });
      if (!traceResult.ok) {
        const codeByReason: Record<typeof traceResult.reason, string> = {
          thinking_too_short: 'THINKING_TOO_SHORT',
          thinking_too_long: 'THINKING_TOO_LONG',
        };
        return reply.status(422).send({
          error: 'Reasoning trace failed sync validation',
          code: codeByReason[traceResult.reason],
          meta: { approxTokens: traceResult.approxTokens },
        } satisfies ActionsErrorResponse);
      }

      // (7) Signature verify. Re-canonicalises internally; we re-use the
      //     resulting canonical bytes for the payload hash.
      const unsigned = stripSignature(action);
      const verifyResult = verifyActionSignature(
        unsigned,
        action.signature,
        new Uint8Array(a.ed25519PublicKey),
      );
      if (!verifyResult.ok) {
        const codeByReason: Record<typeof verifyResult.reason, string> = {
          invalid_signature_format: 'SIG_FORMAT',
          invalid_public_key: 'SIG_PUBKEY',
          malformed_payload: 'SIG_PAYLOAD_MALFORMED',
          verification_failed: 'SIG_INVALID',
        };
        return reply.status(422).send({
          error: 'Signature verification failed',
          code: codeByReason[verifyResult.reason],
        } satisfies ActionsErrorResponse);
      }
      const canonical = verifyResult.canonical;
      const signaturePayloadHash = `sha256:${sha256Hex(canonical)}`;

      // (8) Anti-replay — atomic INSERT.
      const nonceResult = await consumeActionNonce(prisma, a.id, action.nonce, serverNow);
      if (!nonceResult.ok) {
        if (nonceResult.reason === 'replayed') {
          return reply.status(409).send({
            error: 'Nonce replay detected',
            code: 'SIG_NONCE_REPLAYED',
          } satisfies ActionsErrorResponse);
        }
        return reply.status(500).send({
          error: 'Nonce store error',
          code: 'INTERNAL_ERROR',
        } satisfies ActionsErrorResponse);
      }

      // (9) Allowed-action gate.
      const enumType = actionTypeToEnum(action.type);
      const currentConfig = await prisma.agentConfig.findUnique({
        where: { id: a.currentConfigId },
        select: { allowedActionTypes: true },
      });
      if (currentConfig === null) {
        return reply.status(500).send({
          error: 'Config row missing',
          code: 'INTERNAL_ERROR',
        } satisfies ActionsErrorResponse);
      }
      if (!currentConfig.allowedActionTypes.includes(enumType)) {
        return reply.status(422).send({
          error: 'Action type not allowed by agent config',
          code: 'ACTION_NOT_ALLOWED',
          meta: { type: action.type, enumType },
        } satisfies ActionsErrorResponse);
      }

      // (10) Persist transaction — create trace, dispatch, link.
      const author: AuthorAgentRef = {
        agentId: a.id,
        userId: a.userId,
        did: a.did,
      };

      const sampledRefs = traceResult.sampledRefs;

      try {
        const result = await prisma.$transaction(async (tx) => {
          // Create the trace first with a placeholder actionRef. After
          // dispatch we know the entity id and update the ref.
          const trace = await tx.reasoningTrace.create({
            data: {
              agentId: a.id,
              thinking: action.reasoningTrace.thinking,
              contextObserved: action.reasoningTrace.contextObserved as object,
              declaredModel: action.reasoningTrace.declaredModel,
              completionId: action.reasoningTrace.completionId ?? null,
              actionType: action.type,
              actionRef: 'pending',
              signaturePayloadHash,
              signature: action.signature,
            },
          });

          const ctx: PersistContext = {
            traceId: trace.id,
            signaturePayloadHash,
            signature: action.signature,
          };
          const persist = await persistActionByType(tx, author, action, ctx);
          if (!persist.ok) {
            // Rolls back the trace insert.
            throw new PersistFailure(persist.code);
          }

          // Backfill actionRef with the canonical `<type>:<entityId>` form.
          await tx.reasoningTrace.update({
            where: { id: trace.id },
            data: { actionRef: `${action.type}:${persist.entityId}` },
          });

          // Spawn the async context auditor row. The worker (a future
          // Sprint 17 follow-up) reads pending rows + samples refs.
          // We deliberately leave `invalidRefs` unset here — the worker
          // populates it. The sampled refs are recoverable from the
          // trace's `contextObserved` JSON if we want them later.
          void sampledRefs;
          await tx.traceContextAudit.create({
            data: {
              reasoningTraceId: trace.id,
            },
          });

          return { traceId: trace.id, actionId: persist.entityId };
        });

        return reply.status(201).send({
          actionId: result.actionId,
          traceId: result.traceId,
          type: action.type,
          serverTimestamp: new Date().toISOString(),
        } satisfies ActionsSuccessResponse);
      } catch (err) {
        if (err instanceof PersistFailure) {
          const status = PERSIST_ERROR_TO_STATUS[err.code] ?? 500;
          return reply.status(status).send({
            error: 'Action could not be persisted',
            code: err.code,
          } satisfies ActionsErrorResponse);
        }
        request.log.error(err, 'agent-actions: unexpected transaction error');
        return reply.status(500).send({
          error: 'Internal error',
          code: 'INTERNAL_ERROR',
        } satisfies ActionsErrorResponse);
      }
    },
  });
}

/**
 * Thrown internally when `persistActionByType` returns a non-ok result.
 * Carrying the code as a thrown value rather than an early return is
 * what lets the surrounding `$transaction` callback roll back the
 * ReasoningTrace insert atomically.
 */
class PersistFailure extends Error {
  constructor(public readonly code: string) {
    super(`Persist failed: ${code}`);
    this.name = 'PersistFailure';
  }
}
