/**
 * Agent handle validation, normalization, and availability checks.
 *
 * Format (Camada 0 §4.1):
 *   ASCII lowercase, regex `^[a-z][a-z0-9_-]{2,29}$`.
 *
 * Layers of rejection:
 *   1. Format — wrong charset / length / leading char.
 *   2. Reserved — present in `RESERVED_HANDLES`.
 *   3. Taken — already in `agents.handle` (unique).
 *
 * Suggestions: when a requested handle is taken, we return up to N
 * variants that share the root but resolve to free rows. Generation
 * is deterministic given the input — no randomness — so the same
 * request always sees the same list.
 */

import { prisma } from '../prisma.js';

import { isReservedHandle } from './reserved-handles.js';

const HANDLE_REGEX = /^[a-z][a-z0-9_-]{2,29}$/;

export type HandleCheckResult =
  | { available: true; normalized: string }
  | { available: false; normalized: string; reason: HandleRejection; suggestions: string[] };

export type HandleRejection = 'format' | 'reserved' | 'taken';

/**
 * Lowercase + trim. The handle is stored lowercase so two registrations
 * differing only in case collide on the unique index. We normalize on
 * the way in so the caller never has to.
 */
export function normalizeHandle(input: string): string {
  return input.trim().toLowerCase();
}

/** Pure format check — runs against the normalized handle. */
export function isValidHandleFormat(normalized: string): boolean {
  return HANDLE_REGEX.test(normalized);
}

/**
 * Generate a deterministic list of suggestion variants. We only emit
 * candidates that pass the format regex (so callers can blindly check
 * availability without re-validating).
 */
export function buildSuggestions(normalized: string, limit = 5): string[] {
  const root = normalized.slice(0, 26); // leave room for suffixes
  const candidates: string[] = [];
  const seen = new Set<string>([normalized]);

  // Numeric suffixes — the most ergonomic fallback for typical conflicts.
  for (let i = 1; i <= 9 && candidates.length < limit; i += 1) {
    const candidate = `${root}${i.toString()}`;
    if (isValidHandleFormat(candidate) && !seen.has(candidate)) {
      candidates.push(candidate);
      seen.add(candidate);
    }
  }

  // The-{root} prefix — only when there's room and the leading char rule allows it.
  const themed = `the-${root}`;
  if (isValidHandleFormat(themed) && !seen.has(themed) && candidates.length < limit) {
    candidates.push(themed);
    seen.add(themed);
  }

  // {root}-bot — common AI-handle convention.
  const bot = `${root}-bot`;
  if (isValidHandleFormat(bot) && !seen.has(bot) && candidates.length < limit) {
    candidates.push(bot);
    seen.add(bot);
  }

  return candidates;
}

/**
 * Full availability check — runs all three layers in order and
 * returns the first failure (with suggestions on `taken`).
 */
export async function checkHandleAvailability(input: string): Promise<HandleCheckResult> {
  const normalized = normalizeHandle(input);

  if (!isValidHandleFormat(normalized)) {
    return {
      available: false,
      normalized,
      reason: 'format',
      suggestions: [],
    };
  }

  if (isReservedHandle(normalized)) {
    return {
      available: false,
      normalized,
      reason: 'reserved',
      suggestions: buildSuggestions(normalized),
    };
  }

  const existing = await prisma.agent.findUnique({
    where: { handle: normalized },
    select: { id: true },
  });
  if (existing !== null) {
    return {
      available: false,
      normalized,
      reason: 'taken',
      suggestions: await filterAvailableSuggestions(buildSuggestions(normalized)),
    };
  }

  return { available: true, normalized };
}

/**
 * Internal — given a list of candidate handles, return only those
 * that are not reserved AND not in `agents.handle`. Used when
 * building the suggestion list for a 'taken' response.
 */
async function filterAvailableSuggestions(candidates: string[]): Promise<string[]> {
  if (candidates.length === 0) return [];

  const filtered = candidates.filter((c) => !isReservedHandle(c));
  if (filtered.length === 0) return [];

  const taken = await prisma.agent.findMany({
    where: { handle: { in: filtered } },
    select: { handle: true },
  });
  const takenSet = new Set(taken.map((row) => row.handle));
  return filtered.filter((c) => !takenSet.has(c));
}
