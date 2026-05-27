/**
 * Tests for src/lib/attestation/binding.ts.
 *
 * Pure crypto utilities — fully deterministic, no I/O.
 */

import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  REPORT_DATA_LEN,
  RTMR3_LEN,
  extractComposeHashFromRtmr3,
  verifyReportDataBinding,
} from '../../../lib/attestation/binding.js';

function makeReportData(pubkey: Buffer): Buffer {
  const rd = Buffer.alloc(REPORT_DATA_LEN);
  createHash('sha256').update(pubkey).digest().copy(rd, 0);
  // Trailing 32 bytes already zero — Buffer.alloc defaults to zero.
  return rd;
}

const PUBKEY = Buffer.from(randomBytes(32));

// ---------------------------------------------------------------------------
// verifyReportDataBinding
// ---------------------------------------------------------------------------

describe('verifyReportDataBinding', () => {
  it('accepts the canonical sha256(pubkey) || zero-pad layout', () => {
    expect(verifyReportDataBinding(makeReportData(PUBKEY), PUBKEY)).toEqual({ ok: true });
  });

  it('rejects wrong length', () => {
    const tooShort = Buffer.alloc(32);
    expect(verifyReportDataBinding(tooShort, PUBKEY)).toEqual({
      ok: false,
      reason: 'wrong_length',
    });
    const tooLong = Buffer.alloc(96);
    expect(verifyReportDataBinding(tooLong, PUBKEY)).toEqual({
      ok: false,
      reason: 'wrong_length',
    });
  });

  it('rejects when sha256(pubkey) does not match (1-bit flip)', () => {
    const rd = makeReportData(PUBKEY);
    // Flip a bit in the hash region
    rd[0] = (rd[0] ?? 0) ^ 0x01;
    expect(verifyReportDataBinding(rd, PUBKEY).ok).toBe(false);
  });

  it('rejects when trailing 32 bytes carry non-zero data', () => {
    const rd = makeReportData(PUBKEY);
    rd[40] = 0xff;
    const r = verifyReportDataBinding(rd, PUBKEY);
    expect(r).toEqual({ ok: false, reason: 'trailing_not_zero' });
  });

  it('rejects an entirely different public key', () => {
    const rd = makeReportData(PUBKEY);
    const otherPub = Buffer.from(randomBytes(32));
    expect(verifyReportDataBinding(rd, otherPub).ok).toBe(false);
  });

  it('rejects a quote bound to a different agent (even with same head sha256 source)', () => {
    // Build rd against PUBKEY, then ask to verify against another key.
    // The whole point of the check.
    const rd = makeReportData(PUBKEY);
    const r = verifyReportDataBinding(rd, Buffer.from(randomBytes(32)));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('pubkey_hash_mismatch');
  });
});

// ---------------------------------------------------------------------------
// extractComposeHashFromRtmr3
// ---------------------------------------------------------------------------

describe('extractComposeHashFromRtmr3', () => {
  it('extracts appId + composeHash + lowercase 0x-hex', () => {
    const rtmr = Buffer.alloc(RTMR3_LEN);
    Buffer.from('aabbccddeeff00112233445566778899', 'hex').copy(rtmr, 0); // appId (16 bytes)
    Buffer.from('a'.repeat(64), 'hex').copy(rtmr, 16); // composeHash (32 bytes)
    const out = extractComposeHashFromRtmr3(rtmr);
    expect(out.appId.length).toBe(16);
    expect(out.composeHash.length).toBe(32);
    expect(out.composeHashHex).toBe('0x' + 'a'.repeat(64));
  });

  it('throws on wrong length', () => {
    expect(() => extractComposeHashFromRtmr3(Buffer.alloc(40))).toThrow(/length mismatch/i);
  });
});
