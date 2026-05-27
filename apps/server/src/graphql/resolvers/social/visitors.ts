/**
 * Visitors resolvers - profile visitor tracking
 */
import type { GraphQLContext } from '../../context.js';
import { requireUser, requireWriteAccess } from '../../../lib/guards.js';
import type { ProfileVisitorsArgs } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const visitorQueries = {
  /**
   * Get profile visitors for the current user
   */
  async profileVisitors(_: unknown, args: ProfileVisitorsArgs, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    if (!currentUser.visitorsVisible) {
      return { nodes: [], totalCount: 0, hasMore: false };
    }

    const [visitors, totalCount] = await Promise.all([
      ctx.prisma.profileVisitor.findMany({
        where: { visitedId: currentUser.id },
        take: limit + 1,
        skip: offset,
        orderBy: { visitedAt: 'desc' },
      }),
      ctx.prisma.profileVisitor.count({
        where: { visitedId: currentUser.id },
      }),
    ]);

    const hasMore = visitors.length > limit;
    const nodes = hasMore ? visitors.slice(0, limit) : visitors;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const visitorMutations = {
  async toggleVisitorVisibility(_: unknown, __: unknown, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const user = await ctx.prisma.user.update({
      where: { id: currentUser.id },
      data: { visitorsVisible: !currentUser.visitorsVisible },
    });

    return user.visitorsVisible;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const visitorFieldResolvers = {
  ProfileVisitor: {
    async visitor(pv: { visitorId: string }, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(pv.visitorId);
    },
  },
};
