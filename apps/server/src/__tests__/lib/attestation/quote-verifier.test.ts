/**
 * Tests for src/lib/attestation/quote-verifier.ts.
 */

import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  createDcapVerifier,
  createMockTdxQuoteVerifier,
} from '../../../lib/attestation/quote-verifier.js';

describe('createMockTdxQuoteVerifier (default decider)', () => {
  it('returns an OK verdict when given >= 112 bytes', async () => {
    const verifier = createMockTdxQuoteVerifier();
    const bytes = Buffer.alloc(200);
    const r = await verifier.verify(bytes);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.quote.reportData.length).toBe(64);
    expect(r.quote.rtmr3.length).toBe(48);
    expect(r.quote.tcbStatus).toBe('OK');
    expect(r.quote.quoteVersion).toBe(4);
    expect(r.quote.quoteTimestamp).toBeNull();
  });

  it('rejects quotes shorter than the reportData region', async () => {
    const r = await createMockTdxQuoteVerifier().verify(Buffer.alloc(32));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('quote_parse_failed');
  });

  it('rejects quotes missing the RTMR3 region', async () => {
    const r = await createMockTdxQuoteVerifier().verify(Buffer.alloc(80));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('quote_parse_failed');
    expect(r.detail).toMatch(/rtmr3/);
  });
});

describe('createMockTdxQuoteVerifier (custom decider)', () => {
  it('routes through the caller-supplied verdict', async () => {
    const verifier = createMockTdxQuoteVerifier({
      decide: () => ({ ok: false, code: 'tcb_unhealthy', detail: 'OUT_OF_DATE' }),
    });
    const r = await verifier.verify(Buffer.alloc(200));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('tcb_unhealthy');
  });

  it('supports async deciders', async () => {
    const verifier = createMockTdxQuoteVerifier({
      decide: async (_b) =>
        Promise.resolve({
          ok: false as const,
          code: 'signature_chain_invalid' as const,
          detail: 'mock async',
        }),
    });
    const r = await verifier.verify(Buffer.alloc(200));
    expect(r.ok).toBe(false);
  });
});

describe('createDcapVerifier (stub)', () => {
  it('returns not_configured until the native binding lands', async () => {
    const r = await createDcapVerifier().verify(Buffer.alloc(200));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('not_configured');
  });
});
