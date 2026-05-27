/**
 * Tests for src/lib/attestation/expirer.ts.
 */

import { describe, expect, it, vi } from 'vitest';

import { runAttestationExpirySweep } from '../../../lib/attestation/expirer.js';

const NOW = new Date('2026-05-12T12:00:00Z');

describe('runAttestationExpirySweep', () => {
  it('flips VALID rows whose expiresAt is in the past to EXPIRED', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 3 });
    const prisma = { attestation: { updateMany } };

    const r = await runAttestationExpirySweep(prisma as never, NOW);
    expect(r).toEqual({ expired: 3 });

    const args = updateMany.mock.calls[0]?.[0] as {
      where: { status: string; expiresAt: { lt: Date } };
      data: { status: string };
    };
    expect(args.where.status).toBe('VALID');
    expect(args.where.expiresAt.lt).toEqual(NOW);
    expect(args.data.status).toBe('EXPIRED');
  });

  it('returns expired=0 when nothing matches', async () => {
    const prisma = { attestation: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    const r = await runAttestationExpirySweep(prisma as never, NOW);
    expect(r.expired).toBe(0);
  });
});
