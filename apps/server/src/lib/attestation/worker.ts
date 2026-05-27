/**
 * Attestation verification worker — Camada 5 §5.3.
 *
 * Picks the oldest PENDING_VERIFICATION row, runs the TDX verifier +
 * binding + whitelist checks, and writes the verdict. The verifier
 * itself is injected — production wires the DCAP verifier, tests +
 * dev wire the mock.
 *
 * The quote bytes are stored inline at submission time via the
 * `inline:<quoteHash>` placeholder URI; once R2 lands the route's
 * `quoteUri` flips to a real URL and the worker downloads. Until
 * then, the worker re-derives quote bytes from the submission cache
 * provided by the caller (the route handler passes them in via an
 * optional in-memory bridge).
 *
 * Adaptation notes (vs. moltverse fonte):
 *   - repo/ doesn't carry `Agent.teeQuoteHash` / `Agent.teeAttestedAt`
 *     denormalized columns. The Camada 4 tier evaluator already
 *     JOINs against the attestations table for the freshness check,
 *     so the worker omits the final `agent.update` that the moltverse
 *     version performs. If future read paths need the denormalised
 *     columns, the migration is additive — wire them then.
 *
 * Returns a discriminated {@link ProcessResult} for each tick so the
 * plugin can log/emit counts without re-querying.
 */

import { Buffer } from 'node:buffer';

import type { Attestation, PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { createChildLogger } from '../logger.js';

import { extractComposeHashFromRtmr3, verifyReportDataBinding } from './binding.js';
import type { TdxQuoteVerifier, VerificationFailureCode } from './quote-verifier.js';
import { isApprovedComposeHash, type ApprovedHashEntry } from './whitelist.js';

const log = createChildLogger({ module: 'attestation-worker' });

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** TEE attestation validity window — spec §5.3 sets 90 days. */
export const ATTESTATION_VALIDITY_DAYS = 90;
/** Hard cap on quote age at submission. Defeats stockpile attacks. */
export const QUOTE_FRESHNESS_HOURS = 24;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface WorkerDeps {
  prisma: PrismaClient;
  verifier: TdxQuoteVerifier;
  /**
   * Resolve a quote URI back to its raw bytes. The submission route
   * currently emits `inline:<quoteHash>` so the in-process cache fed
   * by the route is the source of truth; when R2 storage lands, the
   * production loader fetches from there.
   */
  loadQuoteBytes(uri: string, quoteHash: string): Promise<Buffer | null>;
  /** Allow tests to swap the active whitelist. Falls back to the
   *  default in-tree list. */
  whitelist?: readonly ApprovedHashEntry[];
  now?: () => Date;
}

export type ProcessResult =
  | { state: 'idle' }
  | { state: 'verified'; attestationId: string; agentId: string; status: 'VALID' }
  | {
      state: 'invalidated';
      attestationId: string;
      agentId: string;
      reason:
        | VerificationFailureCode
        | 'binding_mismatch'
        | 'compose_hash_unknown'
        | 'quote_bytes_missing';
    };

// ---------------------------------------------------------------------------
// Process one
// ---------------------------------------------------------------------------

export async function processNextAttestation(deps: WorkerDeps): Promise<ProcessResult> {
  const now = deps.now ?? ((): Date => new Date());

  // Pick the oldest PENDING row. We don't use a separate queue table —
  // `status: 'PENDING_VERIFICATION'` is the queue.
  const pending = await deps.prisma.attestation.findFirst({
    where: { status: 'PENDING_VERIFICATION' },
    orderBy: { createdAt: 'asc' },
    include: { agent: { select: { id: true, ed25519PublicKey: true } } },
  });
  if (pending === null) return { state: 'idle' };
  if (pending.agent.ed25519PublicKey === null) {
    // Edge case: the agent rotated its key out (or never attached one).
    // We cannot verify the report_data binding without a pubkey, so
    // mark INVALID and surface the missing-pubkey signal.
    await markInvalid(
      deps.prisma,
      pending.id,
      'Agent has no ed25519 public key',
      { code: 'binding_mismatch', reason: 'pubkey_missing' },
      now(),
    );
    return {
      state: 'invalidated',
      attestationId: pending.id,
      agentId: pending.agentId,
      reason: 'binding_mismatch',
    };
  }

  const quoteBytes = await deps.loadQuoteBytes(pending.quoteUri, pending.quoteHash);
  if (quoteBytes === null) {
    await markInvalid(
      deps.prisma,
      pending.id,
      'Quote bytes unavailable',
      { code: 'quote_bytes_missing' },
      now(),
    );
    return {
      state: 'invalidated',
      attestationId: pending.id,
      agentId: pending.agentId,
      reason: 'quote_bytes_missing',
    };
  }

  // 1. DCAP verification (mockable)
  const verdict = await deps.verifier.verify(quoteBytes);
  if (!verdict.ok) {
    await markInvalid(
      deps.prisma,
      pending.id,
      `Verifier rejected quote: ${verdict.code}`,
      { code: verdict.code, detail: verdict.detail },
      now(),
    );
    return {
      state: 'invalidated',
      attestationId: pending.id,
      agentId: pending.agentId,
      reason: verdict.code,
    };
  }

  // 1.5 Quote freshness — only if the verifier surfaced a timestamp.
  if (verdict.quote.quoteTimestamp !== null) {
    const ageMs = now().getTime() - verdict.quote.quoteTimestamp.getTime();
    if (ageMs > QUOTE_FRESHNESS_HOURS * 3_600_000) {
      await markInvalid(
        deps.prisma,
        pending.id,
        `Quote too old: ${String(Math.floor(ageMs / 3_600_000))}h since generation`,
        { code: 'quote_too_old' },
        now(),
      );
      return {
        state: 'invalidated',
        attestationId: pending.id,
        agentId: pending.agentId,
        reason: 'quote_too_old',
      };
    }
  }

  // 2. report_data binding — commits to the agent's pubkey
  const binding = verifyReportDataBinding(verdict.quote.reportData, pending.agent.ed25519PublicKey);
  if (!binding.ok) {
    await markInvalid(
      deps.prisma,
      pending.id,
      `report_data binding failed: ${binding.reason}`,
      { code: 'binding_mismatch', reason: binding.reason },
      now(),
    );
    return {
      state: 'invalidated',
      attestationId: pending.id,
      agentId: pending.agentId,
      reason: 'binding_mismatch',
    };
  }

  // 3. compose-hash whitelist
  let composeHashHex: string;
  try {
    composeHashHex = extractComposeHashFromRtmr3(verdict.quote.rtmr3).composeHashHex;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await markInvalid(
      deps.prisma,
      pending.id,
      `RTMR3 extraction failed: ${detail}`,
      { code: 'compose_hash_unknown', detail },
      now(),
    );
    return {
      state: 'invalidated',
      attestationId: pending.id,
      agentId: pending.agentId,
      reason: 'compose_hash_unknown',
    };
  }
  const approval = isApprovedComposeHash(composeHashHex, {
    ...(deps.whitelist !== undefined ? { list: deps.whitelist } : {}),
    now: now(),
  });
  if (!approval.approved) {
    await markInvalid(
      deps.prisma,
      pending.id,
      `compose-hash not approved: ${approval.reason}`,
      { code: 'compose_hash_unknown', reason: approval.reason, composeHash: composeHashHex },
      now(),
    );
    return {
      state: 'invalidated',
      attestationId: pending.id,
      agentId: pending.agentId,
      reason: 'compose_hash_unknown',
    };
  }

  // 4. Persist VALID + supersede prior in one tx.
  const verifiedAt = now();
  const expiresAt = new Date(verifiedAt.getTime() + ATTESTATION_VALIDITY_DAYS * 86_400_000);
  await deps.prisma.$transaction(async (tx) => {
    await tx.attestation.update({
      where: { id: pending.id },
      data: {
        status: 'VALID',
        composeHash: composeHashHex,
        // ApprovedHashEntry is a plain serialisable object; Prisma's
        // InputJsonValue can't see that through structural typing.
        composeHashEntry: approval.entry as unknown as Prisma.InputJsonValue,
        reportDataHex: Buffer.from(verdict.quote.reportData).toString('hex'),
        rtmr3Hex: Buffer.from(verdict.quote.rtmr3).toString('hex'),
        quoteVersion: verdict.quote.quoteVersion,
        verificationDetail: {
          tcbStatus: verdict.quote.tcbStatus,
          onChainStatus: 'PENDING_PHASE_6',
        },
        attestedAt: verifiedAt,
        expiresAt,
      },
    });
    await tx.attestation.updateMany({
      where: {
        agentId: pending.agentId,
        status: 'VALID',
        NOT: { id: pending.id },
      },
      data: { status: 'SUPERSEDED' },
    });
  });

  log.info(
    {
      attestationId: pending.id,
      agentId: pending.agentId,
      composeHash: composeHashHex,
      expiresAt: expiresAt.toISOString(),
    },
    'Attestation verified',
  );

  return {
    state: 'verified',
    attestationId: pending.id,
    agentId: pending.agentId,
    status: 'VALID',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markInvalid(
  prisma: Pick<PrismaClient, 'attestation'>,
  attestationId: string,
  reason: string,
  detail: object,
  now: Date,
): Promise<Pick<Attestation, 'id'>> {
  return await prisma.attestation.update({
    where: { id: attestationId },
    data: {
      status: 'INVALID',
      invalidatedAt: now,
      invalidatedReason: truncate(reason, 200),
      verificationDetail: detail as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
}

function truncate(input: string, max: number): string {
  return input.length > max ? input.slice(0, max - 3) + '...' : input;
}

// ---------------------------------------------------------------------------
// In-process quote cache — temporary bridge until R2 storage lands.
//
// The submission route writes to this map; the worker reads from it. A
// row's entry is removed once the worker reaches a terminal state. The
// map is intentionally simple: small footprint, single-process, no
// persistence guarantees on restart.
// ---------------------------------------------------------------------------

const quoteCache = new Map<string, Buffer>();

export function rememberQuoteBytes(quoteHash: string, bytes: Buffer): void {
  quoteCache.set(quoteHash, bytes);
}

export function forgetQuoteBytes(quoteHash: string): void {
  quoteCache.delete(quoteHash);
}

/**
 * Default loader the plugin wires in — looks up the bytes the route
 * cached in-process. When R2 storage replaces the `inline:` URI scheme
 * the production loader changes; this is the dev/test default.
 */
export function loadQuoteBytesFromMemory(_uri: string, quoteHash: string): Promise<Buffer | null> {
  return Promise.resolve(quoteCache.get(quoteHash) ?? null);
}

/** @internal Test seam. */
export function _clearQuoteCache(): void {
  quoteCache.clear();
}
