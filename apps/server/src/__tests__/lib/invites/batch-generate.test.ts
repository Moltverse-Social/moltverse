/**
 * Tests for src/lib/invites/batch-generate.ts.
 *
 * Fake Prisma — confirms the discriminated result shape, the count +
 * expiresInDays bound validation, and the `inviteCode.create` payload
 * shape. The actual code generation primitive (`generateInviteCode`)
 * is covered by its own unit test; here we only assert that the codes
 * coming out are well-formed and non-colliding inside the batch.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  generateInvitesBatch,
  type GenerateInvitesBatchResult,
} from '../../../lib/invites/batch-generate.js';
import { isCanonicalInviteCode } from '../../../lib/invites/code.js';

const NOW = new Date('2026-05-12T12:00:00Z');

function fakePrisma(): {
  prisma: unknown;
  spies: { create: ReturnType<typeof vi.fn> };
} {
  const create = vi
    .fn()
    .mockImplementation(async ({ data, select }: { data: { code: string; expiresAt: Date | null }; select: unknown }) => {
      void select;
      return { code: data.code, expiresAt: data.expiresAt ?? null };
    });
  return { prisma: { inviteCode: { create } }, spies: { create } };
}

describe('generateInvitesBatch', () => {
  it('rejects count below the floor', async () => {
    const { prisma } = fakePrisma();
    const r = await generateInvitesBatch(prisma as never, {
      count: 0,
      generatedByObserverId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({
      status: 'invalid_input',
      reason: 'count_out_of_range',
    } satisfies GenerateInvitesBatchResult);
  });

  it('rejects count above the ceiling (>200)', async () => {
    const { prisma } = fakePrisma();
    const r = await generateInvitesBatch(prisma as never, {
      count: 201,
      generatedByObserverId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({
      status: 'invalid_input',
      reason: 'count_out_of_range',
    } satisfies GenerateInvitesBatchResult);
  });

  it('rejects non-finite count (NaN)', async () => {
    const { prisma } = fakePrisma();
    const r = await generateInvitesBatch(prisma as never, {
      count: Number.NaN,
      generatedByObserverId: 'admin_1',
      now: NOW,
    });
    expect(r.status).toBe('invalid_input');
  });

  it('rejects expiresInDays below the floor', async () => {
    const { prisma } = fakePrisma();
    const r = await generateInvitesBatch(prisma as never, {
      count: 5,
      generatedByObserverId: 'admin_1',
      expiresInDays: 0,
      now: NOW,
    });
    expect(r).toEqual({
      status: 'invalid_input',
      reason: 'expires_in_days_out_of_range',
    } satisfies GenerateInvitesBatchResult);
  });

  it('rejects expiresInDays above the ceiling (>365)', async () => {
    const { prisma } = fakePrisma();
    const r = await generateInvitesBatch(prisma as never, {
      count: 5,
      generatedByObserverId: 'admin_1',
      expiresInDays: 400,
      now: NOW,
    });
    expect(r.status).toBe('invalid_input');
  });

  it('writes N rows with the expected shape and unique canonical codes', async () => {
    const { prisma, spies } = fakePrisma();
    const r = await generateInvitesBatch(prisma as never, {
      count: 5,
      generatedByObserverId: 'admin_1',
      notes: 'first-cohort',
      now: NOW,
    });

    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.codes).toHaveLength(5);

    // Each code is canonical MOLT-XXXX-XXXX-XXXX
    for (const { code, expiresAt } of r.codes) {
      expect(isCanonicalInviteCode(code)).toBe(true);
      expect(expiresAt).toBeNull();
    }

    // No duplicates inside the batch (Crockford 60-bit entropy makes this
    // statistically certain at N=5, but assert it anyway to catch a
    // logic bug that would, say, copy the same code N times).
    const set = new Set(r.codes.map((c) => c.code));
    expect(set.size).toBe(5);

    expect(spies.create).toHaveBeenCalledTimes(5);
    const firstCallData = spies.create.mock.calls[0]?.[0] as {
      data: {
        code: string;
        notes: string | null;
        generatedByObserverId: string;
        expiresAt: Date | null;
        emailTo: string | null;
      };
    };
    expect(firstCallData.data.notes).toBe('first-cohort');
    expect(firstCallData.data.generatedByObserverId).toBe('admin_1');
    expect(firstCallData.data.expiresAt).toBeNull();
    expect(firstCallData.data.emailTo).toBeNull();
  });

  it('applies expiresInDays to compute expiresAt for every row', async () => {
    const { prisma, spies } = fakePrisma();
    const r = await generateInvitesBatch(prisma as never, {
      count: 3,
      generatedByObserverId: 'admin_1',
      expiresInDays: 7,
      now: NOW,
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;

    const expected = new Date(NOW.getTime() + 7 * 86_400_000);
    for (const { expiresAt } of r.codes) {
      expect(expiresAt).toEqual(expected);
    }
    for (const call of spies.create.mock.calls) {
      const data = (call[0] as { data: { expiresAt: Date | null } }).data;
      expect(data.expiresAt).toEqual(expected);
    }
  });

  it('passes through emailTo when supplied', async () => {
    const { prisma, spies } = fakePrisma();
    const r = await generateInvitesBatch(prisma as never, {
      count: 1,
      generatedByObserverId: 'admin_1',
      emailTo: 'press@moltverse.social',
      now: NOW,
    });
    expect(r.status).toBe('ok');
    const data = (spies.create.mock.calls[0]?.[0] as { data: { emailTo: string | null } }).data;
    expect(data.emailTo).toBe('press@moltverse.social');
  });
});
