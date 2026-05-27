/**
 * Canonical AgentConfig hashing — Camada 1 §4.
 *
 * Two-step pipeline:
 *
 *   1. {@link buildCanonicalConfig} normalises the raw input — Unicode
 *      NFC for free-text strings, lexicographic sort for arrays whose
 *      semantics are order-independent (action types, knowledge areas,
 *      tone descriptors, template mixins), null vs absent disambiguation.
 *
 *   2. {@link hashCanonicalConfig} serialises with RFC 8785 JCS and
 *      hashes with SHA-256, producing `sha256:<64-hex>` strings that
 *      match the `AgentConfig.configHash` column shape.
 *
 * Determinism guarantees (locked in by tests):
 *   - Same input -> same hash, across N iterations.
 *   - Input arrays in any order -> same hash.
 *   - NFC ↔ NFD on input -> same hash.
 *   - Whitespace differences inside `systemPrompt` / `personality` ->
 *     DIFFERENT hashes (significant by spec; not trimmed).
 *   - Numeric encoding follows ECMA-404 / RFC 8785 §3.2.2.
 */

import { createHash } from 'node:crypto';

import type { ActionType } from '@prisma/client';
import canonicalize from 'canonicalize';

/**
 * Input shape for canonicalisation. Mirrors the AgentConfig DB row but
 * accepts the optional fields as `undefined` or absent — the canonical
 * form will always normalise them to `null`.
 */
export interface AgentConfigInput {
  systemPrompt: string;
  personality: string;
  declaredModel: string;
  declaredModelVersion?: string | null;
  cycleIntervalMs: number;
  allowedActionTypes: readonly ActionType[];
  knowledgeAreas?: readonly string[];
  toneDescriptors?: readonly string[];
  personalityTemplate?: string | null;
  personalityTemplateMixins?: readonly string[];
}

/**
 * Output of {@link buildCanonicalConfig}. Keys are in alphabetic order
 * — JCS will preserve this when serialising, so the wire format is
 * predictable across implementations.
 */
export interface CanonicalConfig {
  allowedActionTypes: ActionType[];
  cycleIntervalMs: number;
  declaredModel: string;
  declaredModelVersion: string | null;
  knowledgeAreas: string[];
  personality: string;
  personalityTemplate: string | null;
  personalityTemplateMixins: string[];
  systemPrompt: string;
  toneDescriptors: string[];
}

export interface CanonicalHash {
  /** `sha256:<64-hex>`. */
  hash: string;
  /** Byte length of the canonical JSON. */
  bytes: number;
}

function nfc(s: string): string {
  return s.normalize('NFC');
}

function sortedNfc(xs: readonly string[]): string[] {
  return [...xs].map(nfc).sort();
}

/**
 * Normalise an `AgentConfigInput` into the canonical shape ready for
 * JCS serialisation. Pure — no I/O.
 *
 * Sorting: JCS does NOT reorder array elements (RFC 8785 §3.2.3), so
 * arrays whose semantics are unordered must be sorted by the caller
 * before serialisation. We sort all four such arrays here.
 *
 * NFC: applied to every user-controlled string field. Without
 * normalisation a "cafe" written as `c-a-f-e + combining-acute` (NFD)
 * would hash differently from the precomposed form (NFC), even though
 * both render identically.
 *
 * Null vs absent: callers may pass `undefined`; we coerce to `null` so
 * the canonical form has exactly the documented set of keys.
 */
export function buildCanonicalConfig(input: AgentConfigInput): CanonicalConfig {
  return {
    allowedActionTypes: [...input.allowedActionTypes].sort(),
    cycleIntervalMs: input.cycleIntervalMs,
    declaredModel: input.declaredModel,
    declaredModelVersion: input.declaredModelVersion ?? null,
    knowledgeAreas: sortedNfc(input.knowledgeAreas ?? []),
    personality: nfc(input.personality),
    personalityTemplate: input.personalityTemplate ?? null,
    personalityTemplateMixins: sortedNfc(input.personalityTemplateMixins ?? []),
    systemPrompt: nfc(input.systemPrompt),
    toneDescriptors: sortedNfc(input.toneDescriptors ?? []),
  };
}

/**
 * Compute the canonical JCS bytes and SHA-256 of a {@link CanonicalConfig}.
 *
 * The `canonicalize` npm package implements RFC 8785 exactly; we hash
 * the UTF-8 encoding of its output. The byte count is reported so the
 * caller can persist it alongside the hash for storage accounting.
 */
export function hashCanonicalConfig(canonical: CanonicalConfig): CanonicalHash {
  const jcs = canonicalize(canonical);
  if (jcs === undefined) {
    throw new Error('JCS canonicalize returned undefined — input contained undefined values');
  }
  const bytes = Buffer.byteLength(jcs, 'utf8');
  const digest = createHash('sha256').update(jcs, 'utf8').digest('hex');
  return { hash: `sha256:${digest}`, bytes };
}

/**
 * One-shot helper for callers that don't need the canonical object
 * separately. Equivalent to `hashCanonicalConfig(buildCanonicalConfig(input))`.
 */
export function hashAgentConfig(input: AgentConfigInput): CanonicalHash {
  return hashCanonicalConfig(buildCanonicalConfig(input));
}

/**
 * Internal — exposed for test vectors that need to inspect the raw
 * JCS string rather than just the hash.
 *
 * @internal
 */
export function _canonicalizeForTests(canonical: CanonicalConfig): string {
  const jcs = canonicalize(canonical);
  if (jcs === undefined) throw new Error('canonicalize returned undefined');
  return jcs;
}
