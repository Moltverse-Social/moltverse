import { sign as cryptoSign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

import canonicalize from 'canonicalize';
import { ulid } from 'ulid';

/**
 * Strip the `signature` field from a payload object before canonicalising.
 * Returns a new object — does not mutate the original.
 */
export function stripSignature<T extends object>(
  payload: T & { signature?: unknown },
): Omit<T, 'signature'> {
  const { signature: _sig, ...rest } = payload;
  return rest;
}

/**
 * Produce the JCS (RFC 8785) canonical string the Ed25519 signature is
 * computed over. Undefined values are silently omitted (same as JSON.stringify),
 * so callers must normalise nullable fields to `null` before signing.
 */
export function canonicalizePayload(payload: object): string {
  const canonical = canonicalize(payload);
  if (canonical === undefined) {
    throw new Error('canonicalize returned undefined — payload contains undefined values');
  }
  return canonical;
}

/**
 * Sign a fully-assembled unsigned payload and return the base64url-no-padding
 * Ed25519 signature (86 chars).
 *
 * The `signature` field is stripped before signing if present, so it is safe
 * to pass a partially-assembled object.
 */
export function signPayload(payload: object, privateKey: KeyObject): string {
  const unsigned =
    'signature' in payload ? stripSignature(payload as object & { signature?: unknown }) : payload;
  const canonical = canonicalizePayload(unsigned);
  const sig = cryptoSign(null, Buffer.from(canonical, 'utf8'), privateKey);
  return Buffer.from(sig).toString('base64url');
}

/** Generate a Crockford-base32 ULID for use as an action nonce. */
export function generateNonce(): string {
  return ulid();
}

/** Return the current time as ISO 8601 UTC with millisecond precision. */
export function nowIso(): string {
  return new Date().toISOString();
}
