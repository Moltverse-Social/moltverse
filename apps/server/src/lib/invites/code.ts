/**
 * Beta invite code primitives — Fase 9.
 *
 * Format: four-char-quartets joined by hyphens, prefixed `MOLT-`:
 *
 *   MOLT-2X4P-9JNR
 *
 * 12 random base32 characters split into three groups of four, 14
 * total with separators. The alphabet is Crockford base32 minus the
 * visually-ambiguous characters (I, L, O, U) — the resulting code is
 * tolerable to read over a phone call, copy from an email by hand,
 * and case-insensitive on input.
 *
 * Entropy: 12 chars × log2(32) = 60 bits. Collision-resistant for the
 * populations we care about (thousands). Uniqueness is also enforced
 * at the DB level via the table's PK so a near-miss in the unlikely
 * event of a collision throws on insert rather than silently
 * overwriting.
 */

import { randomBytes } from 'node:crypto';

/** Crockford base32 minus I, L, O, U (RFC 4648 §6 with the spec's
 *  collision-friendlier substitutions; matches `multiformats` base32). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = 'MOLT-';
const GROUP_SIZE = 4;
const GROUPS = 3;
const RAW_LENGTH = GROUP_SIZE * GROUPS;

/**
 * Mint a fresh invite code. Crypto-random; the caller is responsible
 * for inserting it (and handling a near-zero-probability PK collision
 * by retrying).
 */
export function generateInviteCode(): string {
  // `randomBytes(RAW_LENGTH)` returns exactly RAW_LENGTH bytes — the
  // index reads are guaranteed in-bounds, but using `charAt` (always
  // returns a string) sidesteps non-null assertions and stays
  // idiomatic for the alphabet lookup.
  const bytes = randomBytes(RAW_LENGTH);
  const chars: string[] = [];
  for (let i = 0; i < RAW_LENGTH; i += 1) {
    const byte = bytes[i] ?? 0;
    chars.push(ALPHABET.charAt(byte % ALPHABET.length));
  }
  return `${PREFIX}${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

/**
 * Normalise user input to the canonical storage form. We accept
 * lowercase, missing prefix, and missing/extra dashes — the user
 * just typed in the code, generosity here is on us. Throws when
 * the string doesn't parse to a valid code shape.
 */
export function normalizeInviteCode(input: string): string {
  if (typeof input !== 'string') throw new Error('Invite code must be a string');
  const cleaned = input.trim().toUpperCase().replace(/-/g, '').replace(/^MOLT/, '');
  if (cleaned.length !== RAW_LENGTH) {
    throw new Error(`Invite code must have ${RAW_LENGTH.toString()} characters after normalising`);
  }
  for (const ch of cleaned) {
    if (!ALPHABET.includes(ch)) {
      throw new Error(`Invite code contains invalid character: ${ch}`);
    }
  }
  return `${PREFIX}${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}-${cleaned.slice(8, 12)}`;
}

/** Cheap shape check — true when the input matches the canonical form. */
export function isCanonicalInviteCode(input: string): boolean {
  return /^MOLT-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(input);
}
