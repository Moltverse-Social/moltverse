/**
 * Integration test for Fase 9 — Beta invite gate (GraphQL surface).
 *
 * Exercises the public Query.checkInviteCode + Mutation.redeemInviteCode
 * resolvers directly with a synthesised GraphQLContext (the canonical
 * pattern in this repo for resolver-layer integration — see
 * admin.test.ts). Backed by a live Postgres DB.
 *
 *   1. checkInviteCode returns the right discriminator for every
 *      lifecycle state (active, redeemed, revoked, expired, not_found,
 *      malformed input).
 *   2. redeemInviteCode authenticated via ctx.currentObserver atomically
 *      claims an active code. A second redeem from the same observer
 *      surfaces `already_redeemed_by_observer`. A second redeem from a
 *      different observer surfaces `already_redeemed`. Expired and
 *      revoked codes surface their own reasons. Unauthenticated calls
 *      throw a GraphQL UNAUTHENTICATED error.
 *   3. Idempotency + race-safety: the same DB unique constraint that
 *      protected the REST surface protects the GraphQL surface — the
 *      logic shared via lib/invites/redeem.ts is the same code path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testPrisma } from '../setup.js';
import { createTestObserver } from '../helpers/db.js';
import { createLoaders } from '../../graphql/loaders.js';
import { generateInviteCode } from '../../lib/invites/code.js';
import { inviteQueries, inviteMutations } from '../../graphql/resolvers/invites.js';
import type { GraphQLContext } from '../../graphql/context.js';
import type { HumanObserver } from '@prisma/client';

function makeContext(observer: HumanObserver | null = null): GraphQLContext {
  return {
    prisma: testPrisma,
    currentUser: null,
    currentAgent: null,
    currentObserver: observer,
    isObserver: observer !== null,
    loaders: createLoaders(testPrisma, null),
    req: { headers: {}, ip: '127.0.0.1' },
    reply: { setCookie: vi.fn(), clearCookie: vi.fn() },
  } as unknown as GraphQLContext;
}

async function seedInvite(
  generatedByObserverId: string,
  options: {
    code?: string;
    revoked?: boolean;
    expired?: boolean;
    redeemedByObserverId?: string;
    notes?: string;
    expiresInDays?: number;
  } = {},
): Promise<string> {
  const code = options.code ?? generateInviteCode();
  const now = new Date();
  await testPrisma.inviteCode.create({
    data: {
      code,
      notes: options.notes ?? null,
      generatedByObserverId,
      revokedAt: options.revoked === true ? now : null,
      expiresAt:
        options.expired === true
          ? new Date(now.getTime() - 86_400_000)
          : options.expiresInDays !== undefined
            ? new Date(now.getTime() + options.expiresInDays * 86_400_000)
            : null,
      redeemedAt: options.redeemedByObserverId !== undefined ? now : null,
      redeemedByObserverId: options.redeemedByObserverId ?? null,
    },
  });
  return code;
}

describe('Fase 9 — invite gate (GraphQL)', () => {
  let adminObserverId: string;

  beforeEach(async () => {
    await testPrisma.inviteCode.deleteMany();
    await testPrisma.feedSnapshot.deleteMany();
    await testPrisma.testimonial.deleteMany();
    await testPrisma.scrap.deleteMany();
    await testPrisma.attestation.deleteMany();
    await testPrisma.approvedComposeHash.deleteMany();
    await testPrisma.agentTierTransition.deleteMany();
    await testPrisma.tierDispute.deleteMany();
    await testPrisma.behaviorScoreHistory.deleteMany();
    await testPrisma.agentBehaviorScore.deleteMany();
    await testPrisma.behaviorFlag.deleteMany();
    await testPrisma.observerSession.deleteMany();
    await testPrisma.traceContextAudit.deleteMany();
    await testPrisma.reasoningTrace.deleteMany();
    await testPrisma.actionNonce.deleteMany();
    await testPrisma.configEditAttempt.deleteMany();
    await testPrisma.agentConfigDiff.deleteMany();
    await testPrisma.agentKeyHistory.deleteMany();
    await testPrisma.agent.updateMany({ data: { currentConfigId: null } });
    await testPrisma.agentConfig.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.humanObserver.deleteMany();
    await testPrisma.user.deleteMany();

    const admin = await createTestObserver({ displayName: 'Admin Observer' });
    adminObserverId = admin.observer.id;
  });

  afterEach(async () => {
    // no per-test cleanup beyond the next beforeEach wipe.
  });

  // ---------------------------------------------------------------------------
  // Query.checkInviteCode
  // ---------------------------------------------------------------------------

  it('check: returns valid=true for an active code', async () => {
    const code = await seedInvite(adminObserverId);
    const ctx = makeContext();
    const result = await inviteQueries.checkInviteCode(undefined, { code }, ctx);
    expect(result).toEqual({ valid: true, reason: null, expiresAt: null });
  });

  it('check: returns valid=false/not_found for an unknown code', async () => {
    const ctx = makeContext();
    const result = await inviteQueries.checkInviteCode(
      undefined,
      { code: 'MOLT-AAAA-BBBB-CCCC' },
      ctx,
    );
    expect(result).toEqual({ valid: false, reason: 'not_found', expiresAt: null });
  });

  it('check: returns valid=false/not_found for a malformed code (no oracle leak)', async () => {
    const ctx = makeContext();
    const result = await inviteQueries.checkInviteCode(undefined, { code: 'garbage' }, ctx);
    expect(result).toEqual({ valid: false, reason: 'not_found', expiresAt: null });
  });

  it('check: returns valid=false/revoked for a revoked code', async () => {
    const code = await seedInvite(adminObserverId, { revoked: true });
    const ctx = makeContext();
    const result = await inviteQueries.checkInviteCode(undefined, { code }, ctx);
    expect(result).toEqual({ valid: false, reason: 'revoked', expiresAt: null });
  });

  it('check: returns valid=false/redeemed for a redeemed code', async () => {
    const redeemer = await createTestObserver({ displayName: 'Redeemer' });
    const code = await seedInvite(adminObserverId, {
      redeemedByObserverId: redeemer.observer.id,
    });
    const ctx = makeContext();
    const result = await inviteQueries.checkInviteCode(undefined, { code }, ctx);
    expect(result).toEqual({ valid: false, reason: 'redeemed', expiresAt: null });
  });

  it('check: returns valid=false/expired for an expired code', async () => {
    const code = await seedInvite(adminObserverId, { expired: true });
    const ctx = makeContext();
    const result = await inviteQueries.checkInviteCode(undefined, { code }, ctx);
    expect(result).toEqual({ valid: false, reason: 'expired', expiresAt: null });
  });

  it('check: returns expiresAt when the active code has one', async () => {
    const code = await seedInvite(adminObserverId, { expiresInDays: 7 });
    const ctx = makeContext();
    const result = await inviteQueries.checkInviteCode(undefined, { code }, ctx);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  // ---------------------------------------------------------------------------
  // Mutation.redeemInviteCode
  // ---------------------------------------------------------------------------

  it('redeem: throws UNAUTHENTICATED when called without an observer', async () => {
    const code = await seedInvite(adminObserverId);
    const ctx = makeContext();
    await expect(
      inviteMutations.redeemInviteCode(undefined, { code }, ctx),
    ).rejects.toMatchObject({
      message: 'Sign in to redeem an invite',
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });

  it('redeem: succeeds on the happy path and persists the binding', async () => {
    const code = await seedInvite(adminObserverId);
    const observer = await createTestObserver({ displayName: 'Redeemer' });
    const ctx = makeContext(observer.observer);
    const result = await inviteMutations.redeemInviteCode(undefined, { code }, ctx);

    expect(result.success).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.code).toBe(code);
    expect(result.redeemedAt).toBeInstanceOf(Date);

    const row = await testPrisma.inviteCode.findUniqueOrThrow({ where: { code } });
    expect(row.redeemedAt).not.toBeNull();
    expect(row.redeemedByObserverId).toBe(observer.observer.id);
  });

  it('redeem: rejects a second redeem from the same observer (one code per observer)', async () => {
    const codeA = await seedInvite(adminObserverId);
    const codeB = await seedInvite(adminObserverId);
    const observer = await createTestObserver({ displayName: 'Redeemer2' });
    const ctx = makeContext(observer.observer);

    const first = await inviteMutations.redeemInviteCode(undefined, { code: codeA }, ctx);
    expect(first.success).toBe(true);

    const second = await inviteMutations.redeemInviteCode(undefined, { code: codeB }, ctx);
    expect(second.success).toBe(false);
    expect(second.reason).toBe('already_redeemed_by_observer');
    // Echoes the previously-redeemed code so the UI can show "you already
    // redeemed MOLT-XXXX-…".
    expect(second.code).toBe(codeA);
  });

  it('redeem: rejects a second observer on the same code (one observer per code)', async () => {
    const code = await seedInvite(adminObserverId);
    const a = await createTestObserver({ displayName: 'A' });
    const b = await createTestObserver({ displayName: 'B' });

    const aRes = await inviteMutations.redeemInviteCode(
      undefined,
      { code },
      makeContext(a.observer),
    );
    expect(aRes.success).toBe(true);

    const bRes = await inviteMutations.redeemInviteCode(
      undefined,
      { code },
      makeContext(b.observer),
    );
    expect(bRes.success).toBe(false);
    expect(bRes.reason).toBe('already_redeemed');
    expect(bRes.code).toBeNull();
  });

  it('redeem: returns expired for an expired code', async () => {
    const code = await seedInvite(adminObserverId, { expired: true });
    const observer = await createTestObserver({ displayName: 'Expiree' });
    const result = await inviteMutations.redeemInviteCode(
      undefined,
      { code },
      makeContext(observer.observer),
    );
    expect(result.success).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('redeem: returns revoked for a revoked code', async () => {
    const code = await seedInvite(adminObserverId, { revoked: true });
    const observer = await createTestObserver({ displayName: 'Hopeful' });
    const result = await inviteMutations.redeemInviteCode(
      undefined,
      { code },
      makeContext(observer.observer),
    );
    expect(result.success).toBe(false);
    expect(result.reason).toBe('revoked');
  });

  it('redeem: returns not_found for an unknown code', async () => {
    const observer = await createTestObserver({ displayName: 'Hopeful2' });
    const result = await inviteMutations.redeemInviteCode(
      undefined,
      { code: 'MOLT-AAAA-BBBB-CCCC' },
      makeContext(observer.observer),
    );
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_found');
  });

  it('redeem: returns not_found for a malformed code (canonicalisation fails closed)', async () => {
    const observer = await createTestObserver({ displayName: 'Trickster' });
    const result = await inviteMutations.redeemInviteCode(
      undefined,
      { code: 'garbage' },
      makeContext(observer.observer),
    );
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_found');
  });
});
