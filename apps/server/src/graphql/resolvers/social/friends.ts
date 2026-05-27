/**
 * Friends resolvers - friendships, friend requests, and suggestions
 */
import type { FriendRequest } from '@prisma/client';
import type { GraphQLContext } from '../../context.js';
import { requireUser, requireWriteAccess, assertFound, assertValidUuid, throwValidationError, throwConflictError } from '../../../lib/guards.js';
import { createAddFriendUpdates } from '../../../lib/updates.js';
import { createFriendRequestActivity, createFriendAcceptedActivity } from '../../../lib/activity.js';
import type { FriendsArgs, FriendRequestsArgs, SuggestFriendsArgs } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const friendQueries = {
  /**
   * Get friends of a user
   */
  async friends(_: unknown, args: FriendsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [friendships, totalCount] = await Promise.all([
      ctx.prisma.friendship.findMany({
        where: { userId: args.userId },
        take: limit + 1,
        skip: offset,
        include: { friend: true },
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.friendship.count({
        where: { userId: args.userId },
      }),
    ]);

    const hasMore = friendships.length > limit;
    const nodes = hasMore ? friendships.slice(0, limit) : friendships;

    return {
      nodes: nodes.map((f) => f.friend),
      totalCount,
      hasMore,
    };
  },

  /**
   * Get pending friend requests for the current user (received)
   */
  async friendRequests(_: unknown, args: FriendRequestsArgs, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [requests, totalCount] = await Promise.all([
      ctx.prisma.friendRequest.findMany({
        where: { requesteeId: currentUser.id },
        take: limit + 1,
        skip: offset,
        include: {
          requester: true,
          requestee: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.friendRequest.count({
        where: { requesteeId: currentUser.id },
      }),
    ]);

    const hasMore = requests.length > limit;
    const nodes = hasMore ? requests.slice(0, limit) : requests;

    return {
      nodes,
      totalCount,
      hasMore,
    };
  },

  /**
   * Get sent friend requests (pending requests the current user sent)
   */
  async sentFriendRequests(_: unknown, args: FriendRequestsArgs, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [requests, totalCount] = await Promise.all([
      ctx.prisma.friendRequest.findMany({
        where: { requesterId: currentUser.id },
        take: limit + 1,
        skip: offset,
        include: {
          requester: true,
          requestee: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.friendRequest.count({
        where: { requesterId: currentUser.id },
      }),
    ]);

    const hasMore = requests.length > limit;
    const nodes = hasMore ? requests.slice(0, limit) : requests;

    return {
      nodes,
      totalCount,
      hasMore,
    };
  },

  /**
   * Get friend suggestions based on friends-of-friends.
   * Excludes: self, current friends, pending requests, blocked users.
   *
   * Performance: Limits the number of friends considered to avoid
   * O(n*m) explosion with users who have many friends.
   */
  async suggestFriends(_: unknown, args: SuggestFriendsArgs, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);
    const limit = Math.min(args.limit ?? 10, 50);
    const offset = args.offset ?? 0;

    // Performance limit: only consider first 200 friends for suggestions
    // This prevents O(n*m) explosion with users who have many friends
    const MAX_FRIENDS_TO_CONSIDER = 200;

    // 1. Get current user's friend IDs (limited for performance)
    const friendships = await ctx.prisma.friendship.findMany({
      where: { userId: currentUser.id },
      select: { friendId: true },
      take: MAX_FRIENDS_TO_CONSIDER,
      orderBy: { createdAt: 'desc' }, // Prioritize recent friends
    });
    const friendIds = friendships.map((f) => f.friendId);

    // No friends = no suggestions
    if (friendIds.length === 0) {
      return { nodes: [], totalCount: 0, hasMore: false };
    }

    // Get all friend IDs for exclusion (need full list to exclude properly)
    const allFriendships = await ctx.prisma.friendship.findMany({
      where: { userId: currentUser.id },
      select: { friendId: true },
    });
    const allFriendIds = new Set(allFriendships.map((f) => f.friendId));

    // 2. Get pending friend request user IDs (both sent and received)
    const [sentRequests, receivedRequests] = await Promise.all([
      ctx.prisma.friendRequest.findMany({
        where: { requesterId: currentUser.id },
        select: { requesteeId: true },
      }),
      ctx.prisma.friendRequest.findMany({
        where: { requesteeId: currentUser.id },
        select: { requesterId: true },
      }),
    ]);
    const pendingRequestUserIds = new Set([
      ...sentRequests.map((r) => r.requesteeId),
      ...receivedRequests.map((r) => r.requesterId),
    ]);

    // 3. Get blocked user IDs (both directions)
    const blockedUsers = await ctx.prisma.blockedUser.findMany({
      where: {
        OR: [{ blockerId: currentUser.id }, { blockedId: currentUser.id }],
      },
      select: { blockerId: true, blockedId: true },
    });
    const blockedUserIds = new Set(
      blockedUsers.flatMap((b) => [b.blockerId, b.blockedId])
    );
    blockedUserIds.delete(currentUser.id);

    // 4. Get friends-of-friends (limited query)
    // For each friend, get their friends (excluding current user and current user's friends)
    const friendsOfFriends = await ctx.prisma.friendship.findMany({
      where: {
        userId: { in: friendIds },
        friendId: {
          notIn: [currentUser.id],
        },
      },
      select: { userId: true, friendId: true },
      // Limit to prevent memory issues with highly connected users
      take: 5000,
    });

    // Count mutual friends per suggested user
    const mutualCountMap = new Map<string, string[]>();
    for (const fof of friendsOfFriends) {
      // Filter out: current friends, pending requests, blocked users
      if (
        allFriendIds.has(fof.friendId) ||
        pendingRequestUserIds.has(fof.friendId) ||
        blockedUserIds.has(fof.friendId)
      ) {
        continue;
      }

      const existing = mutualCountMap.get(fof.friendId) ?? [];
      existing.push(fof.userId);
      mutualCountMap.set(fof.friendId, existing);
    }

    // 5. Sort by mutual friend count and paginate
    const sortedSuggestions = Array.from(mutualCountMap.entries())
      .map(([userId, mutualFriendIds]) => ({
        userId,
        mutualFriendIds,
        mutualFriendCount: mutualFriendIds.length,
      }))
      .sort((a, b) => b.mutualFriendCount - a.mutualFriendCount);

    const totalCount = sortedSuggestions.length;
    const paginatedSuggestions = sortedSuggestions.slice(offset, offset + limit + 1);
    const hasMore = paginatedSuggestions.length > limit;
    const finalSuggestions = hasMore ? paginatedSuggestions.slice(0, limit) : paginatedSuggestions;

    // 6. Fetch user data and mutual friends
    const suggestedUserIds = finalSuggestions.map((s) => s.userId);
    const allMutualFriendIds = [...new Set(finalSuggestions.flatMap((s) => s.mutualFriendIds.slice(0, 5)))];

    const [suggestedUsers, mutualFriendUsers] = await Promise.all([
      ctx.prisma.user.findMany({
        where: { id: { in: suggestedUserIds } },
      }),
      ctx.prisma.user.findMany({
        where: { id: { in: allMutualFriendIds } },
      }),
    ]);

    const userMap = new Map(suggestedUsers.map((u) => [u.id, u]));
    const mutualFriendMap = new Map(mutualFriendUsers.map((u) => [u.id, u]));

    const nodes = finalSuggestions
      .map((s) => {
        const user = userMap.get(s.userId);
        if (!user) return null;
        return {
          user,
          mutualFriendCount: s.mutualFriendCount,
          mutualFriends: s.mutualFriendIds
            .slice(0, 5)
            .map((id) => mutualFriendMap.get(id))
            .filter(Boolean),
        };
      })
      .filter(Boolean);

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const friendMutations = {
  async sendFriendRequest(_: unknown, { userId }: { userId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(userId, 'userId');

    if (userId === currentUser.id) {
      throwValidationError('You cannot send a friend request to yourself');
    }

    const targetUser = await ctx.prisma.user.findUnique({
      where: { id: userId },
    });
    assertFound(targetUser, 'User');

    // Check if already friends
    const existingFriendship = await ctx.prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: currentUser.id,
          friendId: userId,
        },
      },
    });
    if (existingFriendship) {
      throwConflictError('You are already friends with this user');
    }

    // Check if request already sent
    const existingRequest = await ctx.prisma.friendRequest.findUnique({
      where: {
        requesterId_requesteeId: {
          requesterId: currentUser.id,
          requesteeId: userId,
        },
      },
    });
    if (existingRequest) {
      throwConflictError('Friend request already sent');
    }

    // Check if they already sent us a request (auto-accept)
    const reverseRequest = await ctx.prisma.friendRequest.findUnique({
      where: {
        requesterId_requesteeId: {
          requesterId: userId,
          requesteeId: currentUser.id,
        },
      },
    });
    if (reverseRequest) {
      // Auto-accept: create friendship both ways and delete request
      const now = new Date();
      await ctx.prisma.$transaction([
        ctx.prisma.friendRequest.delete({
          where: {
            requesterId_requesteeId: {
              requesterId: userId,
              requesteeId: currentUser.id,
            },
          },
        }),
        ctx.prisma.friendship.createMany({
          data: [
            { userId: currentUser.id, friendId: userId, createdAt: now, updatedAt: now },
            { userId: userId, friendId: currentUser.id, createdAt: now, updatedAt: now },
          ],
        }),
      ]);

      // Create activity and live events (same as acceptFriendRequest)
      await createAddFriendUpdates(
        ctx.prisma,
        currentUser.id,
        userId,
        targetUser.name,
        currentUser.name,
        {
          id: currentUser.id,
          name: currentUser.name,
          profilePicture: currentUser.profilePicture,
        },
        {
          id: targetUser.id,
          name: targetUser.name,
          profilePicture: targetUser.profilePicture,
        }
      );

      await createFriendAcceptedActivity(
        ctx.prisma,
        userId,
        currentUser.id,
        currentUser.name
      );

      return true;
    }

    // Check if blocked
    const blocked = await ctx.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: currentUser.id },
          { blockerId: currentUser.id, blockedId: userId },
        ],
      },
    });
    if (blocked) {
      throwValidationError('Cannot send friend request to this user');
    }

    // Create friend request (with graceful duplicate handling for race conditions)
    const now = new Date();
    try {
      await ctx.prisma.friendRequest.create({
        data: {
          requesterId: currentUser.id,
          requesteeId: userId,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (error) {
      // Handle race condition: concurrent request already created this entry (P2002)
      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throwConflictError('Friend request already sent');
      }
      throw error;
    }

    // Create activity for the requestee
    await createFriendRequestActivity(
      ctx.prisma,
      userId,
      currentUser.id,
      currentUser.name
    );

    return true;
  },

  async acceptFriendRequest(_: unknown, { requesterId }: { requesterId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(requesterId, 'requesterId');

    const request = await ctx.prisma.friendRequest.findUnique({
      where: {
        requesterId_requesteeId: {
          requesterId,
          requesteeId: currentUser.id,
        },
      },
    });
    assertFound(request, 'Friend request');

    // Get requester's info for the update and live event
    const requester = await ctx.prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true, name: true, profilePicture: true },
    });
    assertFound(requester, 'Requester');

    // Create friendship both ways and delete request
    const now = new Date();
    await ctx.prisma.$transaction([
      ctx.prisma.friendRequest.delete({
        where: {
          requesterId_requesteeId: {
            requesterId,
            requesteeId: currentUser.id,
          },
        },
      }),
      ctx.prisma.friendship.createMany({
        data: [
          { userId: currentUser.id, friendId: requesterId, createdAt: now, updatedAt: now },
          { userId: requesterId, friendId: currentUser.id, createdAt: now, updatedAt: now },
        ],
      }),
    ]);

    // Create activity updates for both users and emit live event
    await createAddFriendUpdates(
      ctx.prisma,
      currentUser.id,
      requesterId,
      requester.name,
      currentUser.name,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      },
      {
        id: requester.id,
        name: requester.name,
        profilePicture: requester.profilePicture,
      }
    );

    // Create activity for the original requester
    await createFriendAcceptedActivity(
      ctx.prisma,
      requesterId,
      currentUser.id,
      currentUser.name
    );

    return true;
  },

  async rejectFriendRequest(_: unknown, { requesterId }: { requesterId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(requesterId, 'requesterId');

    const request = await ctx.prisma.friendRequest.findUnique({
      where: {
        requesterId_requesteeId: {
          requesterId,
          requesteeId: currentUser.id,
        },
      },
    });
    assertFound(request, 'Friend request');

    await ctx.prisma.friendRequest.delete({
      where: {
        requesterId_requesteeId: {
          requesterId,
          requesteeId: currentUser.id,
        },
      },
    });

    return true;
  },

  async cancelFriendRequest(_: unknown, { requesteeId }: { requesteeId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(requesteeId, 'requesteeId');

    const request = await ctx.prisma.friendRequest.findUnique({
      where: {
        requesterId_requesteeId: {
          requesterId: currentUser.id,
          requesteeId,
        },
      },
    });
    assertFound(request, 'Friend request');

    await ctx.prisma.friendRequest.delete({
      where: {
        requesterId_requesteeId: {
          requesterId: currentUser.id,
          requesteeId,
        },
      },
    });

    return true;
  },

  async removeFriend(_: unknown, { friendId }: { friendId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(friendId, 'friendId');

    // Delete both directions
    await ctx.prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: currentUser.id, friendId },
          { userId: friendId, friendId: currentUser.id },
        ],
      },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const friendFieldResolvers = {
  FriendRequest: {
    async requester(request: FriendRequest, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(request.requesterId);
    },
    async requestee(request: FriendRequest, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(request.requesteeId);
    },
  },
};
