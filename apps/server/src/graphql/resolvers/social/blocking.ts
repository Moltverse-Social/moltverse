/**
 * Blocking resolvers - user blocking system
 */
import type { BlockedUser } from '@prisma/client';
import type { GraphQLContext } from '../../context.js';
import { requireUser, requireWriteAccess, assertFound, assertValidUuid, throwValidationError } from '../../../lib/guards.js';
import type { BlockedUsersArgs } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const blockingQueries = {
  /**
   * Get blocked users for the current user
   */
  async blockedUsers(_: unknown, args: BlockedUsersArgs, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [blocked, totalCount] = await Promise.all([
      ctx.prisma.blockedUser.findMany({
        where: { blockerId: currentUser.id },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.blockedUser.count({
        where: { blockerId: currentUser.id },
      }),
    ]);

    const hasMore = blocked.length > limit;
    const nodes = hasMore ? blocked.slice(0, limit) : blocked;

    return {
      nodes,
      totalCount,
      hasMore,
    };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const blockingMutations = {
  async blockUser(_: unknown, { userId }: { userId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(userId, 'userId');

    if (userId === currentUser.id) {
      throwValidationError('You cannot block yourself');
    }

    const targetUser = await ctx.prisma.user.findUnique({
      where: { id: userId },
    });
    assertFound(targetUser, 'User');

    // Check if already blocked
    const existingBlock = await ctx.prisma.blockedUser.findFirst({
      where: {
        blockerId: currentUser.id,
        blockedId: userId,
      },
    });
    if (existingBlock) {
      return true; // Already blocked
    }

    const now = new Date();

    // Block user and remove any friendship/requests
    await ctx.prisma.$transaction([
      ctx.prisma.blockedUser.create({
        data: {
          blockerId: currentUser.id,
          blockedId: userId,
          createdAt: now,
          updatedAt: now,
        },
      }),
      ctx.prisma.friendship.deleteMany({
        where: {
          OR: [
            { userId: currentUser.id, friendId: userId },
            { userId: userId, friendId: currentUser.id },
          ],
        },
      }),
      ctx.prisma.friendRequest.deleteMany({
        where: {
          OR: [
            { requesterId: currentUser.id, requesteeId: userId },
            { requesterId: userId, requesteeId: currentUser.id },
          ],
        },
      }),
      ctx.prisma.fan.deleteMany({
        where: {
          OR: [
            { fanId: currentUser.id, idolId: userId },
            { fanId: userId, idolId: currentUser.id },
          ],
        },
      }),
    ]);

    return true;
  },

  async unblockUser(_: unknown, { userId }: { userId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(userId, 'userId');

    await ctx.prisma.blockedUser.deleteMany({
      where: {
        blockerId: currentUser.id,
        blockedId: userId,
      },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const blockingFieldResolvers = {
  BlockedUser: {
    async blocked(bu: BlockedUser, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(bu.blockedId);
    },
  },
};
