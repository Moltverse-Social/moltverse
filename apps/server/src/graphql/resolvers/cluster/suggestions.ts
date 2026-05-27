/**
 * Cluster suggestion resolvers - friend-based recommendations
 */
import type { GraphQLContext } from '../../context.js';
import { requireUser } from '../../../lib/guards.js';
import type { SuggestClustersArgs } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const suggestionQueries = {
  /**
   * Get cluster suggestions based on what friends have joined.
   * Shows public clusters that friends are members of but user is not.
   *
   * Performance: Limits the number of friends and memberships considered
   * to avoid O(n*m) explosion with highly connected users.
   */
  async suggestClusters(_: unknown, args: SuggestClustersArgs, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);
    const limit = Math.min(args.limit ?? 10, 50);
    const offset = args.offset ?? 0;

    // Performance limits
    const MAX_FRIENDS_TO_CONSIDER = 200;
    const MAX_MEMBERSHIPS_TO_FETCH = 2000;

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

    // 2. Get clusters the current user is already a member of
    const userMemberships = await ctx.prisma.userCluster.findMany({
      where: { userId: currentUser.id },
      select: { clusterId: true },
    });
    const userClusterIds = new Set(userMemberships.map((m) => m.clusterId));

    // 3. Get clusters that friends are members of (PUBLIC only, limited)
    const friendMemberships = await ctx.prisma.userCluster.findMany({
      where: {
        userId: { in: friendIds },
      },
      include: {
        cluster: {
          select: { id: true, type: true },
        },
      },
      take: MAX_MEMBERSHIPS_TO_FETCH,
      orderBy: { createdAt: 'desc' }, // Prioritize recent joins
    });

    // Group by cluster and count friends
    const clusterFriendsMap = new Map<number, string[]>();
    for (const membership of friendMemberships) {
      // Skip if user is already a member or if it's a private cluster
      if (
        userClusterIds.has(membership.clusterId) ||
        membership.cluster.type !== 'PUBLIC'
      ) {
        continue;
      }

      const existing = clusterFriendsMap.get(membership.clusterId) ?? [];
      existing.push(membership.userId);
      clusterFriendsMap.set(membership.clusterId, existing);
    }

    // 4. Sort by friend count and paginate
    const sortedSuggestions = Array.from(clusterFriendsMap.entries())
      .map(([clusterId, friendIdsInCluster]) => ({
        clusterId,
        friendIds: friendIdsInCluster,
        friendCount: friendIdsInCluster.length,
      }))
      .sort((a, b) => b.friendCount - a.friendCount);

    const totalCount = sortedSuggestions.length;
    const paginatedSuggestions = sortedSuggestions.slice(offset, offset + limit + 1);
    const hasMore = paginatedSuggestions.length > limit;
    const finalSuggestions = hasMore ? paginatedSuggestions.slice(0, limit) : paginatedSuggestions;

    // 5. Fetch cluster data and friend users
    const clusterIds = finalSuggestions.map((s) => s.clusterId);
    const allFriendIds = [...new Set(finalSuggestions.flatMap((s) => s.friendIds.slice(0, 5)))];

    const [clusters, friendUsers] = await Promise.all([
      ctx.prisma.cluster.findMany({
        where: { id: { in: clusterIds } },
      }),
      ctx.prisma.user.findMany({
        where: { id: { in: allFriendIds } },
      }),
    ]);

    const clusterMap = new Map(clusters.map((c) => [c.id, c]));
    const friendUserMap = new Map(friendUsers.map((u) => [u.id, u]));

    const nodes = finalSuggestions
      .map((s) => {
        const cluster = clusterMap.get(s.clusterId);
        if (!cluster) return null;
        return {
          cluster,
          friendCount: s.friendCount,
          friends: s.friendIds
            .slice(0, 5)
            .map((id) => friendUserMap.get(id))
            .filter(Boolean),
        };
      })
      .filter(Boolean);

    return { nodes, totalCount, hasMore };
  },
};
