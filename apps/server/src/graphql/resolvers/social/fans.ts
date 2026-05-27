/**
 * Fans resolvers - one-way admirer relationships
 */
import type { Fan } from '@prisma/client';
import type { GraphQLContext } from '../../context.js';
import { requireUser, requireWriteAccess, assertFound, assertValidUuid, throwValidationError } from '../../../lib/guards.js';
import { createNewFanActivity } from '../../../lib/activity.js';
import { createBecomeFanUpdate } from '../../../lib/updates.js';
import type { FansArgs } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const fanQueries = {
  /**
   * Get fans of a user
   */
  async fans(_: unknown, args: FansArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [fans, totalCount] = await Promise.all([
      ctx.prisma.fan.findMany({
        where: { idolId: args.userId },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.fan.count({
        where: { idolId: args.userId },
      }),
    ]);

    const hasMore = fans.length > limit;
    const nodes = hasMore ? fans.slice(0, limit) : fans;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get who a user is a fan of (idols)
   */
  async idols(_: unknown, args: FansArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [fans, totalCount] = await Promise.all([
      ctx.prisma.fan.findMany({
        where: { fanId: args.userId },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.fan.count({
        where: { fanId: args.userId },
      }),
    ]);

    const hasMore = fans.length > limit;
    const nodes = hasMore ? fans.slice(0, limit) : fans;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const fanMutations = {
  async becomeFan(_: unknown, { idolId }: { idolId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(idolId, 'idolId');

    if (idolId === currentUser.id) {
      throwValidationError('You cannot be a fan of yourself');
    }

    const idol = await ctx.prisma.user.findUnique({
      where: { id: idolId },
    });
    assertFound(idol, 'User');

    // Check if blocked
    const blocked = await ctx.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: idolId, blockedId: currentUser.id },
          { blockerId: currentUser.id, blockedId: idolId },
        ],
      },
    });
    if (blocked) {
      throwValidationError('Cannot become a fan of this user');
    }

    // Check if already a fan
    const existingFan = await ctx.prisma.fan.findFirst({
      where: {
        fanId: currentUser.id,
        idolId,
      },
    });
    if (existingFan) {
      return existingFan;
    }

    const now = new Date();
    const fan = await ctx.prisma.fan.create({
      data: {
        fanId: currentUser.id,
        idolId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Create activity for the idol
    await createNewFanActivity(
      ctx.prisma,
      idolId,
      currentUser.id,
      currentUser.name
    );

    // Emit live event for the feed
    await createBecomeFanUpdate(
      ctx.prisma,
      currentUser.id,
      idolId,
      idol.name,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return fan;
  },

  async removeFan(_: unknown, { idolId }: { idolId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(idolId, 'idolId');

    await ctx.prisma.fan.deleteMany({
      where: {
        fanId: currentUser.id,
        idolId,
      },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const fanFieldResolvers = {
  Fan: {
    async fan(fanRecord: Fan, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(fanRecord.fanId);
    },
    async idol(fanRecord: Fan, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(fanRecord.idolId);
    },
  },
};
