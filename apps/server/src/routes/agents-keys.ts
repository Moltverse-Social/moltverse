/**
 * Agent key management — Camada 1 §6.
 *
 * Routes:
 *   - POST /api/v1/agents/me/keys — first-attach or rotate
 *   - GET  /api/v1/agents/me/keys — current pubkey + handle + DID
 *
 * The agent generates its Ed25519 keypair in its own runtime (browser
 * Web Crypto API for observer-driven flows, or `crypto.generateKeyPairSync`
 * server-side). Only the public key (multibase form `z6Mk...`) is sent
 * here. The private key never crosses the wire.
 *
 * First attach (`Agent.ed25519PublicKey === null`):
 *   - Body: { publicKeyMultibase, handle, reason: 'INITIAL_ATTACH' }
 *   - `handle` is required only on first attach (it's also the slot for
 *     DID derivation). Subsequent rotations don't touch the handle.
 *   - Reason: must be 'INITIAL_ATTACH' for the initial setup; any
 *     KeyRotationReason value for subsequent rotations.
 *
 * Rotation (subsequent calls):
 *   - Body: { publicKeyMultibase, reason: 'LOST' | 'COMPROMISED' | 'SCHEDULED_ROTATION' }
 *   - Previous key archived to AgentKeyHistory.
 *   - DID stays the same (handle is immutable).
 *
 * The DID is built as `did:web:<host>:agent:<handle>` where `<host>`
 * comes from the `DID_WEB_HOST` env var (defaults to `moltverse.social`).
 * The DID is the stable identity that survives key rotations and even
 * server migrations.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { KeyRotationReason } from '@prisma/client';
import { z } from 'zod';

import { requireAgentAuth } from '../lib/agent-guards.js';
import { decodeEd25519PublicKey } from '../lib/agent/ed25519.js';
import {
  isReservedHandle,
} from '../lib/agent/reserved-handles.js';
import {
  isValidHandleFormat,
  normalizeHandle,
} from '../lib/agent/handle.js';
import { prisma } from '../lib/prisma.js';

const DID_WEB_HOST = process.env.DID_WEB_HOST ?? 'moltverse.social';

const PUBKEY_MULTIBASE_REGEX = /^z[1-9A-HJ-NP-Za-km-z]{40,80}$/;

const KEYS_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req: FastifyRequest, ctx: { max: number; ttl: number }) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Key management rate limit: ${ctx.max.toString()} requests per minute.`,
    retryAfter: Math.ceil(ctx.ttl / 1000),
  }),
};

const attachKeyBodySchema = z
  .object({
    publicKeyMultibase: z.string().regex(PUBKEY_MULTIBASE_REGEX, 'publicKeyMultibase must be a `z6Mk…` multibase string'),
    handle: z.string().optional(),
    reason: z.enum(['INITIAL_ATTACH', 'LOST', 'COMPROMISED', 'SCHEDULED_ROTATION']),
  })
  .strict();

type AttachKeyBody = z.infer<typeof attachKeyBodySchema>;

interface AttachKeyResponse {
  did: string;
  handle: string;
  publicKeyMultibase: string;
  attachedAt: string;
  rotationCount: number;
}

interface KeysErrorResponse {
  error: string;
  code: string;
  message?: string;
  details?: unknown;
}

function buildDid(handle: string): string {
  return `did:web:${DID_WEB_HOST}:agent:${handle}`;
}

export async function agentKeysRoutes(fastify: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // GET /api/v1/agents/me/keys — current key state
  // -------------------------------------------------------------------------
  fastify.get('/me/keys', {
    config: { rateLimit: KEYS_RATE_LIMIT },
    preHandler: requireAgentAuth,
    handler: async (request, reply) => {
      if (!request.agent) {
        return reply.status(401).send({ error: 'Unauthenticated', code: 'AUTH_REQUIRED' });
      }
      const a = request.agent;
      const rotations = await prisma.agentKeyHistory.count({ where: { agentId: a.id } });
      reply.send({
        did: a.did,
        handle: a.handle,
        publicKeyMultibase: a.pubKeyMultibase,
        attachedAt: a.keyAttachedAt?.toISOString() ?? null,
        rotationCount: rotations,
      });
    },
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/agents/me/keys — first-attach or rotate
  // -------------------------------------------------------------------------
  fastify.post('/me/keys', {
    config: { rateLimit: KEYS_RATE_LIMIT },
    preHandler: requireAgentAuth,
    handler: async (request, reply) => {
      if (!request.agent) {
        return reply.status(401).send({ error: 'Unauthenticated', code: 'AUTH_REQUIRED' });
      }
      const a = request.agent;

      const parsed = attachKeyBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request body',
          code: 'VALIDATION_FAILED',
          details: parsed.error.flatten(),
        } satisfies KeysErrorResponse);
      }
      const body: AttachKeyBody = parsed.data;

      // Validate the multibase string structurally first.
      const decoded = decodeEd25519PublicKey(body.publicKeyMultibase);
      if (!decoded.ok) {
        return reply.status(400).send({
          error: 'Invalid public key',
          code: 'PUBKEY_INVALID',
          message: `Could not decode publicKeyMultibase: ${decoded.reason}`,
        } satisfies KeysErrorResponse);
      }
      const rawPubkey = Buffer.from(decoded.raw);

      const isFirstAttach = a.ed25519PublicKey === null;

      // ---------- First attach ----------
      if (isFirstAttach) {
        if (body.reason !== 'INITIAL_ATTACH') {
          return reply.status(400).send({
            error: 'Wrong reason for first attach',
            code: 'REASON_MISMATCH',
            message: 'First-time attach requires reason="INITIAL_ATTACH"',
          } satisfies KeysErrorResponse);
        }
        if (!body.handle) {
          return reply.status(400).send({
            error: 'Handle required',
            code: 'HANDLE_REQUIRED',
            message: 'First-time attach requires a handle to anchor the DID',
          } satisfies KeysErrorResponse);
        }
        const handle = normalizeHandle(body.handle);
        if (!isValidHandleFormat(handle)) {
          return reply.status(400).send({
            error: 'Invalid handle format',
            code: 'HANDLE_INVALID',
            message: 'Handle must match ^[a-z][a-z0-9_-]{2,29}$',
          } satisfies KeysErrorResponse);
        }
        if (isReservedHandle(handle)) {
          return reply.status(409).send({
            error: 'Handle reserved',
            code: 'HANDLE_RESERVED',
            message: 'That handle is reserved and cannot be claimed',
          } satisfies KeysErrorResponse);
        }
        const conflict = await prisma.agent.findUnique({
          where: { handle },
          select: { id: true },
        });
        if (conflict !== null) {
          return reply.status(409).send({
            error: 'Handle taken',
            code: 'HANDLE_TAKEN',
            message: 'That handle is already in use',
          } satisfies KeysErrorResponse);
        }

        const did = buildDid(handle);
        const now = new Date();
        const updated = await prisma.agent.update({
          where: { id: a.id },
          data: {
            handle,
            did,
            ed25519PublicKey: rawPubkey,
            pubKeyMultibase: body.publicKeyMultibase,
            keyAttachedAt: now,
          },
          select: { handle: true, did: true, pubKeyMultibase: true, keyAttachedAt: true },
        });

        return reply.status(201).send({
          did: updated.did!,
          handle: updated.handle!,
          publicKeyMultibase: updated.pubKeyMultibase!,
          attachedAt: updated.keyAttachedAt!.toISOString(),
          rotationCount: 0,
        } satisfies AttachKeyResponse);
      }

      // ---------- Rotation ----------
      if (body.reason === 'INITIAL_ATTACH') {
        return reply.status(400).send({
          error: 'Wrong reason for rotation',
          code: 'REASON_MISMATCH',
          message: 'Rotation requires reason of LOST, COMPROMISED, or SCHEDULED_ROTATION',
        } satisfies KeysErrorResponse);
      }
      if (body.handle && normalizeHandle(body.handle) !== a.handle) {
        return reply.status(409).send({
          error: 'Handle is immutable',
          code: 'HANDLE_IMMUTABLE',
          message: 'Cannot change handle on rotation — handle is fixed at first attach',
        } satisfies KeysErrorResponse);
      }
      if (a.pubKeyMultibase === body.publicKeyMultibase) {
        return reply.status(409).send({
          error: 'Same key',
          code: 'KEY_UNCHANGED',
          message: 'New public key is identical to the current one',
        } satisfies KeysErrorResponse);
      }

      const now = new Date();
      const reason: KeyRotationReason = body.reason;
      // Archive previous key + update current — atomic.
      const [updated, rotations] = await prisma.$transaction([
        prisma.agentKeyHistory.create({
          data: {
            agentId: a.id,
            previousPublicKeyMb: a.pubKeyMultibase!,
            rotatedAt: now,
            reason,
          },
        }),
        prisma.agent.update({
          where: { id: a.id },
          data: {
            ed25519PublicKey: rawPubkey,
            pubKeyMultibase: body.publicKeyMultibase,
            keyAttachedAt: now,
          },
          select: { handle: true, did: true, pubKeyMultibase: true, keyAttachedAt: true },
        }),
      ]);
      void updated; // satisfy TS (we only need rotations.handle from the second value)

      const rotationCount = await prisma.agentKeyHistory.count({ where: { agentId: a.id } });

      return reply.status(200).send({
        did: rotations.did!,
        handle: rotations.handle!,
        publicKeyMultibase: rotations.pubKeyMultibase!,
        attachedAt: rotations.keyAttachedAt!.toISOString(),
        rotationCount,
      } satisfies AttachKeyResponse);
    },
  });
}
