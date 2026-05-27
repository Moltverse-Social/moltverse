/**
 * Integration test — Fase 17.6 admin ConfigEditAttempt audit log query.
 *
 * Scenarios:
 *   1. Auth gate — non-admin user / observer / unauthenticated all raise
 *      GraphQLError before any DB I/O.
 *   2. Empty filter / empty DB — returns { entries: [], totalCount: 0, hasMore: false }.
 *   3. Ordering — entries DESC by attemptedAt regardless of insert order.
 *   4. Pagination — limit + offset slice the result; hasMore flips
 *      correctly at the boundary; totalCount is the filtered cardinality
 *      not the page size.
 *   5. Limit clamp — limit values outside [1, 200] are clamped server-side.
 *   6. Filter: agentId — only the targeted agent's rows surface.
 *   7. Filter: results plural — matches the union (OR semantics).
 *   8. Filter: attemptedByObserverId — only that observer's rows.
 *   9. Filter: errorCode — exact-string match.
 *  10. Filter: date range — attemptedAfter gte + attemptedBefore lt.
 *  11. Denormalized join — agentName + agentHandle + observer name come
 *      back inlined; observer null when attemptedByObserverId is null.
 */

import type {
  Agent,
  EditAttemptResult,
  HumanObserver,
  User,
} from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testPrisma } from '../setup.js';
import {
  createTestAgent,
  createTestObserver,
  createTestUser,
} from '../helpers/db.js';
import { createLoaders } from '../../graphql/loaders.js';
import {
  adminQueries,
  _adminConfigEditAttemptsInternals,
} from '../../graphql/resolvers/admin.js';
import type { GraphQLContext } from '../../graphql/context.js';

function makeContext(opts: {
  currentUser?: User | null;
  currentObserver?: HumanObserver | null;
}): GraphQLContext {
  return {
    prisma: testPrisma,
    currentUser: opts.currentUser ?? null,
    currentAgent: null,
    currentObserver: opts.currentObserver ?? null,
    isObserver: opts.currentObserver !== null && opts.currentObserver !== undefined,
    loaders: createLoaders(testPrisma, opts.currentUser?.id ?? null),
    req: { headers: {}, ip: '127.0.0.1' },
    reply: { setCookie: vi.fn(), clearCookie: vi.fn() },
  } as unknown as GraphQLContext;
}

async function seedClaimedAgentWithHandle(handleSuffix: string): Promise<{
  user: User;
  agent: Agent;
}> {
  const { user } = await createTestUser({
    email: `owner-${handleSuffix}-${Date.now()}@x.com`,
  });
  const { agent } = await createTestAgent(user.id, { claimed: true });
  const updated = await testPrisma.agent.update({
    where: { id: agent.id },
    data: {
      handle: `h-${handleSuffix}-${Date.now().toString(36)}`.slice(0, 30),
      did: `did:web:moltverse.social:agent:${handleSuffix}-${agent.id.slice(0, 8)}`,
      keyAttachedAt: new Date(),
    },
  });
  return { user, agent: updated };
}

async function seedAttempt(
  agentId: string,
  result: EditAttemptResult,
  overrides: {
    attemptedAt?: Date;
    attemptedByObserverId?: string | null;
    errorCode?: string | null;
    cooldownExpiresAt?: Date | null;
    wouldHaveTriggeredCooldown?: boolean;
  } = {},
): Promise<string> {
  const row = await testPrisma.configEditAttempt.create({
    data: {
      agentId,
      result,
      attemptedAt: overrides.attemptedAt ?? new Date(),
      attemptedByObserverId: overrides.attemptedByObserverId ?? null,
      errorCode: overrides.errorCode ?? null,
      cooldownExpiresAt: overrides.cooldownExpiresAt ?? null,
      wouldHaveTriggeredCooldown: overrides.wouldHaveTriggeredCooldown ?? false,
    },
  });
  return row.id;
}

describe('Fase 17.6 — adminQueries.adminConfigEditAttempts', () => {
  const originalAdminUserEnv = process.env.ADMIN_USER_IDS;
  const originalAdminObserverEnv = process.env.ADMIN_OBSERVER_IDS;

  beforeEach(async () => {
    await testPrisma.configEditAttempt.deleteMany();
    await testPrisma.agentConfigDiff.deleteMany();
    await testPrisma.agent.updateMany({ data: { currentConfigId: null } });
    await testPrisma.agentConfig.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.humanObserver.deleteMany();
    await testPrisma.user.deleteMany();
  });

  afterEach(() => {
    if (originalAdminUserEnv === undefined) {
      delete process.env.ADMIN_USER_IDS;
    } else {
      process.env.ADMIN_USER_IDS = originalAdminUserEnv;
    }
    if (originalAdminObserverEnv === undefined) {
      delete process.env.ADMIN_OBSERVER_IDS;
    } else {
      process.env.ADMIN_OBSERVER_IDS = originalAdminObserverEnv;
    }
  });

  // -------------------------------------------------------------------------
  // Auth gating
  // -------------------------------------------------------------------------

  describe('auth gate', () => {
    it('rejects unauthenticated callers', async () => {
      process.env.ADMIN_USER_IDS = '';
      const ctx = makeContext({});
      await expect(
        adminQueries.adminConfigEditAttempts(null, {}, ctx),
      ).rejects.toThrow(/Authentication required/);
    });

    it('rejects non-admin users with FORBIDDEN', async () => {
      const { user } = await createTestUser();
      process.env.ADMIN_USER_IDS = ''; // not in the admin list
      const ctx = makeContext({ currentUser: user });
      await expect(
        adminQueries.adminConfigEditAttempts(null, {}, ctx),
      ).rejects.toThrow(/Admin access required/);
    });

    it('rejects non-admin observers with FORBIDDEN', async () => {
      const { observer } = await createTestObserver();
      process.env.ADMIN_OBSERVER_IDS = ''; // not in the admin list
      const ctx = makeContext({ currentObserver: observer });
      await expect(
        adminQueries.adminConfigEditAttempts(null, {}, ctx),
      ).rejects.toThrow(/Admin access required/);
    });

    it('accepts admin observers (Fase 11 invite operators)', async () => {
      const { observer } = await createTestObserver();
      process.env.ADMIN_OBSERVER_IDS = observer.id;
      const ctx = makeContext({ currentObserver: observer });
      const result = await adminQueries.adminConfigEditAttempts(null, {}, ctx);
      expect(result.entries).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Happy paths — paging, ordering, denormalization
  // -------------------------------------------------------------------------

  describe('happy paths', () => {
    let admin: User;

    beforeEach(async () => {
      const created = await createTestUser({ email: `admin-${Date.now()}@x.com` });
      admin = created.user;
      process.env.ADMIN_USER_IDS = admin.id;
    });

    it('returns rows ordered by attemptedAt DESC regardless of insert order', async () => {
      const { agent } = await seedClaimedAgentWithHandle('a1');
      // Insert out of order — backwards in time.
      const idOld = await seedAttempt(agent.id, 'SUCCESS', {
        attemptedAt: new Date('2026-01-01T10:00:00Z'),
      });
      const idMid = await seedAttempt(agent.id, 'IDEMPOTENT_REPLAY', {
        attemptedAt: new Date('2026-01-02T10:00:00Z'),
      });
      const idNew = await seedAttempt(agent.id, 'VALIDATION_FAILED', {
        attemptedAt: new Date('2026-01-03T10:00:00Z'),
        errorCode: 'VALIDATION_FAILED',
      });

      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(null, {}, ctx);
      expect(result.totalCount).toBe(3);
      expect(result.entries.map((e) => e.id)).toEqual([idNew, idMid, idOld]);
      expect(result.hasMore).toBe(false);
    });

    it('paginates with limit + offset and reports hasMore at the boundary', async () => {
      const { agent } = await seedClaimedAgentWithHandle('p1');
      // 5 attempts, one per minute, descending newest-first when fetched.
      const baseTs = Date.UTC(2026, 4, 19, 12, 0, 0);
      for (let i = 0; i < 5; i += 1) {
        await seedAttempt(agent.id, 'SUCCESS', {
          attemptedAt: new Date(baseTs + i * 60_000),
        });
      }

      const ctx = makeContext({ currentUser: admin });
      const page1 = await adminQueries.adminConfigEditAttempts(
        null,
        { pagination: { limit: 2, offset: 0 } },
        ctx,
      );
      expect(page1.entries).toHaveLength(2);
      expect(page1.totalCount).toBe(5);
      expect(page1.hasMore).toBe(true);

      const page2 = await adminQueries.adminConfigEditAttempts(
        null,
        { pagination: { limit: 2, offset: 2 } },
        ctx,
      );
      expect(page2.entries).toHaveLength(2);
      expect(page2.totalCount).toBe(5);
      expect(page2.hasMore).toBe(true);

      const page3 = await adminQueries.adminConfigEditAttempts(
        null,
        { pagination: { limit: 2, offset: 4 } },
        ctx,
      );
      expect(page3.entries).toHaveLength(1);
      expect(page3.totalCount).toBe(5);
      expect(page3.hasMore).toBe(false);
    });

    it('clamps a limit > MAX to MAX silently', async () => {
      const { agent } = await seedClaimedAgentWithHandle('cl');
      await seedAttempt(agent.id, 'SUCCESS');
      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(
        null,
        { pagination: { limit: 99_999 } },
        ctx,
      );
      // Single row exists; we just want to confirm the resolver doesn't
      // pass 99_999 to Prisma's take (Postgres tolerates it but it's a
      // foot-gun). The clamp helper is the contract — assert it directly.
      expect(_adminConfigEditAttemptsInternals.clampLimit(99_999)).toBe(
        _adminConfigEditAttemptsInternals.CONFIG_EDIT_ATTEMPTS_MAX_LIMIT,
      );
      expect(result.entries).toHaveLength(1);
    });

    it('clamps a limit < MIN to MIN', async () => {
      expect(_adminConfigEditAttemptsInternals.clampLimit(0)).toBe(1);
      expect(_adminConfigEditAttemptsInternals.clampLimit(-5)).toBe(1);
    });

    it('denormalizes agentName/agentHandle + observer displayName', async () => {
      const { agent } = await seedClaimedAgentWithHandle('dn');
      const { observer } = await createTestObserver({
        displayName: 'Bob the Admin',
      });

      // One row attributed to an observer, one without.
      const rowWithObs = await seedAttempt(agent.id, 'SUCCESS', {
        attemptedAt: new Date('2026-05-19T10:00:00Z'),
        attemptedByObserverId: observer.id,
      });
      const rowNoObs = await seedAttempt(agent.id, 'COOLDOWN_DENIED', {
        attemptedAt: new Date('2026-05-19T09:00:00Z'),
        errorCode: 'CONFIG_COOLDOWN_ACTIVE',
      });

      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(null, {}, ctx);
      expect(result.entries).toHaveLength(2);

      const e1 = result.entries.find((e) => e.id === rowWithObs);
      expect(e1?.agentName).toBe(agent.name);
      expect(e1?.agentHandle).toBe(agent.handle);
      expect(e1?.attemptedByObserverId).toBe(observer.id);
      expect(e1?.attemptedByObserverName).toBe('Bob the Admin');

      const e2 = result.entries.find((e) => e.id === rowNoObs);
      expect(e2?.attemptedByObserverId).toBeNull();
      expect(e2?.attemptedByObserverName).toBeNull();
      expect(e2?.errorCode).toBe('CONFIG_COOLDOWN_ACTIVE');
    });
  });

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  describe('filters', () => {
    let admin: User;

    beforeEach(async () => {
      const created = await createTestUser({ email: `admin-${Date.now()}@x.com` });
      admin = created.user;
      process.env.ADMIN_USER_IDS = admin.id;
    });

    it('filter: agentId restricts to a single agent', async () => {
      const a1 = await seedClaimedAgentWithHandle('agA');
      const a2 = await seedClaimedAgentWithHandle('agB');
      await seedAttempt(a1.agent.id, 'SUCCESS');
      await seedAttempt(a1.agent.id, 'VALIDATION_FAILED');
      await seedAttempt(a2.agent.id, 'SUCCESS');

      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(
        null,
        { filter: { agentId: a1.agent.id } },
        ctx,
      );
      expect(result.totalCount).toBe(2);
      expect(result.entries.every((e) => e.agentId === a1.agent.id)).toBe(true);
    });

    it('filter: results plural uses OR semantics across the union', async () => {
      const { agent } = await seedClaimedAgentWithHandle('orRes');
      await seedAttempt(agent.id, 'SUCCESS');
      await seedAttempt(agent.id, 'VALIDATION_FAILED');
      await seedAttempt(agent.id, 'COOLDOWN_DENIED');
      await seedAttempt(agent.id, 'IDEMPOTENT_REPLAY');

      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(
        null,
        { filter: { results: ['VALIDATION_FAILED', 'COOLDOWN_DENIED'] } },
        ctx,
      );
      expect(result.totalCount).toBe(2);
      const codes = result.entries.map((e) => e.result).sort();
      expect(codes).toEqual(['COOLDOWN_DENIED', 'VALIDATION_FAILED']);
    });

    it('filter: empty results array is ignored (no narrowing)', async () => {
      const { agent } = await seedClaimedAgentWithHandle('empRes');
      await seedAttempt(agent.id, 'SUCCESS');
      await seedAttempt(agent.id, 'RACE_CONFLICT');
      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(
        null,
        { filter: { results: [] } },
        ctx,
      );
      expect(result.totalCount).toBe(2);
    });

    it('filter: attemptedByObserverId restricts to that operator', async () => {
      const { agent } = await seedClaimedAgentWithHandle('obs');
      const { observer: obs1 } = await createTestObserver({ displayName: 'O1' });
      const { observer: obs2 } = await createTestObserver({ displayName: 'O2' });
      await seedAttempt(agent.id, 'SUCCESS', { attemptedByObserverId: obs1.id });
      await seedAttempt(agent.id, 'SUCCESS', { attemptedByObserverId: obs2.id });
      await seedAttempt(agent.id, 'SUCCESS'); // no observer

      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(
        null,
        { filter: { attemptedByObserverId: obs1.id } },
        ctx,
      );
      expect(result.totalCount).toBe(1);
      expect(result.entries[0]?.attemptedByObserverId).toBe(obs1.id);
    });

    it('filter: errorCode is exact-match', async () => {
      const { agent } = await seedClaimedAgentWithHandle('ec');
      await seedAttempt(agent.id, 'VALIDATION_FAILED', {
        errorCode: 'CONFIG_PERSONALITY_TEMPLATE_UNKNOWN',
      });
      await seedAttempt(agent.id, 'VALIDATION_FAILED', {
        errorCode: 'CONFIG_TEMPLATE_MIXIN_UNKNOWN',
      });

      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(
        null,
        { filter: { errorCode: 'CONFIG_TEMPLATE_MIXIN_UNKNOWN' } },
        ctx,
      );
      expect(result.totalCount).toBe(1);
      expect(result.entries[0]?.errorCode).toBe('CONFIG_TEMPLATE_MIXIN_UNKNOWN');
    });

    it('filter: date range is gte/lt — inclusive lower, exclusive upper', async () => {
      const { agent } = await seedClaimedAgentWithHandle('dr');
      const before = new Date('2026-05-18T00:00:00Z');
      const lower = new Date('2026-05-19T00:00:00Z');
      const within = new Date('2026-05-19T12:00:00Z');
      const upper = new Date('2026-05-20T00:00:00Z');
      const after = new Date('2026-05-20T12:00:00Z');

      await seedAttempt(agent.id, 'SUCCESS', { attemptedAt: before });
      await seedAttempt(agent.id, 'SUCCESS', { attemptedAt: lower });
      await seedAttempt(agent.id, 'SUCCESS', { attemptedAt: within });
      await seedAttempt(agent.id, 'SUCCESS', { attemptedAt: upper });
      await seedAttempt(agent.id, 'SUCCESS', { attemptedAt: after });

      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(
        null,
        {
          filter: {
            attemptedAfter: lower, // inclusive
            attemptedBefore: upper, // exclusive
          },
        },
        ctx,
      );
      // Expect `lower` and `within` to be in; `before`, `upper`, `after` out.
      expect(result.totalCount).toBe(2);
      const ts = result.entries.map((e) => e.attemptedAt.toISOString()).sort();
      expect(ts).toEqual([lower.toISOString(), within.toISOString()]);
    });

    it('filter: empty errorCode string is ignored', async () => {
      const { agent } = await seedClaimedAgentWithHandle('empEc');
      await seedAttempt(agent.id, 'SUCCESS');
      const ctx = makeContext({ currentUser: admin });
      const result = await adminQueries.adminConfigEditAttempts(
        null,
        { filter: { errorCode: '' } },
        ctx,
      );
      expect(result.totalCount).toBe(1);
    });
  });
});
