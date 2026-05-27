/**
 * Tests for src/routes/agents-attestation.ts — pure helpers.
 *
 * The full HTTP pipeline is exercised by the smoke integration test;
 * here we lock in hashQuote determinism and verifyEd25519OverBytes'
 * failure mapping.
 */

import { Buffer } from 'node:buffer';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  MAX_QUOTE_BYTES,
  MIN_QUOTE_BYTES,
  hashQuote,
  verifyEd25519OverBytes,
} from '../../routes/agents-attestation.js';

function makeEd25519Pair(): { pubRaw: Uint8Array; sign: (msg: Buffer) => string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pubJwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const pubRaw = Buffer.from(pubJwk.x, 'base64url');
  return {
    pubRaw,
    sign: (msg: Buffer) => {
      const sig = cryptoSign(null, msg, privateKey);
      return Buffer.from(sig).toString('base64url');
    },
  };
}

// ---------------------------------------------------------------------------
// hashQuote
// ---------------------------------------------------------------------------

describe('hashQuote', () => {
  it('returns sha256:<hex> matching Camada 2 convention', () => {
    const h = hashQuote(Buffer.from('hello'));
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it('is deterministic', () => {
    expect(hashQuote(Buffer.from('a'))).toBe(hashQuote(Buffer.from('a')));
  });
  it('changes on a 1-byte tamper', () => {
    expect(hashQuote(Buffer.from('aaa'))).not.toBe(hashQuote(Buffer.from('aab')));
  });
});

// ---------------------------------------------------------------------------
// verifyEd25519OverBytes
// ---------------------------------------------------------------------------

describe('verifyEd25519OverBytes', () => {
  it('accepts a fresh signature from the matching key', () => {
    const { pubRaw, sign } = makeEd25519Pair();
    const msg = Buffer.alloc(64, 0xa5);
    expect(verifyEd25519OverBytes(msg, sign(msg), pubRaw)).toEqual({ ok: true });
  });

  it('rejects a tampered message', () => {
    const { pubRaw, sign } = makeEd25519Pair();
    const msg = Buffer.alloc(64, 0xa5);
    const sig = sign(msg);
    const tampered = Buffer.from(msg);
    tampered[0] = (tampered[0] ?? 0) ^ 0x01;
    const r = verifyEd25519OverBytes(tampered, sig, pubRaw);
    expect(r).toEqual({ ok: false, reason: 'verification_failed' });
  });

  it('rejects a signature from a different key', () => {
    const a = makeEd25519Pair();
    const b = makeEd25519Pair();
    const msg = Buffer.alloc(64);
    const sigFromA = a.sign(msg);
    const r = verifyEd25519OverBytes(msg, sigFromA, b.pubRaw);
    expect(r.ok).toBe(false);
  });

  it('rejects malformed signature (wrong base64url alphabet)', () => {
    const { pubRaw } = makeEd25519Pair();
    const r = verifyEd25519OverBytes(Buffer.from('x'), 'has spaces!!', pubRaw);
    expect(r).toEqual({ ok: false, reason: 'malformed_sig' });
  });

  it('rejects malformed signature (wrong length)', () => {
    const { pubRaw } = makeEd25519Pair();
    const r = verifyEd25519OverBytes(Buffer.from('x'), 'shorty', pubRaw);
    expect(r).toEqual({ ok: false, reason: 'malformed_sig' });
  });

  it('rejects an invalid public key length', () => {
    const { sign } = makeEd25519Pair();
    const msg = Buffer.alloc(1);
    const r = verifyEd25519OverBytes(msg, sign(msg), new Uint8Array(16));
    expect(r).toEqual({ ok: false, reason: 'invalid_pubkey' });
  });
});

// ---------------------------------------------------------------------------
// Size constants — guard the documented bounds
// ---------------------------------------------------------------------------

describe('quote size bounds', () => {
  it('reserves the spec-documented quote envelope', () => {
    expect(MIN_QUOTE_BYTES).toBe(1_000);
    expect(MAX_QUOTE_BYTES).toBe(50_000);
  });
});
