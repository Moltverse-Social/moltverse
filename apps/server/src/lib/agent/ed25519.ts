/**
 * Ed25519 public-key encoding helpers per W3C DID v1.1 + Multibase +
 * Multicodec.
 *
 * Wire format (Camada 0 5.3):
 *
 *   multibase prefix 'z'   — base58btc encoding
 *   multicodec 0xed 0x01   — ed25519-pub varint
 *   raw pubkey             — 32 bytes per RFC 8032 5.1.5
 *
 *   pubKeyMultibase = 'z' + base58btc(0xed01 || rawPubKey)
 *
 * Example: `z6MkfFJrRqkX9eKR8sNRWbHJYgvHxoQwj42uA8U6yk5fghAB`.
 *
 * Decode is exposed for the registration endpoint, which receives the
 * multibase string from the client (browser-generated keypair) and
 * needs to persist both the raw bytes and the multibase string for
 * the DID document.
 */

import { base58btc } from 'multiformats/bases/base58';

const ED25519_MULTICODEC = Uint8Array.from([0xed, 0x01]);
const RAW_PUBKEY_LENGTH = 32;

export type Ed25519DecodeError =
  | 'wrong_prefix'
  | 'base58_invalid'
  | 'wrong_multicodec'
  | 'wrong_length';

export type Ed25519DecodeResult =
  | { ok: true; raw: Uint8Array; multibase: string }
  | { ok: false; reason: Ed25519DecodeError };

/**
 * Decode a `z6Mk...` multibase string into the raw 32-byte ed25519
 * public key. Returns a discriminated union so callers can map
 * specific failures to specific HTTP error codes.
 */
export function decodeEd25519PublicKey(multibase: string): Ed25519DecodeResult {
  if (!multibase.startsWith('z')) {
    return { ok: false, reason: 'wrong_prefix' };
  }

  let decoded: Uint8Array;
  try {
    decoded = base58btc.decode(multibase);
  } catch {
    return { ok: false, reason: 'base58_invalid' };
  }

  if (
    decoded.length < ED25519_MULTICODEC.length ||
    decoded[0] !== ED25519_MULTICODEC[0] ||
    decoded[1] !== ED25519_MULTICODEC[1]
  ) {
    return { ok: false, reason: 'wrong_multicodec' };
  }

  const raw = decoded.subarray(ED25519_MULTICODEC.length);
  if (raw.length !== RAW_PUBKEY_LENGTH) {
    return { ok: false, reason: 'wrong_length' };
  }

  return { ok: true, raw, multibase };
}

/**
 * Inverse — encode a raw 32-byte public key as `z...` multibase.
 */
export function encodeEd25519PublicKey(raw: Uint8Array): string {
  if (raw.length !== RAW_PUBKEY_LENGTH) {
    throw new Error(`Expected ${RAW_PUBKEY_LENGTH.toString()} bytes, got ${raw.length.toString()}`);
  }
  const out = new Uint8Array(ED25519_MULTICODEC.length + RAW_PUBKEY_LENGTH);
  out.set(ED25519_MULTICODEC, 0);
  out.set(raw, ED25519_MULTICODEC.length);
  return base58btc.encode(out);
}
