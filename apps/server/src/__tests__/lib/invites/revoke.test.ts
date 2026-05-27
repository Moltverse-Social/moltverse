/**
 * Tests for src/lib/invites/revoke.ts.
 *
 * Fake Prisma — asserts the discriminated result shape, the update
 * predicate (race-safe — match only `redeemedAt=null AND revokedAt=null`),
 * and the diagnostic re-read that explains a zero-row update.
 */

import { describe, expect, it, vi } from 'vitest';

import { revokeInvite, type RevokeInviteResult } from '../../../lib/invites/revoke.js';

const NOW = new Date('2026-05-12T12:00:00Z');

function fakePrisma(opts: {
  updateCount: number;
  redeemedAt?: Date | null;
  revokedAt?: Date | null;
  rowExists?: boolean;
}): {
  prisma: unknown;
  spies: {
    updateMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
} {
  const updateMany = vi.fn().mockResolvedValue({ count: opts.updateCount });
  const findUnique = vi.fn().mockResolvedValue(
    opts.rowExists === false
      ? null
      : { redeemedAt: opts.redeemedAt ?? null, revokedAt: opts.revokedAt ?? null },
  );
  return {
    prisma: { inviteCode: { updateMany, findUnique } },
    spies: { updateMany, findUnique },
  };
}

describe('revokeInvite', () => {
  it('returns not_found when the code is malformed (canonicalisation throws)', async () => {
    const { prisma, spies } = fakePrisma({ updateCount: 0 });
    const r = await revokeInvite(prisma as never, {
      code: 'garbage',
      revokedByObserverId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({ status: 'not_found' } satisfies RevokeInviteResult);
    // No DB calls — we short-circuit on the normalisation failure
    expect(spies.updateMany).not.toHaveBeenCalled();
  });

  it('marks the code revokedAt + revokedByObserverId on a happy path', async () => {
    const { prisma, spies } = fakePrisma({ updateCount: 1 });
    const r = await revokeInvite(prisma as never, {
      code: 'molt-aaaa-bbbb-cccc',
      revokedByObserverId: 'admin_1',
      now: NOW,
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.canonicalCode).toBe('MOLT-AAAA-BBBB-CCCC');
    expect(r.revokedAt).toEqual(NOW);

    expect(spies.updateMany).toHaveBeenCalledOnce();
    const args = spies.updateMany.mock.calls[0]?.[0] as {
      where: { code: string; redeemedAt: null; revokedAt: null };
      data: { revokedAt: Date; revokedByObserverId: string };
    };
    expect(args.where.code).toBe('MOLT-AAAA-BBBB-CCCC');
    expect(args.where.redeemedAt).toBeNull();
    expect(args.where.revokedAt).toBeNull();
    expect(args.data.revokedByObserverId).toBe('admin_1');
  });

  it('returns not_found when no row matches AND the diagnostic read finds nothing', async () => {
    const { prisma } = fakePrisma({ updateCount: 0, rowExists: false });
    const r = await revokeInvite(prisma as never, {
      code: 'MOLT-AAAA-BBBB-CCCC',
      revokedByObserverId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({ status: 'not_found' } satisfies RevokeInviteResult);
  });

  it('returns already_redeemed when no row matches AND the row has redeemedAt set', async () => {
    const { prisma } = fakePrisma({
      updateCount: 0,
      redeemedAt: NOW,
      revokedAt: null,
    });
    const r = await revokeInvite(prisma as never, {
      code: 'MOLT-AAAA-BBBB-CCCC',
      revokedByObserverId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({ status: 'already_redeemed' } satisfies RevokeInviteResult);
  });

  it('returns already_revoked when no row matches AND the row already has revokedAt', async () => {
    const { prisma } = fakePrisma({
      updateCount: 0,
      redeemedAt: null,
      revokedAt: NOW,
    });
    const r = await revokeInvite(prisma as never, {
      code: 'MOLT-AAAA-BBBB-CCCC',
      revokedByObserverId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({ status: 'already_revoked' } satisfies RevokeInviteResult);
  });
});
