/**
 * Scrap resolvers - public messages on user profiles
 */
import type { Scrap } from '@prisma/client';
import type { GraphQLContext } from '../../context.js';
import { validateInput, createScrapInput } from '../../../lib/validation.js';
import { requireUser, requireWriteAccess, assertFound, throwValidationError, parseNumericId } from '../../../lib/guards.js';
import { createScrapActivity } from '../../../lib/activity.js';
import { createSendScrapUpdate } from '../../../lib/updates.js';
import type { ScrapsArgs, CreateScrapArgs } from './types.js';
import { DAILY_SCRAP_LIMIT, getStartOfDay } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const scrapQueries = {
  /**
   * Get scraps for a user's profile
   * Filters out content from blocked users if viewer is authenticated
   */
  async scraps(_: unknown, args: ScrapsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    // Build where clause with optional blocked user filter
    // Always filter out soft-deleted scraps
    const where: Record<string, unknown> = { receiverId: args.userId, deletedAt: null };

    // If viewer is authenticated, filter out scraps from users they have blocked
    if (ctx.currentUser) {
      const blockedUsers = await ctx.prisma.blockedUser.findMany({
        where: { blockerId: ctx.currentUser.id },
        select: { blockedId: true },
      });
      const blockedIds = blockedUsers.map((b) => b.blockedId);
      if (blockedIds.length > 0) {
        where.senderId = { notIn: blockedIds };
      }
    }

    const [scraps, totalCount] = await Promise.all([
      ctx.prisma.scrap.findMany({
        where,
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.scrap.count({ where }),
    ]);

    const hasMore = scraps.length > limit;
    const nodes = hasMore ? scraps.slice(0, limit) : scraps;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get scraps sent by the current authenticated user
   */
  async sentScraps(_: unknown, args: { limit?: number; offset?: number }, ctx: GraphQLContext) {
    if (!ctx.currentUser) {
      throw new Error('Authentication required');
    }

    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const where = { senderId: ctx.currentUser.id, deletedAt: null };

    const [scraps, totalCount] = await Promise.all([
      ctx.prisma.scrap.findMany({
        where,
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.scrap.count({ where }),
    ]);

    const hasMore = scraps.length > limit;
    const nodes = hasMore ? scraps.slice(0, limit) : scraps;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const scrapMutations = {
  async createScrap(_: unknown, { input }: CreateScrapArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const validated = validateInput(createScrapInput, input);

    // Cannot send scrap to yourself
    if (validated.receiverId === currentUser.id) {
      throwValidationError('You cannot send a scrap to yourself');
    }

    // Check if receiver exists
    const receiver = await ctx.prisma.user.findUnique({
      where: { id: validated.receiverId },
    });
    assertFound(receiver, 'User');

    // Check if blocked
    const blocked = await ctx.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: validated.receiverId, blockedId: currentUser.id },
          { blockerId: currentUser.id, blockedId: validated.receiverId },
        ],
      },
    });
    if (blocked) {
      throwValidationError('Cannot send scrap to this user');
    }

    // Check daily rate limit
    const startOfDay = getStartOfDay();
    const todayScrapsCount = await ctx.prisma.scrap.count({
      where: {
        senderId: currentUser.id,
        createdAt: { gte: startOfDay },
      },
    });
    if (todayScrapsCount >= DAILY_SCRAP_LIMIT) {
      throwValidationError(`You have reached the daily limit of ${DAILY_SCRAP_LIMIT} scraps`);
    }

    const now = new Date();
    const scrap = await ctx.prisma.scrap.create({
      data: {
        body: validated.body,
        senderId: currentUser.id,
        receiverId: validated.receiverId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Create activity for the receiver
    await createScrapActivity(
      ctx.prisma,
      validated.receiverId,
      currentUser.id,
      currentUser.name,
      scrap.id
    );

    // Emit live event for the feed
    await createSendScrapUpdate(
      ctx.prisma,
      currentUser.id,
      validated.receiverId,
      receiver.name,
      validated.body,
      scrap.id,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return scrap;
  },

  async deleteScrap(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const scrapId = parseNumericId(id, 'Scrap');

    const scrap = await ctx.prisma.scrap.findFirst({
      where: { id: scrapId, deletedAt: null },
    });
    assertFound(scrap, 'Scrap');

    // Can delete if sender or receiver
    if (scrap.senderId !== currentUser.id && scrap.receiverId !== currentUser.id) {
      throwValidationError('You do not have permission to delete this scrap');
    }

    // Soft delete: set deletedAt instead of hard delete
    await ctx.prisma.scrap.update({
      where: { id: scrapId },
      data: { deletedAt: new Date() },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const scrapFieldResolvers = {
  Scrap: {
    async sender(scrap: Scrap, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(scrap.senderId);
    },
    async receiver(scrap: Scrap, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(scrap.receiverId);
    },
  },
};
