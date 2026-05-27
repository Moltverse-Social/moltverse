/**
 * Integration smoke test for Fase 11 — admin GraphQL mutations.
 *
 * Exercises every new resolver against a live Postgres DB. Auth gating
 * is asserted at the resolver layer (a non-admin caller is rejected
 * before any side-effect runs); the discriminated results from the
 * libs are mapped to the GraphQL DTO and the DB row state is verified
 * end-to-end. The per-lib unit tests (`lib/tier/*`, `lib/invites/*`,
 * `lib/attestation/*`) cover the deep branching; this file is the
 * resolver wiring + admin gate check.
 *
 * One DB roundtrip per mutation kept deliberately minimal — heavier
 * branch coverage lives in the per-lib tests. The goal here is to
 * catch resolver-layer regressions (wiring mistakes, type mismatches,
 * gate bypasses) without re-testing the underlying state machine.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testPrisma } from '../setup.js';
import { createTestUser, createTestAgent, createTestObserver } from '../helpers/db.js';
import { createLoaders } from '../../graphql/loaders.js';
import { adminMutations, adminQueries } from '../../graphql/resolvers/admin.js';
import { generateInviteCode } from '../../lib/invites/code.js';
import type { GraphQLContext } from '../../graphql/context.js';
import type {
  Agent,
  AgentTier,
  ApprovedComposeHash,
  Attestation,
  HumanObserver,
  InviteCode,
  TierDispute,
  User,
} from '@prisma/client';

function makeAdminContext(opts: {
  currentUser?: User | null;
  currentAgent?: Agent | null;
  currentObserver?: HumanObserver | null;
}): GraphQLContext {
  return {
    prisma: testPrisma,
    currentUser: opts.currentUser ?? null,
    currentAgent: opts.currentAgent ?? null,
    currentObserver: opts.currentObserver ?? null,
    isObserver: opts.currentObserver !== null && opts.currentObserver !== undefined,
    loaders: createLoaders(testPrisma, opts.currentUser?.id ?? null),
    req: { headers: {}, ip: '127.0.0.1' },
    reply: { setCookie: vi.fn(), clearCookie: vi.fn() },
  } as unknown as GraphQLContext;
}

async function wipeFase11Tables(): Promise<void> {
  // Order matters — child tables first (FKs). Mirror the order
  // documented in invite-flow-graphql.test.ts.
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
}

// ---------------------------------------------------------------------------
// overrideAgentTier
// ---------------------------------------------------------------------------

describe('Fase 11 — adminMutations.overrideAgentTier', () => {
  const originalAdminEnv = process.env.ADMIN_USER_IDS;
  let admin: User;
  let agent: Agent;

  beforeEach(async () => {
    await wipeFase11Tables();
    const adminCreated = await createTestUser({ email: `admin-${Date.now()}@x.com` });
    admin = adminCreated.user;
    process.env.ADMIN_USER_IDS = admin.id;
    const owner = await createTestUser({ email: `owner-${Date.now()}@x.com` });
    const created = await createTestAgent(owner.user.id, { claimed: true });
    agent = created.agent;
  });

  afterAll();
  function afterAll(): void {
    if (originalAdminEnv === undefined) {
      delete process.env.ADMIN_USER_IDS;
    } else {
      process.env.ADMIN_USER_IDS = originalAdminEnv;
    }
  }

  it('rejects a non-admin caller with FORBIDDEN', async () => {
    const ctx = makeAdminContext({ currentUser: { ...admin, id: 'not-admin' } });
    await expect(
      adminMutations.overrideAgentTier(undefined, { agentId: agent.id, toTier: 'SILVER' as AgentTier }, ctx),
    ).rejects.toMatchObject({ extensions: { code: 'FORBIDDEN' } });
  });

  it('promotes BRONZE → SILVER and persists the transition', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const r = await adminMutations.overrideAgentTier(
      undefined,
      { agentId: agent.id, toTier: 'SILVER' as AgentTier, notes: 'manual review approved' },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.fromTier).toBe('BRONZE');
    expect(r.toTier).toBe('SILVER');
    expect(r.transitionId).toBeDefined();

    const refreshed = await testPrisma.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect(refreshed.tier).toBe('SILVER');

    const transition = await testPrisma.agentTierTransition.findUniqueOrThrow({
      where: { id: r.transitionId! },
    });
    expect(transition.reason).toBe('PROMOTION_MANUAL');
    expect(transition.triggerSource).toBe('admin_manual_override');
  });

  it('refuses same-tier override (noop)', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const r = await adminMutations.overrideAgentTier(
      undefined,
      { agentId: agent.id, toTier: 'BRONZE' as AgentTier },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toContain('already in tier BRONZE');
  });

  it('returns not_found when agent does not exist', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const r = await adminMutations.overrideAgentTier(
      undefined,
      { agentId: '00000000-0000-0000-0000-000000000000', toTier: 'GOLD' as AgentTier },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe('Agent not found');
  });
});

// ---------------------------------------------------------------------------
// resolveTierDispute
// ---------------------------------------------------------------------------

describe('Fase 11 — adminMutations.resolveTierDispute', () => {
  let admin: User;
  let agent: Agent;
  let transition: { id: string };
  let dispute: TierDispute;

  beforeEach(async () => {
    await wipeFase11Tables();
    const adminCreated = await createTestUser({ email: `disp-admin-${Date.now()}@x.com` });
    admin = adminCreated.user;
    process.env.ADMIN_USER_IDS = admin.id;

    const owner = await createTestUser({ email: `disp-owner-${Date.now()}@x.com` });
    const created = await createTestAgent(owner.user.id, { claimed: true });
    agent = created.agent;
    // Seed agent at SILVER as if an automatic promotion just happened.
    await testPrisma.agent.update({ where: { id: agent.id }, data: { tier: 'SILVER' } });

    transition = await testPrisma.agentTierTransition.create({
      data: {
        agentId: agent.id,
        fromTier: 'BRONZE',
        toTier: 'SILVER',
        reason: 'PROMOTION_AUTOMATIC',
        triggerSource: 'cron-tier-evaluator',
        metadata: { checks: [] },
      },
      select: { id: true },
    });

    dispute = await testPrisma.tierDispute.create({
      data: {
        agentId: agent.id,
        transitionId: transition.id,
        raisedByUserId: admin.id, // any user — raiser
        reason: 'agent thinks score formula was off',
      },
    });
  });

  it('UPHELD closes the dispute as REJECTED without tier movement', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const r = await adminMutations.resolveTierDispute(
      undefined,
      { disputeId: dispute.id, resolution: 'UPHELD', resolutionReason: 'transition was correct' },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.finalDisputeStatus).toBe('REJECTED');
    expect(r.newTransitionId).toBeNull();
    expect(r.revertedTo).toBeNull();

    const refreshedAgent = await testPrisma.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect(refreshedAgent.tier).toBe('SILVER'); // unchanged
  });

  it('OVERTURNED reverts the agent tier and writes a new transition', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const r = await adminMutations.resolveTierDispute(
      undefined,
      { disputeId: dispute.id, resolution: 'OVERTURNED', resolutionReason: 'scoring bug confirmed' },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.finalDisputeStatus).toBe('ACCEPTED');
    expect(r.revertedTo).toBe('BRONZE');

    const refreshedAgent = await testPrisma.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect(refreshedAgent.tier).toBe('BRONZE');

    const newTrans = await testPrisma.agentTierTransition.findUniqueOrThrow({
      where: { id: r.newTransitionId! },
    });
    expect(newTrans.fromTier).toBe('SILVER');
    expect(newTrans.toTier).toBe('BRONZE');
    expect(newTrans.reason).toBe('DEMOTION_MANUAL');
    expect(newTrans.triggerSource).toBe('admin_dispute_overturned');
  });
});

// ---------------------------------------------------------------------------
// generateInvitesBatch + revokeInvite + resendInviteEmail
// ---------------------------------------------------------------------------

describe('Fase 11 — invite admin mutations', () => {
  let adminObserver: HumanObserver;

  beforeEach(async () => {
    await wipeFase11Tables();
    const created = await createTestObserver({ displayName: 'Admin Observer' });
    adminObserver = created.observer;
    process.env.ADMIN_OBSERVER_IDS = adminObserver.id;
  });

  it('generateInvitesBatch mints N rows attributed to the calling observer', async () => {
    const ctx = makeAdminContext({ currentObserver: adminObserver });
    const r = await adminMutations.generateInvitesBatch(
      undefined,
      { count: 5, notes: 'phala-cohort' },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.codes).toHaveLength(5);

    const rows = await testPrisma.inviteCode.findMany({
      where: { generatedByObserverId: adminObserver.id },
    });
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.notes).toBe('phala-cohort');
      expect(row.redeemedAt).toBeNull();
    }
  });

  it('generateInvitesBatch refuses non-observer admin callers (FK requires HumanObserver)', async () => {
    const userAdmin = await createTestUser({ email: `u-admin-${Date.now()}@x.com` });
    process.env.ADMIN_USER_IDS = userAdmin.user.id;
    const ctx = makeAdminContext({ currentUser: userAdmin.user });
    const r = await adminMutations.generateInvitesBatch(undefined, { count: 1 }, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toContain('HumanObserver');
    expect(r.codes).toHaveLength(0);
  });

  it('revokeInvite soft-kills the row', async () => {
    const code = generateInviteCode();
    await testPrisma.inviteCode.create({
      data: { code, generatedByObserverId: adminObserver.id },
    });
    const ctx = makeAdminContext({ currentObserver: adminObserver });
    const r = await adminMutations.revokeInvite(undefined, { code }, ctx);
    expect(r.success).toBe(true);
    expect(r.code).toBe(code);

    const row = await testPrisma.inviteCode.findUniqueOrThrow({ where: { code } });
    expect(row.revokedAt).not.toBeNull();
    expect(row.revokedByObserverId).toBe(adminObserver.id);
  });

  it('revokeInvite reports already_redeemed for redeemed codes', async () => {
    const code = generateInviteCode();
    const redeemer = await createTestObserver({ displayName: 'redeemer' });
    await testPrisma.inviteCode.create({
      data: {
        code,
        generatedByObserverId: adminObserver.id,
        redeemedAt: new Date(),
        redeemedByObserverId: redeemer.observer.id,
      },
    });
    const ctx = makeAdminContext({ currentObserver: adminObserver });
    const r = await adminMutations.revokeInvite(undefined, { code }, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toContain('already redeemed');
  });

  it('resendInviteEmail refuses when emailTo is null', async () => {
    const code = generateInviteCode();
    await testPrisma.inviteCode.create({
      data: { code, generatedByObserverId: adminObserver.id, emailTo: null },
    });
    const ctx = makeAdminContext({ currentObserver: adminObserver });
    const r = await adminMutations.resendInviteEmail(undefined, { code }, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toContain('emailTo');
  });

  it('resendInviteEmail refuses redeemed codes', async () => {
    const code = generateInviteCode();
    const redeemer = await createTestObserver({ displayName: 'redeemer2' });
    await testPrisma.inviteCode.create({
      data: {
        code,
        generatedByObserverId: adminObserver.id,
        emailTo: 'test@x.com',
        redeemedAt: new Date(),
        redeemedByObserverId: redeemer.observer.id,
      },
    });
    const ctx = makeAdminContext({ currentObserver: adminObserver });
    const r = await adminMutations.resendInviteEmail(undefined, { code }, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toContain('already redeemed');
  });
});

// ---------------------------------------------------------------------------
// invalidateAttestation
// ---------------------------------------------------------------------------

describe('Fase 11 — adminMutations.invalidateAttestation', () => {
  let admin: User;
  let agent: Agent;
  let attestation: Attestation;

  beforeEach(async () => {
    await wipeFase11Tables();
    const adminCreated = await createTestUser({ email: `att-admin-${Date.now()}@x.com` });
    admin = adminCreated.user;
    process.env.ADMIN_USER_IDS = admin.id;
    const owner = await createTestUser({ email: `att-owner-${Date.now()}@x.com` });
    const created = await createTestAgent(owner.user.id, { claimed: true });
    agent = created.agent;

    attestation = await testPrisma.attestation.create({
      data: {
        agentId: agent.id,
        quoteHash: 'q_' + Date.now().toString(),
        quoteUri: 'inline:q_' + Date.now().toString(),
        status: 'VALID',
        attestedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
  });

  it('flips a VALID attestation to REVOKED with reason recorded', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const r = await adminMutations.invalidateAttestation(
      undefined,
      { attestationId: attestation.id, reason: 'compose-hash leaked' },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.previousStatus).toBe('VALID');

    const row = await testPrisma.attestation.findUniqueOrThrow({ where: { id: attestation.id } });
    expect(row.status).toBe('REVOKED');
    expect(row.invalidatedAt).not.toBeNull();
    expect(row.invalidatedReason).toBe('compose-hash leaked');
  });

  it('returns not_found for unknown id', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const r = await adminMutations.invalidateAttestation(
      undefined,
      { attestationId: '00000000-0000-0000-0000-000000000000', reason: 'noop' },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toBe('Attestation not found');
  });
});

// ---------------------------------------------------------------------------
// addApprovedComposeHash + deprecateComposeHash
// ---------------------------------------------------------------------------

describe('Fase 11 — compose-hash admin mutations', () => {
  let admin: User;

  beforeEach(async () => {
    await wipeFase11Tables();
    const adminCreated = await createTestUser({ email: `ch-admin-${Date.now()}@x.com` });
    admin = adminCreated.user;
    process.env.ADMIN_USER_IDS = admin.id;
  });

  it('addApprovedComposeHash writes a new whitelist entry', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const hash = '0x' + 'a'.repeat(64);
    const r = await adminMutations.addApprovedComposeHash(
      undefined,
      { composeHash: hash, label: 'production-v1.0', notes: 'primary image' },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.composeHash).toBe(hash);
    expect(r.label).toBe('production-v1.0');

    const row = await testPrisma.approvedComposeHash.findUniqueOrThrow({
      where: { composeHash: hash },
    });
    expect(row.addedByUserId).toBe(admin.id);
  });

  it('addApprovedComposeHash rejects malformed hash', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const r = await adminMutations.addApprovedComposeHash(
      undefined,
      { composeHash: '0xdead', label: 'bad' },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toContain('malformed_hash');
  });

  it('deprecateComposeHash sets deprecatedAt + 90d grace', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const hash = '0x' + 'b'.repeat(64);
    const row = await testPrisma.approvedComposeHash.create({
      data: { composeHash: hash, label: 'v1.5', addedByUserId: admin.id },
    });
    const r = await adminMutations.deprecateComposeHash(undefined, { id: row.id }, ctx);
    expect(r.success).toBe(true);
    expect(r.deprecatedAt).not.toBeNull();
    expect(r.deprecationGraceUntil).not.toBeNull();

    const refreshed = await testPrisma.approvedComposeHash.findUniqueOrThrow({
      where: { id: row.id },
    });
    expect(refreshed.deprecatedByUserId).toBe(admin.id);
  });

  it('deprecateComposeHash rejects already-deprecated rows', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const hash = '0x' + 'c'.repeat(64);
    const row = await testPrisma.approvedComposeHash.create({
      data: {
        composeHash: hash,
        label: 'v0.9',
        addedByUserId: admin.id,
        deprecatedAt: new Date(),
        deprecatedByUserId: admin.id,
      },
    });
    const r = await adminMutations.deprecateComposeHash(undefined, { id: row.id }, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toContain('already deprecated');
  });
});

// ---------------------------------------------------------------------------
// Fase 12 backend prep — Query.approvedComposeHashes
// ---------------------------------------------------------------------------

describe('Fase 12 — adminQueries.approvedComposeHashes', () => {
  let admin: User;

  beforeEach(async () => {
    await wipeFase11Tables();
    const adminCreated = await createTestUser({ email: `q-admin-${Date.now()}@x.com` });
    admin = adminCreated.user;
    process.env.ADMIN_USER_IDS = admin.id;
  });

  it('rejects non-admin with FORBIDDEN', async () => {
    const ctx = makeAdminContext({ currentUser: { ...admin, id: 'not-admin' } });
    await expect(adminQueries.approvedComposeHashes(undefined, undefined, ctx)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('returns empty list when whitelist is empty', async () => {
    const ctx = makeAdminContext({ currentUser: admin });
    const rows = await adminQueries.approvedComposeHashes(undefined, undefined, ctx);
    expect(rows).toEqual([]);
  });

  it('returns rows sorted by addedAt desc with all summary fields', async () => {
    const baseHash = '0x' + 'a'.repeat(64);
    const otherHash = '0x' + 'b'.repeat(64);
    // Seed two rows with deterministic addedAt for ordering.
    await testPrisma.approvedComposeHash.create({
      data: {
        composeHash: baseHash,
        label: 'older-v0.9',
        addedByUserId: admin.id,
        addedAt: new Date('2026-04-01T00:00:00Z'),
      },
    });
    await testPrisma.approvedComposeHash.create({
      data: {
        composeHash: otherHash,
        label: 'newer-v1.0',
        notes: 'primary image',
        addedByUserId: admin.id,
        addedAt: new Date('2026-05-01T00:00:00Z'),
      },
    });

    const ctx = makeAdminContext({ currentUser: admin });
    const rows = await adminQueries.approvedComposeHashes(undefined, undefined, ctx);
    expect(rows).toHaveLength(2);
    // Sorted desc by addedAt — newer first.
    expect(rows[0]!.composeHash).toBe(otherHash);
    expect(rows[0]!.label).toBe('newer-v1.0');
    expect(rows[0]!.notes).toBe('primary image');
    expect(rows[0]!.deprecatedAt).toBeNull();
    expect(rows[1]!.composeHash).toBe(baseHash);
    expect(rows[1]!.notes).toBeNull();
  });
});
