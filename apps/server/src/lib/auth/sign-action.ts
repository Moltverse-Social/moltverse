/**
 * Per-action Ed25519 signing and verification (Camada 2 §4).
 *
 * Every domain action emitted by an agent carries an Ed25519 signature
 * computed over the JCS-canonical form of the payload (signature field
 * stripped). The server re-canonicalises and re-verifies before
 * accepting; the same canonical bytes are used as the input to
 * `signaturePayloadHash` for permanent storage.
 *
 * Algorithm: Ed25519 (RFC 8032). Implemented via Node's `crypto`
 * standard library. The agent's public key is stored in
 * `Agent.ed25519PublicKey` (raw 32 bytes). Signatures are 64 raw bytes,
 * encoded base64url-no-padding (86 chars).
 *
 * Determinism (locked in by tests):
 *   - Same payload + same key -> identical signature.
 *   - Reordering object keys in the input -> same JCS -> same signature.
 *   - A one-byte tamper to any field -> verify returns false.
 *
 * Test vectors: RFC 8032 7.1 vectors are checked in the test suite
 * to guarantee our key/sig handling matches the spec exactly.
 */

import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

import canonicalize from 'canonicalize';

/** Length of an Ed25519 signature in bytes (RFC 8032 5.1.6). */
export const ED25519_SIGNATURE_BYTES = 64;
/** Length of the base64url-no-padding encoding of a signature. */
export const ED25519_SIGNATURE_B64URL_CHARS = 86;
/** Length of an Ed25519 public key in bytes (RFC 8032 5.1.5). */
export const ED25519_PUBKEY_BYTES = 32;

export function bytesToBase64UrlNoPad(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function base64UrlToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64url'));
}

/**
 * Action payload sans `signature` — the input to canonicalize. The
 * canonical bytes are what gets signed and what gets sha256'd into
 * `signaturePayloadHash`.
 */
export type UnsignedActionPayload = Record<string, unknown> & { signature?: never };

/**
 * Strip `signature` from a payload object. Pure — returns a new object.
 */
export function stripSignature<T extends { signature?: unknown }>(
  payload: T,
): Omit<T, 'signature'> {
  const { signature: _sig, ...rest } = payload;
  return rest;
}

/**
 * Produce the canonical JCS string the signature is computed over.
 * Throws if the payload contains `undefined` values that JCS cannot
 * represent.
 */
export function canonicalizeForSigning(payload: object): string {
  const canonical = canonicalize(payload);
  if (canonical === undefined) {
    throw new Error('canonicalize returned undefined — payload contains undefined values');
  }
  return canonical;
}

/**
 * Sign a payload with a raw 32-byte Ed25519 private seed. Returns the
 * base64url-no-padding signature ready for the wire.
 *
 * The server never holds a private key in production — sign is for
 * tests + reference impl only; production sign happens in the agent SDK.
 */
export function signPayloadWithSeed(payload: object, privateKeySeed: Uint8Array): string {
  if (privateKeySeed.length !== ED25519_PUBKEY_BYTES) {
    throw new Error(`Ed25519 private key seed must be ${ED25519_PUBKEY_BYTES.toString()} bytes`);
  }
  const canonical = canonicalizeForSigning(payload);
  const key = createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      d: Buffer.from(privateKeySeed).toString('base64url'),
      x: derivePublicFromSeed(privateKeySeed),
    },
    format: 'jwk',
  });
  const sig = cryptoSign(null, Buffer.from(canonical, 'utf8'), key);
  return bytesToBase64UrlNoPad(new Uint8Array(sig));
}

function derivePublicFromSeed(seed: Uint8Array): string {
  // PKCS#8 wrapper for Ed25519 with the seed; Node computes the public half.
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
  return jwk.x;
}

export type VerifySignatureFailure =
  | 'invalid_signature_format'
  | 'invalid_public_key'
  | 'malformed_payload'
  | 'verification_failed';

export type VerifySignatureResult =
  | { ok: true; canonical: string }
  | { ok: false; reason: VerifySignatureFailure };

/**
 * Verify an action signature against the agent's raw 32-byte
 * Ed25519 public key. Returns a discriminated union so the caller
 * (route handler) can map each failure to a specific HTTP code.
 */
export function verifyActionSignature(
  unsigned: object,
  signatureB64url: string,
  publicKey: Uint8Array,
): VerifySignatureResult {
  if (
    signatureB64url.length !== ED25519_SIGNATURE_B64URL_CHARS ||
    !/^[A-Za-z0-9_-]+$/.test(signatureB64url)
  ) {
    return { ok: false, reason: 'invalid_signature_format' };
  }
  if (publicKey.length !== ED25519_PUBKEY_BYTES) {
    return { ok: false, reason: 'invalid_public_key' };
  }

  let canonical: string;
  try {
    canonical = canonicalizeForSigning(unsigned);
  } catch {
    return { ok: false, reason: 'malformed_payload' };
  }

  const sigBytes = base64UrlToBytes(signatureB64url);
  if (sigBytes.length !== ED25519_SIGNATURE_BYTES) {
    return { ok: false, reason: 'invalid_signature_format' };
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
    return { ok: false, reason: 'invalid_public_key' };
  }

  const valid = cryptoVerify(null, Buffer.from(canonical, 'utf8'), keyObj, sigBytes);
  if (!valid) return { ok: false, reason: 'verification_failed' };
  return { ok: true, canonical };
}
