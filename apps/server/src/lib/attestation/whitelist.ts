/**
 * Approved compose-hash whitelist — Camada 5 §3.2.
 *
 * The whitelist is the trust anchor for "this agent is running real
 * Moltverse code, built by Moltverse CI". A quote with a compose-hash
 * outside this list fails verification even when every other check
 * passes — the quote might be cryptographically sound but it attests
 * to code that isn't ours.
 *
 * Two sources, unioned at lookup time:
 *
 *  1. The in-tree {@link DEFAULT_APPROVED_HASHES} list — hand-curated,
 *     reviewable in PRs, ships inside the Docker image. Empty by
 *     design at boot; the operator populates this when the first
 *     reproducible build lands. Source of truth in dev/test.
 *  2. The DB-backed {@link ApprovedComposeHash} table — admin-curated
 *     via `/api/v1/admin/compose-hashes` (route deferred to Fase 10-12).
 *     Lets ops promote a new hash to the whitelist without a redeploy.
 *     Loaded via {@link loadActiveComposeHashes} with a 5-minute TTL
 *     cache so the attestation verifier doesn't hit the DB once per
 *     quote.
 *
 * Three lifecycle states per entry:
 *
 *  - **Active**       — `deprecatedAt === null`, `expiresAt === null` (or future)
 *  - **Deprecated**   — `deprecatedAt` set; quotes still accepted for 90 days
 *                       after that timestamp so dev gets a clear window to
 *                       upgrade. Past the grace, the hash fails.
 *  - **Expired**      — `expiresAt` reached; rejected immediately.
 *
 * The pure parts ({@link isApprovedComposeHash}, {@link listApprovedHashes})
 * take a `list` option so callers can keep tests deterministic. The
 * DB loader is async and isolated to {@link loadActiveComposeHashes}.
 */

import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export interface ApprovedHashEntry {
  /** Lowercase 0x-prefixed sha256 (66 chars) of the canonical app-compose.json. */
  composeHash: string;
  /** Image digest the entry pins to. Recorded for audit; not checked at
   *  attestation time (the compose-hash already encodes it transitively). */
  imageDigest: string;
  /** Human-readable ref. Surfaced on the public attestation response. */
  imageRef: string;
  /** Semver version of the agent image. */
  version: string;
  /** ISO 8601. When this entry was added to the whitelist. */
  approvedAt: string;
  /** ISO 8601 or null. Quotes continue to verify for 90 days past this. */
  deprecatedAt: string | null;
  /** ISO 8601 or null. Hard cutoff — independent of deprecation grace. */
  expiresAt: string | null;
}

/** Grace period after deprecation during which quotes still verify. */
export const DEPRECATION_GRACE_DAYS = 90;

// ---------------------------------------------------------------------------
// In-tree default list.
//
// Empty by design at boot — the operator (or release tooling) populates
// this when the first reproducible build lands. A genuinely empty list
// fails every quote, which is the right secure default during initial
// rollout. Tests pass `customList` to drive every branch.
// ---------------------------------------------------------------------------

export const DEFAULT_APPROVED_HASHES: readonly ApprovedHashEntry[] = Object.freeze([]);

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export type ApprovalCheck =
  | { approved: true; entry: ApprovedHashEntry }
  | {
      approved: false;
      reason: 'not_in_list' | 'deprecated_grace_expired' | 'past_hard_expiry' | 'malformed_hash';
    };

export interface CheckOptions {
  /** Override list for tests. */
  list?: readonly ApprovedHashEntry[];
  /** Test seam. */
  now?: Date;
}

/** Validates the compose-hash format. Hash arrives from RTMR3 as raw
 *  bytes — we expect lowercase 0x-prefixed 32-byte hex (66 chars). */
function isWellFormedHash(hex: string): boolean {
  return /^0x[0-9a-f]{64}$/.test(hex);
}

/**
 * Resolve a compose-hash against the whitelist. Pure.
 *
 * Returns a discriminated union; callers map to HTTP / attestation
 * status codes (we don't want this module to know about the wire).
 */
export function isApprovedComposeHash(
  composeHashHex: string,
  options: CheckOptions = {},
): ApprovalCheck {
  if (!isWellFormedHash(composeHashHex)) {
    return { approved: false, reason: 'malformed_hash' };
  }
  const list = options.list ?? DEFAULT_APPROVED_HASHES;
  const now = options.now ?? new Date();
  const entry = list.find((h) => h.composeHash === composeHashHex);
  if (entry === undefined) return { approved: false, reason: 'not_in_list' };

  if (entry.expiresAt !== null) {
    const expiry = new Date(entry.expiresAt);
    if (now.getTime() > expiry.getTime()) {
      return { approved: false, reason: 'past_hard_expiry' };
    }
  }

  if (entry.deprecatedAt !== null) {
    const dep = new Date(entry.deprecatedAt);
    const graceEnd = new Date(dep.getTime() + DEPRECATION_GRACE_DAYS * 86_400_000);
    if (now.getTime() > graceEnd.getTime()) {
      return { approved: false, reason: 'deprecated_grace_expired' };
    }
  }

  return { approved: true, entry };
}

// ---------------------------------------------------------------------------
// Read-only listing for the public endpoint.
// ---------------------------------------------------------------------------

export interface ListedHashEntry extends ApprovedHashEntry {
  /** Whether the entry is currently honoured (could be true even past
   *  deprecation if still within grace). Lets the client visualise
   *  "deprecated but still valid" without recomputing the grace math. */
  effectivelyActive: boolean;
}

export function listApprovedHashes(options: CheckOptions = {}): ListedHashEntry[] {
  const list = options.list ?? DEFAULT_APPROVED_HASHES;
  const now = options.now ?? new Date();
  return list.map((entry) => {
    const check = isApprovedComposeHash(entry.composeHash, { list: [entry], now });
    return { ...entry, effectivelyActive: check.approved };
  });
}

// ---------------------------------------------------------------------------
// DB-backed source — admin-curated compose hashes.
//
// The TTL cache balances two needs: keep the attestation verifier fast
// (no DB roundtrip per quote — production tick can process many quotes
// per second) and let admin actions take effect quickly. 5 minutes is
// a reasonable upper bound on staleness; admin compose-hash mutations
// also call {@link invalidateWhitelistCache} so a freshly added hash
// is live within one verifier tick.
// ---------------------------------------------------------------------------

const WHITELIST_CACHE_TTL_MS = 5 * 60 * 1_000;

let whitelistCache: { readAt: number; entries: readonly ApprovedHashEntry[] } | null = null;

/**
 * Load the merged whitelist (in-tree defaults + admin-curated DB rows).
 * Cached for {@link WHITELIST_CACHE_TTL_MS}. Pass `bypassCache: true`
 * to force a fresh read (admin tooling, debugging).
 *
 * `ApprovedComposeHash` doesn't store `imageDigest` / `version` (admin
 * UX captures only `label` + `notes`), so the synthesized entry has
 * empty strings for those fields. `isApprovedComposeHash` never reads
 * them — they exist for audit display only.
 */
export async function loadActiveComposeHashes(
  prisma: Pick<PrismaClient, 'approvedComposeHash'>,
  options: { now?: Date; bypassCache?: boolean } = {},
): Promise<readonly ApprovedHashEntry[]> {
  const now = options.now ?? new Date();
  if (
    options.bypassCache !== true &&
    whitelistCache !== null &&
    now.getTime() - whitelistCache.readAt < WHITELIST_CACHE_TTL_MS
  ) {
    return whitelistCache.entries;
  }

  const rows = await prisma.approvedComposeHash.findMany({
    select: {
      composeHash: true,
      label: true,
      addedAt: true,
      deprecatedAt: true,
    },
  });

  const fromDb: ApprovedHashEntry[] = rows.map((r) => ({
    composeHash: r.composeHash,
    imageDigest: '',
    imageRef: r.label,
    version: '',
    approvedAt: r.addedAt.toISOString(),
    deprecatedAt: r.deprecatedAt?.toISOString() ?? null,
    expiresAt: null,
  }));

  const merged = [...DEFAULT_APPROVED_HASHES, ...fromDb];
  whitelistCache = { readAt: now.getTime(), entries: merged };
  return merged;
}

/**
 * Drop the cache. Called by the admin compose-hash routes (Fase 10-12)
 * after a mutation so the verifier picks up the change on the next
 * tick instead of waiting up to {@link WHITELIST_CACHE_TTL_MS}.
 */
export function invalidateWhitelistCache(): void {
  whitelistCache = null;
}

/** @internal Test seam. */
export function _peekWhitelistCacheForTests(): {
  readAt: number;
  entries: readonly ApprovedHashEntry[];
} | null {
  return whitelistCache;
}
