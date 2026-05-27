/**
 * Tests for src/lib/attestation/invalidator.ts.
 *
 * Fake Prisma — asserts the status-machine logic (which states can be
 * flipped to REVOKED) and the update payload shape.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  invalidateAttestationByAdmin,
  type InvalidateAttestationResult,
} from '../../../lib/attestation/invalidator.js';

const NOW = new Date('2026-05-12T12:00:00Z');

type AttestationStatus =
  | 'PENDING_VERIFICATION'
  | 'VALID'
  | 'EXPIRED'
  | 'INVALID'
  | 'SUPERSEDED'
  | 'REVOKED';

function fakePrisma(opts: {
  row: null | { id: string; agentId: string; status: AttestationStatus };
}): {
  prisma: unknown;
  spies: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
} {
  const findUnique = vi.fn().mockResolvedValue(opts.row);
  const update = vi.fn().mockResolvedValue({});
  return { prisma: { attestation: { findUnique, update } }, spies: { findUnique, update } };
}

describe('invalidateAttestationByAdmin', () => {
  it('returns not_found when the attestation does not exist', async () => {
    const { prisma, spies } = fakePrisma({ row: null });
    const r = await invalidateAttestationByAdmin(prisma as never, {
      attestationId: 'att_x',
      reason: 'compose-hash leaked',
      adminUserId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({ status: 'not_found' } satisfies InvalidateAttestationResult);
    expect(spies.update).not.toHaveBeenCalled();
  });

  it('returns already_revoked when status is already REVOKED', async () => {
    const { prisma, spies } = fakePrisma({
      row: { id: 'att_x', agentId: 'a1', status: 'REVOKED' },
    });
    const r = await invalidateAttestationByAdmin(prisma as never, {
      attestationId: 'att_x',
      reason: 'noop',
      adminUserId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({ status: 'already_revoked' } satisfies InvalidateAttestationResult);
    expect(spies.update).not.toHaveBeenCalled();
  });

  it('refuses SUPERSEDED rows', async () => {
    const { prisma, spies } = fakePrisma({
      row: { id: 'att_x', agentId: 'a1', status: 'SUPERSEDED' },
    });
    const r = await invalidateAttestationByAdmin(prisma as never, {
      attestationId: 'att_x',
      reason: 'noop',
      adminUserId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({
      status: 'cannot_invalidate',
      reason: 'superseded',
    } satisfies InvalidateAttestationResult);
    expect(spies.update).not.toHaveBeenCalled();
  });

  it('refuses INVALID rows (verifier already rejected them)', async () => {
    const { prisma, spies } = fakePrisma({
      row: { id: 'att_x', agentId: 'a1', status: 'INVALID' },
    });
    const r = await invalidateAttestationByAdmin(prisma as never, {
      attestationId: 'att_x',
      reason: 'noop',
      adminUserId: 'admin_1',
      now: NOW,
    });
    expect(r).toEqual({
      status: 'cannot_invalidate',
      reason: 'invalid_verification',
    } satisfies InvalidateAttestationResult);
    expect(spies.update).not.toHaveBeenCalled();
  });

  for (const startingStatus of ['VALID', 'PENDING_VERIFICATION', 'EXPIRED'] as const) {
    it(`flips ${startingStatus} → REVOKED on the happy path`, async () => {
      const { prisma, spies } = fakePrisma({
        row: { id: 'att_x', agentId: 'agent_1', status: startingStatus },
      });
      const r = await invalidateAttestationByAdmin(prisma as never, {
        attestationId: 'att_x',
        reason: 'compose-hash leaked in agent logs',
        adminUserId: 'admin_1',
        now: NOW,
      });
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect(r.attestationId).toBe('att_x');
      expect(r.agentId).toBe('agent_1');
      expect(r.previousStatus).toBe(startingStatus);

      expect(spies.update).toHaveBeenCalledOnce();
      const args = spies.update.mock.calls[0]?.[0] as {
        where: { id: string };
        data: { status: string; invalidatedAt: Date; invalidatedReason: string };
      };
      expect(args.where.id).toBe('att_x');
      expect(args.data.status).toBe('REVOKED');
      expect(args.data.invalidatedAt).toEqual(NOW);
      expect(args.data.invalidatedReason).toBe('compose-hash leaked in agent logs');
    });
  }
});
