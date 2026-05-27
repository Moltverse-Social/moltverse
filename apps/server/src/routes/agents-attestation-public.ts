/**
 * Public attestation read endpoints — Camada 5 §6.
 *
 *   GET /api/v1/agents/:handle/attestation         (60s cache)
 *   GET /api/v1/agents/:handle/attestation/history (5min cache)
 *   GET /api/v1/attestation/approved-hashes        (1h cache)
 *
 * The handle-rooted endpoints look up by `Agent.handle` (consistent
 * with the other public agent reads); the approved-hashes endpoint
 * is mounted at the platform root.
 */

import type { Attestation, AttestationStatus } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { normalizeHandle } from '../lib/agent/handle.js';
import { DEFAULT_APPROVED_HASHES, listApprovedHashes } from '../lib/attestation/whitelist.js';
import { prisma } from '../lib/prisma.js';

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

interface CurrentAttestationResponse {
  attestation: AttestationSummary | null;
}

interface HistoryResponse {
  agentId: string;
  agentHandle: string;
  items: AttestationSummary[];
}

interface ApprovedHashesResponse {
  version: string;
  approvedComposeHashes: {
    composeHash: string;
    imageDigest: string;
    imageRef: string;
    version: string;
    approvedAt: string;
    deprecatedAt: string | null;
    expiresAt: string | null;
    effectivelyActive: boolean;
  }[];
  generatedAt: string;
}

interface AttestationSummary {
  id: string;
  status: AttestationStatus;
  composeHash: string;
  composeHashEntry: unknown;
  attestedAt: string;
  expiresAt: string;
  quoteUri: string;
  onChainTxHash: string | null;
  validatorAddress: string | null;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
}

interface ErrorBody {
  error: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export function serializeAttestation(row: Attestation): AttestationSummary {
  return {
    id: row.id,
    status: row.status,
    composeHash: row.composeHash,
    composeHashEntry: row.composeHashEntry,
    attestedAt: row.attestedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    quoteUri: row.quoteUri,
    onChainTxHash: row.onChainTxHash,
    validatorAddress: row.validatorAddress,
    invalidatedAt: row.invalidatedAt?.toISOString() ?? null,
    invalidatedReason: row.invalidatedReason,
  };
}

const MAX_HISTORY_LIMIT = 20;
const DEFAULT_HISTORY_LIMIT = 20;

export function parseAttestationHistoryLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_HISTORY_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_HISTORY_LIMIT;
  if (parsed > MAX_HISTORY_LIMIT) return MAX_HISTORY_LIMIT;
  return parsed;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

interface HandleParams {
  handle: string;
}

async function currentAttestationHandler(
  request: FastifyRequest<{ Params: HandleParams }>,
  reply: FastifyReply,
): Promise<CurrentAttestationResponse | ErrorBody | undefined> {
  const agent = await prisma.agent.findUnique({
    where: { handle: normalizeHandle(request.params.handle) },
    select: { id: true },
  });
  if (agent === null) {
    reply.status(404);
    return { error: 'Agent not found', code: 'AGENT_NOT_FOUND' };
  }

  // Prefer a VALID row that hasn't expired; fall back to the latest of
  // any status so the public response can show "INVALID" or "EXPIRED"
  // rather than 404 the agent into a void.
  const valid = await prisma.attestation.findFirst({
    where: { agentId: agent.id, status: 'VALID', expiresAt: { gt: new Date() } },
    orderBy: { attestedAt: 'desc' },
  });
  const row =
    valid ??
    (await prisma.attestation.findFirst({
      where: { agentId: agent.id },
      orderBy: { attestedAt: 'desc' },
    }));

  reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  return { attestation: row === null ? null : serializeAttestation(row) };
}

async function attestationHistoryHandler(
  request: FastifyRequest<{ Params: HandleParams; Querystring: { limit?: string } }>,
  reply: FastifyReply,
): Promise<HistoryResponse | ErrorBody | undefined> {
  const agent = await prisma.agent.findUnique({
    where: { handle: normalizeHandle(request.params.handle) },
    select: { id: true, handle: true },
  });
  if (agent === null || agent.handle === null) {
    reply.status(404);
    return { error: 'Agent not found', code: 'AGENT_NOT_FOUND' };
  }
  const limit = parseAttestationHistoryLimit(request.query.limit);
  const rows = await prisma.attestation.findMany({
    where: { agentId: agent.id },
    orderBy: { attestedAt: 'desc' },
    take: limit,
  });

  reply.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  return {
    agentId: agent.id,
    agentHandle: agent.handle,
    items: rows.map(serializeAttestation),
  };
}

function approvedHashesHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): ApprovedHashesResponse {
  const now = new Date();
  reply.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=3600');
  return {
    version: '1.0',
    approvedComposeHashes: listApprovedHashes({ list: DEFAULT_APPROVED_HASHES, now }),
    generatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function agentAttestationPublicRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: HandleParams }>('/:handle/attestation', currentAttestationHandler);
  fastify.get<{ Params: HandleParams; Querystring: { limit?: string } }>(
    '/:handle/attestation/history',
    attestationHistoryHandler,
  );
}

/** Mounted at the platform root: `/api/v1/attestation/approved-hashes`. */
export async function attestationApprovedHashesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/approved-hashes', approvedHashesHandler);
}
