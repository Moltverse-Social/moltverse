/**
 * Tests for src/lib/action/anti-replay.ts — timestamp window math +
 * nonce consume failure mapping (DB unique-violation -> replayed).
 *
 * The DB-bound `consumeActionNonce` is tested via a fake Prisma
 * client that throws a P2002 on call — no real Postgres round trip
 * needed to lock in the failure-mode mapping.
 */

import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  consumeActionNonce,
  NONCE_TTL_MS,
  TIMESTAMP_WINDOW_MS,
  verifyTimestampWindow,
} from '../../../lib/action/anti-replay.js';

describe('verifyTimestampWindow', () => {
  const now = new Date('2026-05-11T14:00:00.000Z');

  it('accepts a timestamp within the window', () => {
    const r = verifyTimestampWindow('2026-05-11T14:00:00.000Z', now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skewMs).toBe(0);
  });

  it('accepts the boundary -5min', () => {
    const ts = new Date(now.getTime() - TIMESTAMP_WINDOW_MS).toISOString();
    expect(verifyTimestampWindow(ts, now).ok).toBe(true);
  });

  it('accepts the boundary +5min', () => {
    const ts = new Date(now.getTime() + TIMESTAMP_WINDOW_MS).toISOString();
    expect(verifyTimestampWindow(ts, now).ok).toBe(true);
  });

  it('rejects 6min in the past as too_old', () => {
    const ts = new Date(now.getTime() - 6 * 60 * 1_000).toISOString();
    const r = verifyTimestampWindow(ts, now);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('too_old');
    expect(r.skewMs).toBeLessThan(-TIMESTAMP_WINDOW_MS);
  });

  it('rejects 6min in the future as too_new', () => {
    const ts = new Date(now.getTime() + 6 * 60 * 1_000).toISOString();
    const r = verifyTimestampWindow(ts, now);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('too_new');
    expect(r.skewMs).toBeGreaterThan(TIMESTAMP_WINDOW_MS);
  });

  it('rejects malformed timestamps', () => {
    const r = verifyTimestampWindow('not a date', now);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('malformed');
  });

  it('reports skewMs for telemetry on success', () => {
    const ts = new Date(now.getTime() + 30_000).toISOString();
    const r = verifyTimestampWindow(ts, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skewMs).toBe(30_000);
  });
});

interface FakePrisma {
  actionNonce: {
    create: ReturnType<typeof vi.fn>;
  };
}

function fakeOk(): FakePrisma {
  return {
    actionNonce: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function fakeP2002(): FakePrisma {
  return {
    actionNonce: {
      create: vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique violation', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    },
  };
}

function fakeUnknownError(): FakePrisma {
  return {
    actionNonce: {
      create: vi.fn().mockRejectedValue(new Error('connection lost')),
    },
  };
}

describe('consumeActionNonce', () => {
  const now = new Date('2026-05-11T14:00:00.000Z');

  it('returns ok and inserts the row on success', async () => {
    const prisma = fakeOk();
    const r = await consumeActionNonce(
      prisma as never,
      'agent_a',
      '01HXY9KZ4NQ8R3M2VVH4N0P1AB',
      now,
    );
    expect(r.ok).toBe(true);
    expect(prisma.actionNonce.create).toHaveBeenCalledOnce();
    const callArgs = prisma.actionNonce.create.mock.calls[0]?.[0] as {
      data: { expiresAt: Date; consumedAt: Date };
    };
    expect(callArgs.data.expiresAt.getTime() - callArgs.data.consumedAt.getTime()).toBe(
      NONCE_TTL_MS,
    );
  });

  it('returns replayed on P2002 unique violation', async () => {
    const r = await consumeActionNonce(
      fakeP2002() as never,
      'agent_a',
      '01HXY9KZ4NQ8R3M2VVH4N0P1AB',
      now,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('replayed');
  });

  it('returns db_error on other failures', async () => {
    const r = await consumeActionNonce(
      fakeUnknownError() as never,
      'agent_a',
      '01HXY9KZ4NQ8R3M2VVH4N0P1AB',
      now,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('db_error');
  });
});
