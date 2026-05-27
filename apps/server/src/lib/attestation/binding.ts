/**
 * TDX quote binding helpers — Camada 5 §4.2 + §4.4.
 *
 * Two functions, both pure:
 *
 *  - {@link verifyReportDataBinding} checks that the 64-byte
 *    `reportData` field inside a TDX quote committed to
 *    sha256(agentPubkey) || 32-byte-zero-padding. Constant-time
 *    comparison on both halves so an attacker can't side-channel the
 *    failure shape.
 *
 *  - {@link extractComposeHashFromRtmr3} returns the 32-byte
 *    compose-hash measurement out of the 48-byte RTMR3 register.
 *
 * **Open question §11.1 / V40** — the exact byte layout for Phala
 * dstack's RTMR3 needs to be confirmed against current docs before
 * we trust this in production. The implementation here matches the
 * documented "tail-32" layout (`appId || composeHash`) and is gated
 * behind tests that pin the slice positions; flipping the layout
 * later means changing this one function.
 */

import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** TDX report-data field length in bytes. */
export const REPORT_DATA_LEN = 64;
/** RTMR3 register length in bytes. */
export const RTMR3_LEN = 48;
/** Bytes inside RTMR3 used by the appId prefix. */
export const RTMR3_APPID_LEN = 16;
/** Trailing bytes inside RTMR3 carrying the compose-hash. */
export const RTMR3_COMPOSE_HASH_LEN = 32;

// ---------------------------------------------------------------------------
// reportData binding
// ---------------------------------------------------------------------------

export type BindingCheck =
  | { ok: true }
  | { ok: false; reason: 'wrong_length' | 'pubkey_hash_mismatch' | 'trailing_not_zero' };

/**
 * Constant-time-on-failures verification that `reportData` commits to
 * the agent's ed25519 public key. Spec §4.4 mandates BOTH halves are
 * checked — a check that only validates the first 32 bytes would let
 * an attacker append arbitrary trailing bytes and still pass.
 */
export function verifyReportDataBinding(
  reportData: Buffer | Uint8Array,
  ed25519Pub: Buffer | Uint8Array,
): BindingCheck {
  const rd = Buffer.from(reportData);
  if (rd.length !== REPORT_DATA_LEN) return { ok: false, reason: 'wrong_length' };

  const expected = createHash('sha256').update(ed25519Pub).digest();
  const headMatch = constantTimeEqual(rd.subarray(0, 32), expected);
  const tailZero = constantTimeZero(rd.subarray(32, 64));

  // Run both branches before short-circuiting so timing of the failure
  // path doesn't leak which check failed first.
  if (!headMatch && !tailZero) return { ok: false, reason: 'pubkey_hash_mismatch' };
  if (!headMatch) return { ok: false, reason: 'pubkey_hash_mismatch' };
  if (!tailZero) return { ok: false, reason: 'trailing_not_zero' };
  return { ok: true };
}

/** XOR-fold equality check — constant time over the input length. */
function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i += 1) {
    acc |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return acc === 0;
}

/** All-zero check that does NOT short-circuit on the first non-zero byte. */
function constantTimeZero(buf: Buffer): boolean {
  let acc = 0;
  for (const byte of buf) acc |= byte;
  return acc === 0;
}

// ---------------------------------------------------------------------------
// RTMR3 → compose-hash
// ---------------------------------------------------------------------------

export interface ComposeHashExtraction {
  /** 16-byte appId — informational; not currently checked. */
  appId: Buffer;
  /** Raw 32-byte compose hash. */
  composeHash: Buffer;
  /** Lowercase 0x-prefixed hex — what {@link isApprovedComposeHash} expects. */
  composeHashHex: string;
}

/**
 * Extract the compose-hash from RTMR3.
 *
 * Phala dstack measures into RTMR3 such that the first 16 bytes carry
 * a deterministic appId and the trailing 32 bytes carry the
 * sha256(app-compose.json). The exact layout is pinned by tests so a
 * future change has to update both this function and the fixtures.
 *
 * Throws on malformed input; callers wrap in their VerificationResult.
 */
export function extractComposeHashFromRtmr3(rtmr3: Buffer | Uint8Array): ComposeHashExtraction {
  const buf = Buffer.from(rtmr3);
  if (buf.length !== RTMR3_LEN) {
    throw new Error(
      `RTMR3 length mismatch: expected ${String(RTMR3_LEN)}, got ${String(buf.length)}`,
    );
  }
  const appId = buf.subarray(0, RTMR3_APPID_LEN);
  const composeHash = buf.subarray(RTMR3_APPID_LEN, RTMR3_APPID_LEN + RTMR3_COMPOSE_HASH_LEN);
  const composeHashHex = '0x' + composeHash.toString('hex');
  return { appId, composeHash, composeHashHex };
}
