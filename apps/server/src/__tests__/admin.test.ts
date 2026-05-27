/**
 * Admin Dashboard tests
 *
 * Tests for:
 * - isAdmin guard function
 * - requireAdmin guard function
 * - adminStats resolver
 * - publicStats resolver
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { testPrisma } from './setup.js';
import { createTestUser, createTestAgent } from './helpers/index.js';
import { isAdmin, requireAdmin } from '../lib/guards.js';
import { adminQueries, clearAdminStatsCache } from '../graphql/resolvers/admin.js';
import { statsQueries, clearStatsCache } from '../graphql/resolvers/stats.js';
import { createLoaders } from '../graphql/loaders.js';
import type { GraphQLContext } from '../graphql/context.js';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createAdminTestContext(options: {
  currentUser?: { id: string; [key: string]: unknown } | null;
  currentAgent?: { id: string; [key: string]: unknown } | null;
  isObserver?: boolean;
} = {}): GraphQLContext {
  return {
    prisma: testPrisma,
    currentUser: options.currentUser ?? null,
    currentAgent: options.currentAgent ?? null,
    currentObserver: null,
    isObserver: options.isObserver ?? false,
    loaders: createLoaders(testPrisma, options.currentUser?.id ?? null),
    req: {
      headers: {},
      ip: '127.0.0.1',
    },
    reply: {
      setCookie: vi.fn(),
      clearCookie: vi.fn(),
    },
  } as unknown as GraphQLContext;
}

// =============================================================================
// GUARD TESTS
// =============================================================================

describe('Admin Guards', () => {
  const originalEnv = process.env.ADMIN_USER_IDS;

  beforeEach(() => {
    // Reset env before each test
    process.env.ADMIN_USER_IDS = 'admin-user-1,admin-user-2';
  });

  afterAll(() => {
    // Restore original env
    process.env.ADMIN_USER_IDS = originalEnv;
  });

  describe('isAdmin', () => {
    it('returns true for user in ADMIN_USER_IDS', () => {
      expect(isAdmin('admin-user-1')).toBe(true);
      expect(isAdmin('admin-user-2')).toBe(true);
    });

    it('returns false for user not in ADMIN_USER_IDS', () => {
      expect(isAdmin('regular-user')).toBe(false);
      expect(isAdmin('another-user')).toBe(false);
    });

    it('returns false when ADMIN_USER_IDS is empty', () => {
      process.env.ADMIN_USER_IDS = '';
      expect(isAdmin('admin-user-1')).toBe(false);
    });

    it('returns false when ADMIN_USER_IDS is undefined', () => {
      delete process.env.ADMIN_USER_IDS;
      expect(isAdmin('admin-user-1')).toBe(false);
    });

    it('handles whitespace in ADMIN_USER_IDS', () => {
      process.env.ADMIN_USER_IDS = ' admin-user-1 , admin-user-2 ';
      expect(isAdmin('admin-user-1')).toBe(true);
      expect(isAdmin('admin-user-2')).toBe(true);
    });
  });

  describe('requireAdmin', () => {
    it('returns user when authenticated as admin', async () => {
      const { user } = await createTestUser();
      process.env.ADMIN_USER_IDS = user.id;

      const ctx = createAdminTestContext({ currentUser: user });
      const result = requireAdmin(ctx);

      expect(result).toBeDefined();
      expect(result.id).toBe(user.id);
    });

    it('throws UNAUTHENTICATED when not logged in', () => {
      const ctx = createAdminTestContext({ currentUser: null });

      expect(() => requireAdmin(ctx)).toThrow();
      try {
        requireAdmin(ctx);
      } catch (error: unknown) {
        const gqlError = error as { extensions?: { code?: string } };
        expect(gqlError.extensions?.code).toBe('UNAUTHENTICATED');
      }
    });

    it('throws FORBIDDEN when user is not admin', async () => {
      const { user } = await createTestUser();
      process.env.ADMIN_USER_IDS = 'other-admin-id';

      const ctx = createAdminTestContext({ currentUser: user });

      expect(() => requireAdmin(ctx)).toThrow();
      try {
        requireAdmin(ctx);
      } catch (error: unknown) {
        const gqlError = error as { extensions?: { code?: string } };
        expect(gqlError.extensions?.code).toBe('FORBIDDEN');
      }
    });
  });
});

// =============================================================================
// PUBLIC STATS RESOLVER TESTS
// =============================================================================

describe('publicStats resolver', () => {
  beforeEach(async () => {
    // Clear stats cache to ensure fresh data
    clearStatsCache();
    // Clean up before each test
    await testPrisma.scrap.deleteMany();
    await testPrisma.topicComment.deleteMany();
    await testPrisma.topic.deleteMany();
    await testPrisma.userCluster.deleteMany();
    await testPrisma.cluster.deleteMany();
    await testPrisma.user.deleteMany();
  });

  it('returns correct counts with no data', async () => {
    const ctx = createAdminTestContext();
    const result = await statsQueries.publicStats(null, null, ctx);

    expect(result.totalAgents).toBe(0);
    expect(result.totalClusters).toBe(0);
    expect(result.totalPosts).toBe(0);
    expect(result.totalScraps).toBe(0);
  });

  it('returns correct agent count', async () => {
    // Create users with claimed agents (publicStats counts agents with claimed=true)
    const { user: user1 } = await createTestUser({ email: 'user1@test.com' });
    const { user: user2 } = await createTestUser({ email: 'user2@test.com' });
    const { user: user3 } = await createTestUser({ email: 'user3@test.com' });

    await createTestAgent(user1.id, { claimed: true });
    await createTestAgent(user2.id, { claimed: true });
    await createTestAgent(user3.id, { claimed: true });

    const ctx = createAdminTestContext();
    const result = await statsQueries.publicStats(null, null, ctx);

    expect(result.totalAgents).toBe(3);
  });

  it('returns correct community count', async () => {
    const { user } = await createTestUser();

    // Get default category or create one
    let category = await testPrisma.category.findFirst();
    if (!category) {
      category = await testPrisma.category.create({
        data: { title: 'Test Category' },
      });
    }

    const now = new Date();
    await testPrisma.cluster.createMany({
      data: [
        { title: 'Community 1', creatorId: user.id, categoryId: category.id, picture: '', createdAt: now },
        { title: 'Community 2', creatorId: user.id, categoryId: category.id, picture: '', createdAt: now },
      ],
    });

    const ctx = createAdminTestContext();
    const result = await statsQueries.publicStats(null, null, ctx);

    expect(result.totalClusters).toBe(2);
  });

  it('returns correct scrap count', async () => {
    // Create users with agents (publicStats only counts scraps from users with agents)
    const { user: sender } = await createTestUser({ email: 'sender@test.com' });
    const { user: receiver } = await createTestUser({ email: 'receiver@test.com' });

    await createTestAgent(sender.id, { claimed: true });
    await createTestAgent(receiver.id, { claimed: true });

    const now = new Date();
    await testPrisma.scrap.createMany({
      data: [
        { senderId: sender.id, receiverId: receiver.id, body: 'Scrap 1', createdAt: now },
        { senderId: sender.id, receiverId: receiver.id, body: 'Scrap 2', createdAt: now },
        { senderId: receiver.id, receiverId: sender.id, body: 'Scrap 3', createdAt: now },
      ],
    });

    const ctx = createAdminTestContext();
    const result = await statsQueries.publicStats(null, null, ctx);

    expect(result.totalScraps).toBe(3);
  });

  it('does not require authentication', async () => {
    const ctx = createAdminTestContext({ currentUser: null });
    const result = await statsQueries.publicStats(null, null, ctx);

    // Should not throw, just return data
    expect(result).toBeDefined();
    expect(typeof result.totalAgents).toBe('number');
  });
});

// =============================================================================
// ADMIN STATS RESOLVER TESTS
// =============================================================================

describe('adminStats resolver', () => {
  const originalEnv = process.env.ADMIN_USER_IDS;

  beforeEach(async () => {
    // Clear caches to ensure fresh data
    clearStatsCache();
    clearAdminStatsCache();
    // Clean up before each test
    await testPrisma.scrap.deleteMany();
    await testPrisma.topicComment.deleteMany();
    await testPrisma.topic.deleteMany();
    await testPrisma.userCluster.deleteMany();
    await testPrisma.cluster.deleteMany();
    await testPrisma.humanObserver.deleteMany();
    await testPrisma.agent.deleteMany();
    await testPrisma.user.deleteMany();
  });

  afterAll(() => {
    process.env.ADMIN_USER_IDS = originalEnv;
  });

  it('throws UNAUTHENTICATED when not logged in', async () => {
    const ctx = createAdminTestContext({ currentUser: null });

    await expect(adminQueries.adminStats(null, null, ctx)).rejects.toThrow();
  });

  it('throws FORBIDDEN when user is not admin', async () => {
    const { user } = await createTestUser();
    process.env.ADMIN_USER_IDS = 'other-admin-id';

    const ctx = createAdminTestContext({ currentUser: user });

    await expect(adminQueries.adminStats(null, null, ctx)).rejects.toThrow();
  });

  it('returns stats when user is admin', async () => {
    const { user } = await createTestUser();
    process.env.ADMIN_USER_IDS = user.id;

    const ctx = createAdminTestContext({ currentUser: user });
    const result = await adminQueries.adminStats(null, null, ctx);

    // Check structure
    expect(result).toBeDefined();
    expect(result.totalAgents).toBeDefined();
    expect(result.totalAgents.current).toBeDefined();
    expect(result.totalAgents.previous).toBeDefined();
    expect(result.totalAgents.changePercent).toBeDefined();
  });

  it('returns correct MetricWithChange structure', async () => {
    const { user } = await createTestUser();
    process.env.ADMIN_USER_IDS = user.id;

    const ctx = createAdminTestContext({ currentUser: user });
    const result = await adminQueries.adminStats(null, null, ctx);

    // Total agents should have 1 (the admin user)
    expect(result.totalAgents.current).toBe(1);
    expect(typeof result.totalAgents.changePercent).toBe('number');
  });

  it('returns time series data', async () => {
    const { user } = await createTestUser();
    process.env.ADMIN_USER_IDS = user.id;

    const ctx = createAdminTestContext({ currentUser: user });
    const result = await adminQueries.adminStats(null, null, ctx);

    // Check time series
    expect(Array.isArray(result.agentRegistrations7d)).toBe(true);
    expect(result.agentRegistrations7d.length).toBe(7);

    expect(Array.isArray(result.scrapsPerDay7d)).toBe(true);
    expect(result.scrapsPerDay7d.length).toBe(7);

    expect(Array.isArray(result.activeAgentsPerDay7d)).toBe(true);
    expect(result.activeAgentsPerDay7d.length).toBe(7);

    // Check time series point structure
    const point = result.agentRegistrations7d[0];
    expect(point).toHaveProperty('date');
    expect(point).toHaveProperty('value');
    expect(typeof point.value).toBe('number');
  });

  it('returns correct community breakdown', async () => {
    const { user } = await createTestUser();
    process.env.ADMIN_USER_IDS = user.id;

    // Get default category
    let category = await testPrisma.category.findFirst();
    if (!category) {
      category = await testPrisma.category.create({
        data: { title: 'Test Category' },
      });
    }

    // Create public and private communities
    const now = new Date();
    await testPrisma.cluster.createMany({
      data: [
        { title: 'Public 1', creatorId: user.id, categoryId: category.id, picture: '', type: 'PUBLIC', createdAt: now },
        { title: 'Public 2', creatorId: user.id, categoryId: category.id, picture: '', type: 'PUBLIC', createdAt: now },
        { title: 'Private 1', creatorId: user.id, categoryId: category.id, picture: '', type: 'PRIVATE', createdAt: now },
      ],
    });

    const ctx = createAdminTestContext({ currentUser: user });
    const result = await adminQueries.adminStats(null, null, ctx);

    expect(result.totalClusters).toBe(3);
    expect(result.publicClusters).toBe(2);
    expect(result.privateClusters).toBe(1);
  });

  it('calculates change percent correctly', async () => {
    const { user } = await createTestUser();
    process.env.ADMIN_USER_IDS = user.id;

    // Create user created yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);

    await testPrisma.user.create({
      data: {
        email: 'yesterday@test.com',
        name: 'Yesterday User',
        password: 'hash',
        createdAt: yesterday,
      },
    });

    const ctx = createAdminTestContext({ currentUser: user });
    const result = await adminQueries.adminStats(null, null, ctx);

    // 2 users total, 1 before today -> 100% increase
    expect(result.totalAgents.current).toBe(2);
    expect(result.totalAgents.previous).toBe(1);
    expect(result.totalAgents.changePercent).toBe(100);
  });
});

// =============================================================================
// USER isAdmin FIELD RESOLVER TEST
// =============================================================================

describe('User.isAdmin field resolver', () => {
  const originalEnv = process.env.ADMIN_USER_IDS;

  beforeEach(async () => {
    await testPrisma.user.deleteMany();
  });

  afterAll(() => {
    process.env.ADMIN_USER_IDS = originalEnv;
  });

  it('returns null when querying other user profile', async () => {
    const { user: adminUser } = await createTestUser({ email: 'admin@test.com' });
    const { user: otherUser } = await createTestUser({ email: 'other@test.com' });
    process.env.ADMIN_USER_IDS = adminUser.id;

    // Import the field resolver
    const { userFieldResolvers } = await import('../graphql/resolvers/user.js');

    const ctx = createAdminTestContext({ currentUser: adminUser });
    const result = userFieldResolvers.User.isAdmin(otherUser, null, ctx);

    // Should not expose admin status of other users
    expect(result).toBeNull();
  });

  it('returns true when admin queries own profile', async () => {
    const { user: adminUser } = await createTestUser({ email: 'admin@test.com' });
    process.env.ADMIN_USER_IDS = adminUser.id;

    const { userFieldResolvers } = await import('../graphql/resolvers/user.js');

    const ctx = createAdminTestContext({ currentUser: adminUser });
    const result = userFieldResolvers.User.isAdmin(adminUser, null, ctx);

    expect(result).toBe(true);
  });

  it('returns false when non-admin queries own profile', async () => {
    const { user } = await createTestUser();
    process.env.ADMIN_USER_IDS = 'other-admin-id';

    const { userFieldResolvers } = await import('../graphql/resolvers/user.js');

    const ctx = createAdminTestContext({ currentUser: user });
    const result = userFieldResolvers.User.isAdmin(user, null, ctx);

    expect(result).toBe(false);
  });

  it('returns null when not authenticated', async () => {
    const { user } = await createTestUser();

    const { userFieldResolvers } = await import('../graphql/resolvers/user.js');

    const ctx = createAdminTestContext({ currentUser: null });
    const result = userFieldResolvers.User.isAdmin(user, null, ctx);

    expect(result).toBeNull();
  });
});
