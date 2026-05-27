/**
 * Tests for src/lib/attestation/worker.ts.
 *
 * Fake Prisma + injected verifier + injected quote-bytes loader cover
 * every branch of the verdict pipeline without touching real DCAP or
 * the DB.
 *
 * Note (vs. moltverse fonte): repo/ doesn't carry the denormalised
 * `Agent.teeQuoteHash` / `Agent.teeAttestedAt` columns, so the worker
 * skips the trailing `agent.update` and the tests don't assert one.
 */

import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { RTMR3_LEN } from '../../../lib/attestation/binding.js';
import {
  createMockTdxQuoteVerifier,
  type TdxQuoteVerifier,
  type VerificationResult,
} from '../../../lib/attestation/quote-verifier.js';
import type { ApprovedHashEntry } from '../../../lib/attestation/whitelist.js';
import {
  ATTESTATION_VALIDITY_DAYS,
  processNextAttestation,
} from '../../../lib/attestation/worker.js';

const NOW = new Date('2026-05-12T12:00:00Z');
const PUBKEY = Buffer.from(randomBytes(32));

function makeReportData(): Buffer {
  const rd = Buffer.alloc(64);
  createHash('sha256').update(PUBKEY).digest().copy(rd, 0);
  return rd;
}

function makeRtmr3(composeHashHex: string): Buffer {
  const buf = Buffer.alloc(RTMR3_LEN);
  // appId (first 16 bytes) — any deterministic value works
  buf.write('moltverse-app-id', 0, 16, 'utf8');
  Buffer.from(composeHashHex.slice(2), 'hex').copy(buf, 16);
  return buf;
}

function passingVerifier(rd: Buffer, rtmr3: Buffer, ts: Date | null = null): TdxQuoteVerifier {
  return createMockTdxQuoteVerifier({
    decide: (): VerificationResult => ({
      ok: true,
      quote: {
        reportData: rd,
        rtmr3,
        tcbStatus: 'OK',
        quoteVersion: 4,
        quoteTimestamp: ts,
      },
    }),
  });
}

interface PendingRow {
  id: string;
  agentId: string;
  quoteHash: string;
  quoteUri: string;
  agent: { id: string; ed25519PublicKey: Uint8Array | null };
}

function fakePrisma(opts: { pending: PendingRow | null; bytes: Buffer | null }): {
  prisma: unknown;
  spies: {
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  loadQuoteBytes: ReturnType<typeof vi.fn>;
} {
  const update = vi.fn().mockResolvedValue({ id: opts.pending?.id ?? '' });
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const findFirst = vi.fn().mockResolvedValue(opts.pending);

  const prisma = {
    attestation: { findFirst, update, updateMany },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<void>) =>
      cb({
        attestation: { update, updateMany },
      }),
    ),
  };
  const loadQuoteBytes = vi.fn().mockResolvedValue(opts.bytes);
  return { prisma, spies: { update, updateMany }, loadQuoteBytes };
}

const APPROVED_HASH_HEX = '0x' + '1'.repeat(64);
const WHITELIST: ApprovedHashEntry[] = [
  {
    composeHash: APPROVED_HASH_HEX,
    imageDigest: 'sha256:deadbeef',
    imageRef: 'ghcr.io/moltverse/agent:1.0.0',
    version: '1.0.0',
    approvedAt: NOW.toISOString(),
    deprecatedAt: null,
    expiresAt: null,
  },
];

const PENDING: PendingRow = {
  id: 'att_pending',
  agentId: 'agent_1',
  quoteHash: 'sha256:cafebabe',
  quoteUri: 'inline:sha256:cafebabe',
  agent: { id: 'agent_1', ed25519PublicKey: PUBKEY },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processNextAttestation', () => {
  it('returns idle when no PENDING rows exist', async () => {
    const { prisma, loadQuoteBytes } = fakePrisma({ pending: null, bytes: null });
    const r = await processNextAttestation({
      prisma: prisma as never,
      verifier: createMockTdxQuoteVerifier(),
      loadQuoteBytes,
    });
    expect(r).toEqual({ state: 'idle' });
  });

  it('invalidates when the agent has no ed25519 pubkey', async () => {
    const { prisma, spies, loadQuoteBytes } = fakePrisma({
      pending: { ...PENDING, agent: { id: PENDING.agentId, ed25519PublicKey: null } },
      bytes: Buffer.alloc(200),
    });
    const r = await processNextAttestation({
      prisma: prisma as never,
      verifier: createMockTdxQuoteVerifier(),
      loadQuoteBytes,
      whitelist: WHITELIST,
      now: () => NOW,
    });
    expect(r.state).toBe('invalidated');
    if (r.state !== 'invalidated') return;
    expect(r.reason).toBe('binding_mismatch');
    expect(spies.update).toHaveBeenCalledOnce();
  });

  it("invalidates when the quote bytes can't be loaded", async () => {
    const { prisma, spies, loadQuoteBytes } = fakePrisma({ pending: PENDING, bytes: null });
    const r = await processNextAttestation({
      prisma: prisma as never,
      verifier: createMockTdxQuoteVerifier(),
      loadQuoteBytes,
      whitelist: WHITELIST,
      now: () => NOW,
    });
    expect(r.state).toBe('invalidated');
    if (r.state !== 'invalidated') return;
    expect(r.reason).toBe('quote_bytes_missing');
    expect(spies.update).toHaveBeenCalledOnce();
  });

  it('invalidates when the verifier rejects (tcb_unhealthy)', async () => {
    const { prisma, loadQuoteBytes } = fakePrisma({
      pending: PENDING,
      bytes: Buffer.alloc(200),
    });
    const r = await processNextAttestation({
      prisma: prisma as never,
      verifier: createMockTdxQuoteVerifier({
        decide: () => ({ ok: false, code: 'tcb_unhealthy', detail: 'OUT_OF_DATE' }),
      }),
      loadQuoteBytes,
      whitelist: WHITELIST,
      now: () => NOW,
    });
    expect(r.state).toBe('invalidated');
    if (r.state !== 'invalidated') return;
    expect(r.reason).toBe('tcb_unhealthy');
  });

  it('invalidates when the quote_timestamp is past the 24h freshness window', async () => {
    const { prisma, loadQuoteBytes } = fakePrisma({
      pending: PENDING,
      bytes: Buffer.alloc(200),
    });
    const stale = new Date(NOW.getTime() - 25 * 3_600_000);
    const r = await processNextAttestation({
      prisma: prisma as never,
      verifier: passingVerifier(makeReportData(), makeRtmr3(APPROVED_HASH_HEX), stale),
      loadQuoteBytes,
      whitelist: WHITELIST,
      now: () => NOW,
    });
    expect(r.state).toBe('invalidated');
    if (r.state !== 'invalidated') return;
    expect(r.reason).toBe('quote_too_old');
  });

  it('invalidates on reportData binding mismatch', async () => {
    const { prisma, loadQuoteBytes } = fakePrisma({
      pending: PENDING,
      bytes: Buffer.alloc(200),
    });
    // Build reportData with WRONG pubkey hash
    const wrongRd = Buffer.alloc(64);
    createHash('sha256')
      .update(Buffer.from(randomBytes(32)))
      .digest()
      .copy(wrongRd, 0);
    const r = await processNextAttestation({
      prisma: prisma as never,
      verifier: passingVerifier(wrongRd, makeRtmr3(APPROVED_HASH_HEX)),
      loadQuoteBytes,
      whitelist: WHITELIST,
      now: () => NOW,
    });
    expect(r.state).toBe('invalidated');
    if (r.state !== 'invalidated') return;
    expect(r.reason).toBe('binding_mismatch');
  });

  it('invalidates when compose-hash is not on the whitelist', async () => {
    const { prisma, loadQuoteBytes } = fakePrisma({
      pending: PENDING,
      bytes: Buffer.alloc(200),
    });
    const unknownHash = '0x' + '7'.repeat(64);
    const r = await processNextAttestation({
      prisma: prisma as never,
      verifier: passingVerifier(makeReportData(), makeRtmr3(unknownHash)),
      loadQuoteBytes,
      whitelist: WHITELIST,
      now: () => NOW,
    });
    expect(r.state).toBe('invalidated');
    if (r.state !== 'invalidated') return;
    expect(r.reason).toBe('compose_hash_unknown');
  });

  it('marks VALID and persists supersede on happy path', async () => {
    const { prisma, spies, loadQuoteBytes } = fakePrisma({
      pending: PENDING,
      bytes: Buffer.alloc(200),
    });
    const r = await processNextAttestation({
      prisma: prisma as never,
      verifier: passingVerifier(makeReportData(), makeRtmr3(APPROVED_HASH_HEX)),
      loadQuoteBytes,
      whitelist: WHITELIST,
      now: () => NOW,
    });
    expect(r).toEqual({
      state: 'verified',
      attestationId: PENDING.id,
      agentId: PENDING.agentId,
      status: 'VALID',
    });

    // 1 update (set VALID with composeHash + expiresAt), 1 supersede.
    expect(spies.update).toHaveBeenCalledOnce();
    expect(spies.updateMany).toHaveBeenCalledOnce();

    const updateArgs = spies.update.mock.calls[0]?.[0] as {
      data: { status: string; composeHash: string; expiresAt: Date };
    };
    expect(updateArgs.data.status).toBe('VALID');
    expect(updateArgs.data.composeHash).toBe(APPROVED_HASH_HEX);
    const expectedExpiry = new Date(NOW.getTime() + ATTESTATION_VALIDITY_DAYS * 86_400_000);
    expect(updateArgs.data.expiresAt).toEqual(expectedExpiry);

    const supersedeArgs = spies.updateMany.mock.calls[0]?.[0] as {
      where: { agentId: string; status: string; NOT: { id: string } };
      data: { status: string };
    };
    expect(supersedeArgs.where.status).toBe('VALID');
    expect(supersedeArgs.where.agentId).toBe(PENDING.agentId);
    expect(supersedeArgs.data.status).toBe('SUPERSEDED');
  });
});
