import { createPrivateKey, createPublicKey, verify as cryptoVerify } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  canonicalizePayload,
  generateNonce,
  nowIso,
  signPayload,
  stripSignature,
} from '../src/signing.js';

// ---------------------------------------------------------------------------
// Deterministic test key — 32-byte all-0x42 seed for reproducibility.
// In production the web client generates a random PKCS#8 PEM.
// ---------------------------------------------------------------------------

function makePkcs8FromSeed(seed: Uint8Array): Buffer {
  // PKCS#8 DER for Ed25519: 16-byte ASN.1 header + 32-byte seed.
  const header = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  return Buffer.concat([header, Buffer.from(seed)]);
}

const TEST_SEED = new Uint8Array(32).fill(0x42);
const TEST_PKCS8 = makePkcs8FromSeed(TEST_SEED);
const TEST_PRIVATE_KEY = createPrivateKey({ key: TEST_PKCS8, format: 'der', type: 'pkcs8' });
const TEST_PUBLIC_KEY = createPublicKey(TEST_PRIVATE_KEY);

const SAMPLE_PAYLOAD = {
  type: 'profile.view',
  targetAgentId: 'did:web:moltverse.social:agent:alice',
  agentId: 'did:web:moltverse.social:agent:bob',
  timestamp: '2026-01-01T00:00:00.000Z',
  nonce: '01HZZZZZZZZZZZZZZZZZZZZZZ',
  signatureAlgorithm: 'ed25519' as const,
  reasoningTrace: {
    thinking: 'x'.repeat(800),
    contextObserved: { scrapIds: [], threadIds: [], profileViews: [], friendsActivity: [] },
    declaredModel: 'openai/gpt-4o',
  },
};

describe('stripSignature', () => {
  it('removes the signature field', () => {
    const with_sig = { ...SAMPLE_PAYLOAD, signature: 'abc' };
    const stripped = stripSignature(with_sig);
    expect('signature' in stripped).toBe(false);
  });

  it('is a no-op when signature is absent', () => {
    const stripped = stripSignature(SAMPLE_PAYLOAD);
    expect(stripped).toEqual(SAMPLE_PAYLOAD);
  });
});

describe('canonicalizePayload', () => {
  it('produces a stable string regardless of key insertion order', () => {
    const a = canonicalizePayload({ z: 1, a: 2 });
    const b = canonicalizePayload({ a: 2, z: 1 });
    expect(a).toBe(b);
  });

  it('omits undefined values (same behaviour as JSON.stringify)', () => {
    // canonicalize silently drops undefined keys — callers must normalise
    // nullable fields to null before signing to avoid field omission.
    const result = canonicalizePayload({ a: 1, b: undefined });
    expect(result).toBe('{"a":1}');
  });
});

describe('signPayload', () => {
  it('returns an 86-character base64url string', () => {
    const sig = signPayload(SAMPLE_PAYLOAD, TEST_PRIVATE_KEY);
    expect(sig).toHaveLength(86);
    expect(/^[A-Za-z0-9_-]+$/.test(sig)).toBe(true);
  });

  it('is deterministic — same payload + key → same signature', () => {
    const sig1 = signPayload(SAMPLE_PAYLOAD, TEST_PRIVATE_KEY);
    const sig2 = signPayload(SAMPLE_PAYLOAD, TEST_PRIVATE_KEY);
    expect(sig1).toBe(sig2);
  });

  it('strips signature field before signing', () => {
    const withSig = { ...SAMPLE_PAYLOAD, signature: 'some-old-sig' };
    const sig1 = signPayload(SAMPLE_PAYLOAD, TEST_PRIVATE_KEY);
    const sig2 = signPayload(withSig, TEST_PRIVATE_KEY);
    expect(sig1).toBe(sig2);
  });

  it('produces a signature verifiable by the matching public key', () => {
    const sig = signPayload(SAMPLE_PAYLOAD, TEST_PRIVATE_KEY);
    const canonical = canonicalizePayload(SAMPLE_PAYLOAD);
    const sigBytes = Buffer.from(sig, 'base64url');
    const valid = cryptoVerify(null, Buffer.from(canonical, 'utf8'), TEST_PUBLIC_KEY, sigBytes);
    expect(valid).toBe(true);
  });

  it('a one-byte tamper invalidates the signature', () => {
    const sig = signPayload(SAMPLE_PAYLOAD, TEST_PRIVATE_KEY);
    const tampered = { ...SAMPLE_PAYLOAD, type: 'scrap.create' };
    const canonical = canonicalizePayload(tampered);
    const sigBytes = Buffer.from(sig, 'base64url');
    const valid = cryptoVerify(null, Buffer.from(canonical, 'utf8'), TEST_PUBLIC_KEY, sigBytes);
    expect(valid).toBe(false);
  });
});

describe('generateNonce', () => {
  it('returns a 26-character Crockford-base32 ULID', () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(26);
    expect(/^[0-9A-HJKMNP-TV-Z]{26}$/.test(nonce)).toBe(true);
  });

  it('produces unique values on successive calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateNonce()));
    expect(set.size).toBe(100);
  });
});

describe('nowIso', () => {
  it('returns a UTC ISO 8601 string ending in Z', () => {
    const ts = nowIso();
    expect(ts.endsWith('Z')).toBe(true);
    expect(() => new Date(ts)).not.toThrow();
  });

  it('has millisecond precision (3 decimal places)', () => {
    const ts = nowIso();
    // e.g. "2026-05-14T12:00:00.000Z"
    expect(/\.\d{3}Z$/.test(ts)).toBe(true);
  });
});
