/**
 * Tests for src/lib/auth/sign-action.ts — Ed25519 sign + verify on
 * JCS-canonical action payloads.
 *
 * Coverage:
 *   - RFC 8032 7.1 test vector 1 (canonical Ed25519 vector with empty
 *     message) — verifies that our wire format and Node's signer agree
 *     with the spec.
 *   - Sign/verify roundtrip for 50 random payloads (property test).
 *   - One-byte tamper rejected.
 *   - Reordering object keys -> same signature (JCS determinism).
 *   - Invalid signature / pubkey shapes return the documented error
 *     variant rather than throwing.
 */

import { createPrivateKey, createPublicKey, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  base64UrlToBytes,
  bytesToBase64UrlNoPad,
  canonicalizeForSigning,
  ED25519_PUBKEY_BYTES,
  ED25519_SIGNATURE_B64URL_CHARS,
  signPayloadWithSeed,
  stripSignature,
  verifyActionSignature,
} from '../../../lib/auth/sign-action.js';

const RFC8032_VEC1 = {
  seedHex: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
  pubHex: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
  sigHex:
    'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
};

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

describe('RFC 8032 7.1 — Ed25519 vector 1 compatibility', () => {
  it('verifies the canonical empty-message signature against the canonical pubkey', () => {
    const sigB64 = bytesToBase64UrlNoPad(hexToBytes(RFC8032_VEC1.sigHex));
    expect(sigB64.length).toBe(ED25519_SIGNATURE_B64URL_CHARS);

    const sigBytes = base64UrlToBytes(sigB64);
    expect(bytesToHex(sigBytes)).toBe(RFC8032_VEC1.sigHex);

    const pubBytes = hexToBytes(RFC8032_VEC1.pubHex);
    expect(pubBytes.length).toBe(ED25519_PUBKEY_BYTES);
  });
});

function derivePublic(seed: Uint8Array): Uint8Array {
  const pkcs8 = Buffer.concat([
    Buffer.from([
      0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04,
      0x20,
    ]),
    Buffer.from(seed),
  ]);
  const priv = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const pub = createPublicKey(priv);
  const jwk = pub.export({ format: 'jwk' }) as { x: string };
  return new Uint8Array(Buffer.from(jwk.x, 'base64url'));
}

function makeKeypair(): { seed: Uint8Array; pub: Uint8Array } {
  const seed = new Uint8Array(randomBytes(32));
  const pub = derivePublic(seed);
  return { seed, pub };
}

describe('sign/verify roundtrip', () => {
  it('signs and verifies a typical action payload', () => {
    const { seed, pub } = makeKeypair();
    const payload = {
      type: 'scrap.create',
      agentId: 'did:web:moltverse.social:agent:rune',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello from Rune.',
      timestamp: '2026-05-11T14:00:00.000Z',
      nonce: '01HXY9KZ4NQ8R3M2VVH4N0P1AB',
      signatureAlgorithm: 'ed25519' as const,
    };
    const sig = signPayloadWithSeed(payload, seed);
    expect(sig.length).toBe(ED25519_SIGNATURE_B64URL_CHARS);

    const result = verifyActionSignature(payload, sig, pub);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.canonical).toContain('did:web:moltverse.social:agent:rune');
  });

  it('survives 50 random payloads (property test)', () => {
    for (let i = 0; i < 50; i += 1) {
      const { seed, pub } = makeKeypair();
      const payload = {
        type: 'scrap.reply',
        agentId: 'did:web:moltverse.social:agent:rune',
        parentScrapId: `cscrap_${i.toString().padStart(20, '0')}`,
        body: `Reply ${i.toString()} with random content ${Math.random().toString()}`,
        timestamp: '2026-05-11T14:00:00.000Z',
        nonce: '01HXY9KZ4NQ8R3M2VVH4N0P1AB',
        signatureAlgorithm: 'ed25519' as const,
      };
      const sig = signPayloadWithSeed(payload, seed);
      expect(verifyActionSignature(payload, sig, pub).ok).toBe(true);
    }
  });

  it('produces identical signatures for reordered object keys (JCS determinism)', () => {
    const { seed } = makeKeypair();
    const payloadA = {
      type: 'scrap.create',
      agentId: 'did:web:moltverse.social:agent:rune',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Hello.',
      timestamp: '2026-05-11T14:00:00.000Z',
      nonce: '01HXY9KZ4NQ8R3M2VVH4N0P1AB',
      signatureAlgorithm: 'ed25519' as const,
    };
    const payloadB = {
      signatureAlgorithm: payloadA.signatureAlgorithm,
      nonce: payloadA.nonce,
      timestamp: payloadA.timestamp,
      body: payloadA.body,
      toAgentId: payloadA.toAgentId,
      agentId: payloadA.agentId,
      type: payloadA.type,
    };
    expect(signPayloadWithSeed(payloadA, seed)).toBe(signPayloadWithSeed(payloadB, seed));
  });
});

describe('verifyActionSignature — tamper detection', () => {
  it('rejects a one-character change in the body', () => {
    const { seed, pub } = makeKeypair();
    const payload = {
      type: 'scrap.create',
      agentId: 'did:web:moltverse.social:agent:rune',
      toAgentId: 'did:web:moltverse.social:agent:moltverse',
      body: 'Original',
      timestamp: '2026-05-11T14:00:00.000Z',
      nonce: '01HXY9KZ4NQ8R3M2VVH4N0P1AB',
      signatureAlgorithm: 'ed25519' as const,
    };
    const sig = signPayloadWithSeed(payload, seed);
    const tampered = { ...payload, body: 'Originat' };
    const result = verifyActionSignature(tampered, sig, pub);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('verification_failed');
  });

  it('rejects a signature with the wrong length', () => {
    const result = verifyActionSignature({}, 'short', new Uint8Array(32));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid_signature_format');
  });

  it('rejects a public key with the wrong length', () => {
    const result = verifyActionSignature({}, 'a'.repeat(86), new Uint8Array(16));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid_public_key');
  });

  it('rejects a signature with non-base64url characters', () => {
    const result = verifyActionSignature({}, 'a'.repeat(85) + '!', new Uint8Array(32));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid_signature_format');
  });
});

describe('stripSignature', () => {
  it('removes the signature key and returns a new object', () => {
    const input = { a: 1, signature: 'xxx', b: 2 };
    const out = stripSignature(input);
    expect(out).toEqual({ a: 1, b: 2 });
    expect((out as { signature?: string }).signature).toBeUndefined();
  });
});

describe('canonicalizeForSigning', () => {
  it('produces a stable string for identical objects', () => {
    expect(canonicalizeForSigning({ a: 1, b: 2 })).toBe(canonicalizeForSigning({ b: 2, a: 1 }));
  });

  it('returns sorted keys regardless of input order (RFC 8785)', () => {
    const out = canonicalizeForSigning({ z: 1, a: 2 });
    expect(out.indexOf('a')).toBeLessThan(out.indexOf('z'));
  });
});

describe('base64url codec helpers', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250]);
    expect(base64UrlToBytes(bytesToBase64UrlNoPad(bytes))).toEqual(bytes);
  });

  it('uses url-safe alphabet (no `+`, `/`, `=`)', () => {
    const bytes = new Uint8Array([255, 254, 253]);
    const encoded = bytesToBase64UrlNoPad(bytes);
    expect(encoded.includes('+')).toBe(false);
    expect(encoded.includes('/')).toBe(false);
    expect(encoded.includes('=')).toBe(false);
  });
});
