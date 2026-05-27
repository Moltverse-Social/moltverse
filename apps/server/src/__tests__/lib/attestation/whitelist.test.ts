/**
 * Tests for src/lib/attestation/whitelist.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEPRECATION_GRACE_DAYS,
  invalidateWhitelistCache,
  isApprovedComposeHash,
  listApprovedHashes,
  loadActiveComposeHashes,
  _peekWhitelistCacheForTests,
  type ApprovedHashEntry,
} from '../../../lib/attestation/whitelist.js';

const NOW = new Date('2026-05-12T12:00:00Z');
const MS_DAY = 86_400_000;

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * MS_DAY).toISOString();
}

function daysAhead(n: number): string {
  return new Date(NOW.getTime() + n * MS_DAY).toISOString();
}

const ACTIVE: ApprovedHashEntry = {
  composeHash: '0x' + 'a'.repeat(64),
  imageDigest: 'sha256:abcdef',
  imageRef: 'ghcr.io/moltverse/agent:1.0.0',
  version: '1.0.0',
  approvedAt: daysAgo(30),
  deprecatedAt: null,
  expiresAt: null,
};

const DEPRECATED_IN_GRACE: ApprovedHashEntry = {
  ...ACTIVE,
  composeHash: '0x' + 'b'.repeat(64),
  deprecatedAt: daysAgo(30),
};

const DEPRECATED_PAST_GRACE: ApprovedHashEntry = {
  ...ACTIVE,
  composeHash: '0x' + 'c'.repeat(64),
  deprecatedAt: daysAgo(DEPRECATION_GRACE_DAYS + 1),
};

const HARD_EXPIRED: ApprovedHashEntry = {
  ...ACTIVE,
  composeHash: '0x' + 'd'.repeat(64),
  expiresAt: daysAgo(1),
};

// ---------------------------------------------------------------------------
// isApprovedComposeHash
// ---------------------------------------------------------------------------

describe('isApprovedComposeHash', () => {
  it('rejects malformed hash strings (missing 0x, wrong length, uppercase)', () => {
    expect(isApprovedComposeHash('not-hex')).toEqual({ approved: false, reason: 'malformed_hash' });
    expect(isApprovedComposeHash('0xZZZ')).toEqual({ approved: false, reason: 'malformed_hash' });
    expect(isApprovedComposeHash('0x' + 'A'.repeat(64))).toEqual({
      approved: false,
      reason: 'malformed_hash',
    });
    expect(isApprovedComposeHash('0x' + 'a'.repeat(63))).toEqual({
      approved: false,
      reason: 'malformed_hash',
    });
  });

  it('rejects an unknown hash with reason=not_in_list', () => {
    const r = isApprovedComposeHash('0x' + 'e'.repeat(64), { list: [ACTIVE], now: NOW });
    expect(r).toEqual({ approved: false, reason: 'not_in_list' });
  });

  it('approves an active entry', () => {
    const r = isApprovedComposeHash(ACTIVE.composeHash, { list: [ACTIVE], now: NOW });
    expect(r.approved).toBe(true);
    if (!r.approved) return;
    expect(r.entry.version).toBe('1.0.0');
  });

  it('keeps deprecated entries valid within the grace window', () => {
    const r = isApprovedComposeHash(DEPRECATED_IN_GRACE.composeHash, {
      list: [DEPRECATED_IN_GRACE],
      now: NOW,
    });
    expect(r.approved).toBe(true);
  });

  it('rejects deprecated entries past the grace window', () => {
    const r = isApprovedComposeHash(DEPRECATED_PAST_GRACE.composeHash, {
      list: [DEPRECATED_PAST_GRACE],
      now: NOW,
    });
    expect(r).toEqual({ approved: false, reason: 'deprecated_grace_expired' });
  });

  it('rejects entries past hard expiry even if not deprecated', () => {
    const r = isApprovedComposeHash(HARD_EXPIRED.composeHash, { list: [HARD_EXPIRED], now: NOW });
    expect(r).toEqual({ approved: false, reason: 'past_hard_expiry' });
  });

  it('hard expiry trumps deprecation grace', () => {
    const both: ApprovedHashEntry = {
      ...ACTIVE,
      composeHash: '0x' + 'f'.repeat(64),
      deprecatedAt: daysAgo(5),
      expiresAt: daysAgo(1),
    };
    const r = isApprovedComposeHash(both.composeHash, { list: [both], now: NOW });
    expect(r).toEqual({ approved: false, reason: 'past_hard_expiry' });
  });

  it('honours future expiry as still active', () => {
    const future: ApprovedHashEntry = {
      ...ACTIVE,
      composeHash: '0x' + '9'.repeat(64),
      expiresAt: daysAhead(30),
    };
    expect(isApprovedComposeHash(future.composeHash, { list: [future], now: NOW }).approved).toBe(
      true,
    );
  });

  it('default whitelist is empty — every hash rejects (secure boot)', () => {
    expect(isApprovedComposeHash('0x' + 'a'.repeat(64))).toEqual({
      approved: false,
      reason: 'not_in_list',
    });
  });
});

// ---------------------------------------------------------------------------
// listApprovedHashes
// ---------------------------------------------------------------------------

describe('listApprovedHashes', () => {
  it('annotates each entry with effectivelyActive', () => {
    const list = listApprovedHashes({
      list: [ACTIVE, DEPRECATED_IN_GRACE, DEPRECATED_PAST_GRACE, HARD_EXPIRED],
      now: NOW,
    });
    expect(list[0]?.effectivelyActive).toBe(true);
    expect(list[1]?.effectivelyActive).toBe(true);
    expect(list[2]?.effectivelyActive).toBe(false);
    expect(list[3]?.effectivelyActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadActiveComposeHashes (DB source)
// ---------------------------------------------------------------------------

interface FakeRow {
  composeHash: string;
  label: string;
  addedAt: Date;
  deprecatedAt: Date | null;
}

function fakePrismaWithRows(rows: FakeRow[]): {
  findMany: ReturnType<typeof vi.fn>;
  prisma: { approvedComposeHash: { findMany: ReturnType<typeof vi.fn> } };
} {
  const findMany = vi.fn().mockResolvedValue(rows);
  return {
    findMany,
    prisma: { approvedComposeHash: { findMany } },
  };
}

describe('loadActiveComposeHashes', () => {
  beforeEach(() => {
    invalidateWhitelistCache();
  });

  it('reads admin-curated rows, maps them onto ApprovedHashEntry, unions with defaults', async () => {
    const dbHash = '0x' + 'e'.repeat(64);
    const { prisma } = fakePrismaWithRows([
      {
        composeHash: dbHash,
        label: 'phala 1.4.0',
        addedAt: new Date('2026-05-10T00:00:00Z'),
        deprecatedAt: null,
      },
    ]);

    const list = await loadActiveComposeHashes(prisma as never, { now: NOW });
    expect(list).toHaveLength(1); // DEFAULT_APPROVED_HASHES is empty at boot
    expect(list[0]?.composeHash).toBe(dbHash);
    expect(list[0]?.imageRef).toBe('phala 1.4.0');
    expect(list[0]?.deprecatedAt).toBeNull();
  });

  it('preserves deprecatedAt so isApprovedComposeHash applies the 90d grace', async () => {
    const dbHash = '0x' + 'f'.repeat(64);
    const { prisma } = fakePrismaWithRows([
      {
        composeHash: dbHash,
        label: 'phala 1.3.0',
        addedAt: new Date(NOW.getTime() - 120 * MS_DAY),
        deprecatedAt: new Date(NOW.getTime() - 10 * MS_DAY),
      },
    ]);

    const list = await loadActiveComposeHashes(prisma as never, { now: NOW });
    const check = isApprovedComposeHash(dbHash, { list, now: NOW });
    expect(check.approved).toBe(true);

    const pastGrace = isApprovedComposeHash(dbHash, {
      list,
      now: new Date(NOW.getTime() + (DEPRECATION_GRACE_DAYS + 1) * MS_DAY),
    });
    expect(pastGrace.approved).toBe(false);
  });

  it('caches the result so the second call within TTL does not re-query', async () => {
    const dbHash = '0x' + '1'.repeat(64);
    const { findMany, prisma } = fakePrismaWithRows([
      {
        composeHash: dbHash,
        label: 'phala 1.4.0',
        addedAt: new Date(NOW),
        deprecatedAt: null,
      },
    ]);

    await loadActiveComposeHashes(prisma as never, { now: NOW });
    await loadActiveComposeHashes(prisma as never, { now: new Date(NOW.getTime() + 60_000) });
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('re-queries after the TTL expires', async () => {
    const dbHash = '0x' + '2'.repeat(64);
    const { findMany, prisma } = fakePrismaWithRows([
      {
        composeHash: dbHash,
        label: 'phala 1.4.0',
        addedAt: new Date(NOW),
        deprecatedAt: null,
      },
    ]);

    await loadActiveComposeHashes(prisma as never, { now: NOW });
    // 6 minutes later — TTL is 5 minutes.
    await loadActiveComposeHashes(prisma as never, { now: new Date(NOW.getTime() + 6 * 60_000) });
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('invalidateWhitelistCache forces the next call to re-query', async () => {
    const dbHash = '0x' + '3'.repeat(64);
    const { findMany, prisma } = fakePrismaWithRows([
      {
        composeHash: dbHash,
        label: 'phala 1.4.0',
        addedAt: new Date(NOW),
        deprecatedAt: null,
      },
    ]);

    await loadActiveComposeHashes(prisma as never, { now: NOW });
    expect(_peekWhitelistCacheForTests()).not.toBeNull();

    invalidateWhitelistCache();
    expect(_peekWhitelistCacheForTests()).toBeNull();

    await loadActiveComposeHashes(prisma as never, { now: new Date(NOW.getTime() + 1_000) });
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('bypassCache: true skips the cache without dropping it', async () => {
    const dbHash = '0x' + '4'.repeat(64);
    const { findMany, prisma } = fakePrismaWithRows([
      {
        composeHash: dbHash,
        label: 'phala 1.4.0',
        addedAt: new Date(NOW),
        deprecatedAt: null,
      },
    ]);

    await loadActiveComposeHashes(prisma as never, { now: NOW });
    await loadActiveComposeHashes(prisma as never, { now: NOW, bypassCache: true });
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
