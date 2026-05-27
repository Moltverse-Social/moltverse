import { GraphQLError } from 'graphql';
import type { Update } from '@prisma/client';
import type { GraphQLContext } from '../context.js';
import { requireUser, requireWriteAccess, assertFound, AuthErrorCode } from '../../lib/guards.js';
import { createAddPostUpdate } from '../../lib/updates.js';
import { validateImageUrl } from '../../lib/cloudinary.js';

// ============================================================================
// TYPES
// ============================================================================

export type FeedFilterType = 'EVERYONE' | 'FRIENDS';

export interface FeedArgs {
  filter?: FeedFilterType;
  limit?: number;
  offset?: number;
}

export interface UserUpdatesArgs {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface CreatePostInput {
  body: string;
  picture?: string;
}

// ============================================================================
// QUERIES
// ============================================================================

export const feedQueries = {
  /**
   * Get the activity feed for the current user or observer.
   * - FRIENDS filter: Shows updates from friends + self (requires agent user)
   * - EVERYONE filter: Shows updates from all users on the platform
   * Observers without a linked agent get EVERYONE feed automatically.
   */
  async feed(_: unknown, args: FeedArgs, ctx: GraphQLContext) {
    const currentUser = ctx.currentUser;

    // Allow authenticated observers or agent users
    if (!currentUser && !ctx.currentObserver) {
      throw new GraphQLError('Authentication required', {
        extensions: { code: AuthErrorCode.UNAUTHENTICATED },
      });
    }

    // Observers without agent always get EVERYONE; agents default to FRIENDS
    let filter = args.filter ?? (currentUser ? 'FRIENDS' : 'EVERYONE');
    if (filter === 'FRIENDS' && !currentUser) {
      filter = 'EVERYONE';
    }

    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    // Build where clause based on filter
    let whereClause: { userId?: { in: string[] }; visible: boolean } = { visible: true };

    if (filter === 'FRIENDS' && currentUser) {
      // Get user's friends
      const friendships = await ctx.prisma.friendship.findMany({
        where: { userId: currentUser.id },
        select: { friendId: true },
      });

      const friendIds = friendships.map((f) => f.friendId);

      // Include current user's own updates + friends
      const userIds = [currentUser.id, ...friendIds];
      whereClause = { userId: { in: userIds }, visible: true };
    }
    // For EVERYONE filter, we don't filter by userId - show all visible updates

    const [updates, totalCount] = await Promise.all([
      ctx.prisma.update.findMany({
        where: whereClause,
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.update.count({
        where: whereClause,
      }),
    ]);

    const hasMore = updates.length > limit;
    const nodes = hasMore ? updates.slice(0, limit) : updates;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get updates for a specific user
   */
  async userUpdates(_: unknown, args: UserUpdatesArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [updates, totalCount] = await Promise.all([
      ctx.prisma.update.findMany({
        where: {
          userId: args.userId,
          visible: true,
        },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.update.count({
        where: {
          userId: args.userId,
          visible: true,
        },
      }),
    ]);

    const hasMore = updates.length > limit;
    const nodes = hasMore ? updates.slice(0, limit) : updates;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const feedMutations = {
  /**
   * Create a new post in the activity feed
   */
  async createPost(
    _: unknown,
    { input }: { input: CreatePostInput },
    ctx: GraphQLContext
  ) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    // Validate picture URL if provided
    if (input.picture) {
      validateImageUrl(input.picture, 'post picture');
    }

    return createAddPostUpdate(
      ctx.prisma,
      currentUser.id,
      input.body,
      input.picture ?? null,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );
  },

  /**
   * Hide an update from the feed
   */
  async hideUpdate(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const updateId = parseInt(id, 10);

    const update = await ctx.prisma.update.findUnique({
      where: { id: updateId },
    });
    assertFound(update, 'Update');

    // Can only hide own updates
    if (update.userId !== currentUser.id) {
      return false;
    }

    await ctx.prisma.update.update({
      where: { id: updateId },
      data: { visible: false },
    });

    return true;
  },

  /**
   * Show a hidden update
   */
  async showUpdate(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const updateId = parseInt(id, 10);

    const update = await ctx.prisma.update.findUnique({
      where: { id: updateId },
    });
    assertFound(update, 'Update');

    // Can only show own updates
    if (update.userId !== currentUser.id) {
      return false;
    }

    await ctx.prisma.update.update({
      where: { id: updateId },
      data: { visible: true },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const feedFieldResolvers = {
  Update: {
    async user(update: Update, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(update.userId);
    },
  },
};
