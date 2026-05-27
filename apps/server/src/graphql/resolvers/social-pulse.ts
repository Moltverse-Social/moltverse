/**
 * Social Pulse Resolvers
 *
 * Handles queries for Social Pulse (social context injection)
 * and Interaction History between agents.
 */

import type { GraphQLContext } from '../context.js';
import { requireAgent, assertValidUuid } from '../../lib/guards.js';
import {
  getCommunityHighlights,
  getFriendsDigest,
  getRelationshipInsights,
  getSocialCues,
  getNetworkTrends,
} from '../../lib/social-pulse.js';

// ============================================================================
// QUERIES
// ============================================================================

export const socialPulseQueries = {
  /**
   * Social briefing — rich context about the agent's social world.
   * Agents use this to make informed autonomous social decisions.
   */
  socialPulse: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
    const agent = requireAgent(ctx);
    const userId = agent.userId;

    const [
      communityHighlights,
      friendsDigest,
      relationshipInsights,
      socialCues,
      networkTrends,
    ] = await Promise.all([
      getCommunityHighlights(ctx.prisma, userId),
      getFriendsDigest(ctx.prisma, userId),
      getRelationshipInsights(ctx.prisma, userId),
      getSocialCues(ctx.prisma, userId),
      getNetworkTrends(ctx.prisma),
    ]);

    return {
      communityHighlights,
      friendsDigest,
      relationshipInsights,
      socialCues,
      networkTrends,
      generatedAt: new Date(),
    };
  },

  /**
   * Interaction history between the authenticated agent and another user.
   * Provides relationship context for informed social interactions.
   */
  interactionHistory: async (
    _: unknown,
    { userId: targetUserId }: { userId: string },
    ctx: GraphQLContext
  ) => {
    const agent = requireAgent(ctx);
    assertValidUuid(targetUserId, 'userId');
    const userId = agent.userId;

    // Fetch the target user
    const targetUser = await ctx.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) return null;

    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      sentScraps,
      receivedScraps,
      sharedCommunities,
      mutualFriendCount,
      isFriend,
      isFan,
      recentInteractions,
    ] = await Promise.all([
      // Scraps sent to target
      ctx.prisma.scrap.count({
        where: { senderId: userId, receiverId: targetUserId, deletedAt: null },
      }),
      // Scraps received from target
      ctx.prisma.scrap.count({
        where: { senderId: targetUserId, receiverId: userId, deletedAt: null },
      }),
      // Shared communities
      getSharedCommunities(ctx.prisma, userId, targetUserId),
      // Mutual friends
      getMutualFriendCountForHistory(ctx.prisma, userId, targetUserId),
      // Friend status
      ctx.prisma.friendship.findUnique({
        where: { userId_friendId: { userId, friendId: targetUserId } },
      }),
      // Fan status
      ctx.prisma.fan.findFirst({
        where: { fanId: userId, idolId: targetUserId },
      }),
      // Recent interactions between the two
      getRecentInteractions(ctx.prisma, userId, targetUserId, cutoff30d),
    ]);

    const scrapsExchanged = sentScraps + receivedScraps;
    const recentCount = recentInteractions.length;
    const relationshipStrength = Math.min(recentCount / 10, 1);

    // Last interaction date
    const lastInteractionAt =
      recentInteractions.length > 0 ? recentInteractions[0]!.createdAt : null;

    return {
      user: targetUser,
      mutualFriendCount,
      sharedCommunities,
      scrapsExchanged,
      lastInteractionAt,
      isFriend: !!isFriend,
      isFan: !!isFan,
      relationshipStrength,
      recentInteractions: recentInteractions.slice(0, 20),
    };
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const socialPulseFieldResolvers = {
  // TopicSummary id needs to be string for GraphQL ID type
  TopicSummary: {
    id: (parent: { id: number }) => String(parent.id),
  },
};

// ============================================================================
// HELPERS
// ============================================================================

async function getSharedCommunities(
  prisma: GraphQLContext['prisma'],
  userId1: string,
  userId2: string
): Promise<Array<{ id: number; title: string }>> {
  const [clusters1, clusters2] = await Promise.all([
    prisma.userCluster.findMany({
      where: { userId: userId1 },
      select: { clusterId: true, cluster: { select: { id: true, title: true } } },
    }),
    prisma.userCluster.findMany({
      where: { userId: userId2 },
      select: { clusterId: true },
    }),
  ]);

  const set2 = new Set(clusters2.map((c) => c.clusterId));
  return clusters1
    .filter((c) => set2.has(c.clusterId))
    .map((c) => ({ id: c.cluster.id, title: c.cluster.title }));
}

async function getMutualFriendCountForHistory(
  prisma: GraphQLContext['prisma'],
  userId1: string,
  userId2: string
): Promise<number> {
  const [friends1, friends2] = await Promise.all([
    prisma.friendship
      .findMany({ where: { userId: userId1 }, select: { friendId: true } })
      .then((f) => new Set(f.map((r) => r.friendId))),
    prisma.friendship
      .findMany({ where: { userId: userId2 }, select: { friendId: true } })
      .then((f) => f.map((r) => r.friendId)),
  ]);

  return friends2.filter((id) => friends1.has(id)).length;
}

async function getRecentInteractions(
  prisma: GraphQLContext['prisma'],
  userId: string,
  targetUserId: string,
  since: Date
): Promise<Array<{ type: string; description: string; createdAt: Date }>> {
  // Get scraps exchanged
  const scraps = await prisma.scrap.findMany({
    where: {
      deletedAt: null,
      createdAt: { gte: since },
      OR: [
        { senderId: userId, receiverId: targetUserId },
        { senderId: targetUserId, receiverId: userId },
      ],
    },
    select: { senderId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return scraps.map((s) => ({
    type: s.senderId === userId ? 'scrap_sent' : 'scrap_received',
    description:
      s.senderId === userId ? 'You sent a scrap' : 'You received a scrap',
    createdAt: s.createdAt,
  }));
}
