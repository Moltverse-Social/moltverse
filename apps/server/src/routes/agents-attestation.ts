/**
 * TEE attestation submission — Camada 5 §5.2 / §6.1.
 *
 *   POST /api/v1/agents/me/attestation
 *   Auth: Bearer agentApiKey (the agent itself, via `requireAgentAuth`)
 *   Body: { quoteB64, quoteSignature }
 *
 * Pipeline:
 *  1. requireAgentAuth populates `request.agent`
 *  2. Decode + size-clamp the quote bytes (1k–50k per spec §5.2)
 *  3. Verify the submitter's ed25519 signature over the raw quote
 *     bytes (proves the agent holds its private key)
 *  4. Compute sha256 prefix → idempotency probe; if a row already
 *     exists for that hash, return its current status
 *  5. Persist `PENDING_VERIFICATION` with placeholder fields the
 *     worker fills in
 *
 * The verification worker plugin (`plugins/attestation-verifier.ts`)
 * picks PENDING rows up out-of-band; this route never blocks on it.
 */

import { Buffer } from 'node:buffer';
import { createHash, createPublicKey, verify as cryptoVerify } from 'node:crypto';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireAgentAuth } from '../lib/agent-guards.js';
import { rememberQuoteBytes } from '../lib/attestation/worker.js';
import { ED25519_PUBKEY_BYTES, ED25519_SIGNATURE_BYTES } from '../lib/auth/sign-action.js';
import { prisma } from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Smallest plausible DCAP quote — under this we reject without parsing. */
export const MIN_QUOTE_BYTES = 1_000;
/** Largest plausible DCAP quote (with cert chain). Above this is
 *  almost certainly malicious or corrupt input. */
export const MAX_QUOTE_BYTES = 50_000;

const ATTESTATION_RATE_LIMIT = {
  max: 5,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req: FastifyRequest, ctx: { max: number; ttl: number }): {
    statusCode: number;
    error: string;
    code: string;
    message: string;
    retryAfter: number;
  } => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Attestation submission rate limit: ${ctx.max.toString()} per minute.`,
    retryAfter: Math.ceil(ctx.ttl / 1000),
  }),
};

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const submissionBodySchema = z
  .object({
    quoteB64: z.string().min(1, 'quoteB64 is required'),
    quoteSignature: z.string().min(1, 'quoteSignature is required'),
  })
  .strict();

export type AttestationSubmissionBody = z.input<typeof submissionBodySchema>;

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

interface SubmissionResponse {
  attestationId: string;
  status: 'PENDING_VERIFICATION' | 'VALID' | 'INVALID' | 'EXPIRED' | 'REVOKED' | 'SUPERSEDED';
  /** True when the row was created by THIS request. False for idempotent reuse. */
  created: boolean;
}

interface ErrorBody {
  error: string;
  code: string;
  details?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/** sha256 of the quote bytes, prefixed `sha256:<hex>` to match Camada 2 convention. */
export function hashQuote(quoteBytes: Buffer): string {
  return `sha256:${createHash('sha256').update(quoteBytes).digest('hex')}`;
}

/**
 * Verify an ed25519 signature over raw bytes. Returns a discriminated
 * result so the route can map failures to specific HTTP codes.
 *
 * Pure (no I/O); uses Node's crypto under the hood like sign-action.ts
 * but operates on raw bytes rather than a JCS-canonical JSON form —
 * the quote is a binary blob, not JSON.
 */
export type QuoteSigCheck =
  | { ok: true }
  | { ok: false; reason: 'malformed_sig' | 'invalid_pubkey' | 'verification_failed' };

export function verifyEd25519OverBytes(
  message: Buffer,
  signatureB64url: string,
  publicKey: Uint8Array,
): QuoteSigCheck {
  if (!/^[A-Za-z0-9_-]+$/.test(signatureB64url)) {
    return { ok: false, reason: 'malformed_sig' };
  }
  const sigBytes = Buffer.from(signatureB64url, 'base64url');
  if (sigBytes.length !== ED25519_SIGNATURE_BYTES) {
    return { ok: false, reason: 'malformed_sig' };
  }
  if (publicKey.length !== ED25519_PUBKEY_BYTES) {
    return { ok: false, reason: 'invalid_pubkey' };
  }
  let keyObj;
  try {
    keyObj = createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(publicKey).toString('base64url'),
      },
      format: 'jwk',
    });
  } catch {
    return { ok: false, reason: 'invalid_pubkey' };
  }
  const valid = cryptoVerify(null, message, keyObj, sigBytes);
  return valid ? { ok: true } : { ok: false, reason: 'verification_failed' };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function submitAttestationHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SubmissionResponse | ErrorBody | undefined> {
  // requireAgentAuth runs as preHandler; agent is non-null here.
  const agent = request.agent;
  if (agent === undefined) {
    reply.status(401);
    return { error: 'Agent credentials required', code: 'AUTH_API_KEY_INVALID' };
  }
  if (agent.status !== 'ACTIVE') {
    reply.status(403);
    return { error: 'Agent is not ACTIVE', code: 'AGENT_NOT_ACTIVE' };
  }
  if (agent.ed25519PublicKey === null) {
    reply.status(409);
    return {
      error: 'Agent must attach an ed25519 key before submitting attestations',
      code: 'AGENT_KEY_NOT_ATTACHED',
    };
  }

  // Body shape
  const parsed = submissionBodySchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400);
    return {
      error: 'Validation error',
      code: 'ATTEST_BODY_INVALID',
      details: parsed.error.issues[0]?.message ?? 'invalid body',
    };
  }

  // Decode + size-clamp quote
  let quoteBytes: Buffer;
  try {
    quoteBytes = Buffer.from(parsed.data.quoteB64, 'base64');
  } catch {
    reply.status(400);
    return { error: 'quoteB64 is not valid base64', code: 'ATTEST_QUOTE_B64_INVALID' };
  }
  if (quoteBytes.length < MIN_QUOTE_BYTES || quoteBytes.length > MAX_QUOTE_BYTES) {
    reply.status(422);
    return {
      error: `Quote length out of range — got ${String(quoteBytes.length)} bytes`,
      code: 'ATTEST_QUOTE_SIZE_INVALID',
    };
  }

  // Verify submitter signature — proves the agent holds the priv key
  const sigCheck = verifyEd25519OverBytes(
    quoteBytes,
    parsed.data.quoteSignature,
    agent.ed25519PublicKey,
  );
  if (!sigCheck.ok) {
    reply.status(401);
    return {
      error: 'Submitter signature invalid',
      code: 'ATTEST_SUBMITTER_SIG_INVALID',
      details: sigCheck.reason,
    };
  }

  // Idempotency probe via quoteHash
  const quoteHash = hashQuote(quoteBytes);
  const existing = await prisma.attestation.findUnique({
    where: { quoteHash },
    select: { id: true, status: true, agentId: true },
  });
  if (existing !== null) {
    if (existing.agentId !== agent.id) {
      // Same quote bytes from a different agent — should never happen
      // (report_data binds the quote to a single key), but we refuse
      // to share rows across agents either way.
      reply.status(409);
      return { error: 'Quote already submitted by another agent', code: 'ATTEST_QUOTE_REUSED' };
    }
    reply.status(200);
    return { attestationId: existing.id, status: existing.status, created: false };
  }

  // Persist PENDING_VERIFICATION
  // Placeholder hex fields will be overwritten by the worker.
  // quoteUri is a deferred concern (R2 storage lands later); we
  // record a sentinel that the worker can update once R2 is wired.
  const created = await prisma.attestation.create({
    data: {
      agentId: agent.id,
      quoteHash,
      quoteUri: `inline:${quoteHash}`,
      status: 'PENDING_VERIFICATION',
      // expiresAt is required NOT NULL but irrelevant until VALID. Use
      // epoch zero as a sentinel that's clearly "not yet verified"; the
      // worker overwrites this when it flips status → VALID.
      expiresAt: new Date(0),
    },
    select: { id: true, status: true },
  });

  // Hand the bytes to the in-process cache so the verifier worker
  // can pick them up without an R2 round trip. Cache is best-effort:
  // a process restart between submission and verification leaves the
  // worker to fail with `quote_bytes_missing`, which is the correct
  // signal that R2 storage needs to land before high-availability
  // deployments rely on this path.
  rememberQuoteBytes(quoteHash, quoteBytes);

  request.log.info(
    { agentId: agent.id, attestationId: created.id, quoteHash, bytes: quoteBytes.length },
    'TEE attestation submitted',
  );

  reply.status(202);
  return { attestationId: created.id, status: created.status, created: true };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function agentAttestationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/me/attestation',
    {
      config: { rateLimit: ATTESTATION_RATE_LIMIT },
      preHandler: requireAgentAuth,
    },
    submitAttestationHandler,
  );
}
