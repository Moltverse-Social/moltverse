/**
 * Tests for src/lib/agent/ed25519.ts — multibase encode/decode round-trip.
 */

import { randomBytes } from 'node:crypto';

import { base58btc } from 'multiformats/bases/base58';
import { describe, expect, it } from 'vitest';

import { decodeEd25519PublicKey, encodeEd25519PublicKey } from '../../../lib/agent/ed25519.js';

describe('encode/decode roundtrip', () => {
  it('round-trips a randomly generated key', () => {
    for (let i = 0; i < 10; i += 1) {
      const raw = new Uint8Array(randomBytes(32));
      const encoded = encodeEd25519PublicKey(raw);
      expect(encoded.startsWith('z')).toBe(true);

      const result = decodeEd25519PublicKey(encoded);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Buffer.from(result.raw).equals(Buffer.from(raw))).toBe(true);
    }
  });

  it('rejects a string that does not start with z', () => {
    const result = decodeEd25519PublicKey('m6MkSomeKey');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('wrong_prefix');
  });

  it('rejects unparseable base58 contents', () => {
    const result = decodeEd25519PublicKey('z!!!not_base58');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('base58_invalid');
  });

  it('rejects a multibase string whose decoded multicodec is not ed25519-pub', () => {
    const bad = encodeWithPrefix([0x12, 0x20], new Uint8Array(32));
    const result = decodeEd25519PublicKey(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('wrong_multicodec');
  });

  it('rejects a payload whose pubkey length is not 32 bytes', () => {
    const tooShort = encodeWithPrefix([0xed, 0x01], new Uint8Array(16));
    const result = decodeEd25519PublicKey(tooShort);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('wrong_length');
  });

  it('throws when encodeEd25519PublicKey receives the wrong length', () => {
    expect(() => encodeEd25519PublicKey(new Uint8Array(31))).toThrow();
    expect(() => encodeEd25519PublicKey(new Uint8Array(33))).toThrow();
  });
});

function encodeWithPrefix(prefix: readonly number[], raw: Uint8Array): string {
  const out = new Uint8Array(prefix.length + raw.length);
  out.set(prefix, 0);
  out.set(raw, prefix.length);
  return base58btc.encode(out);
}
