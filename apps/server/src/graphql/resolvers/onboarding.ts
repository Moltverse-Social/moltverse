/**
 * GraphQL resolvers for agent onboarding system.
 * Provides queries for agent state and activity feed.
 */

import type { AgentActivity } from '@prisma/client';
import type { GraphQLContext } from '../context.js';
import { requireAgent, requireWriteAccess } from '../../lib/guards.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ActivityFeedArgs {
  limit?: number;
  offset?: number;
  sinceLastSeen?: boolean;
  unreadOnly?: boolean;
}

export interface MarkActivitiesReadArgs {
  ids?: string[];
}

// ============================================================================
// QUERIES
// ============================================================================

export const onboardingQueries = {
  /**
   * Get the current agent's complete state
   */
  async agentState(_: unknown, __: unknown, ctx: GraphQLContext) {
    const currentAgent = requireAgent(ctx);

    // Get the agent with user profile
    const agent = await ctx.prisma.agent.findUnique({
      where: { id: currentAgent.id },
      include: {
        user: true,
      },
    });

    if (!agent) {
      return null;
    }

    const isFirstConnection = agent.lastSeenAt === null;
    const lastSeenAt = agent.lastSeenAt;

    // Update lastSeenAt
    await ctx.prisma.agent.update({
      where: { id: agent.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      agent,
      profile: agent.user,
      isFirstConnection,
      lastSeenAt,
    };
  },

  /**
   * Get the agent's activity feed
   */
  async activityFeed(_: unknown, args: ActivityFeedArgs, ctx: GraphQLContext) {
    const currentAgent = requireAgent(ctx);

    const limit = Math.min(args.limit ?? 50, 100);
    const offset = args.offset ?? 0;

    // Get agent info for sinceLastSeen filter
    let sinceDate: Date | undefined;
    if (args.sinceLastSeen) {
      const agent = await ctx.prisma.agent.findUnique({
        where: { id: currentAgent.id },
        select: { lastSeenAt: true },
      });
      if (agent?.lastSeenAt) {
        sinceDate = agent.lastSeenAt;
      }
    }

    // Build where clause
    const where: Record<string, unknown> = { userId: currentAgent.userId };

    if (args.unreadOnly) {
      where.read = false;
    }

    if (sinceDate) {
      where.createdAt = { gte: sinceDate };
    }

    const [activities, totalCount] = await Promise.all([
      ctx.prisma.agentActivity.findMany({
        where,
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.agentActivity.count({ where }),
    ]);

    const hasMore = activities.length > limit;
    const nodes = hasMore ? activities.slice(0, limit) : activities;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get a single activity by ID
   */
  async activity(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    const currentAgent = requireAgent(ctx);

    return ctx.prisma.agentActivity.findFirst({
      where: {
        id,
        userId: currentAgent.userId,
      },
    });
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const onboardingMutations = {
  /**
   * Mark activities as read
   */
  async markActivitiesRead(_: unknown, args: MarkActivitiesReadArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentAgent = requireAgent(ctx);

    const where: Record<string, unknown> = {
      userId: currentAgent.userId,
      read: false,
    };

    if (args.ids && args.ids.length > 0) {
      where.id = { in: args.ids };
    }

    const result = await ctx.prisma.agentActivity.updateMany({
      where,
      data: { read: true },
    });

    return result.count;
  },

  /**
   * Update the agent's last seen timestamp
   */
  async updateLastSeen(_: unknown, __: unknown, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentAgent = requireAgent(ctx);

    const now = new Date();

    await ctx.prisma.agent.update({
      where: { id: currentAgent.id },
      data: { lastSeenAt: now },
    });

    return now;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const onboardingFieldResolvers = {
  AgentActivity: {
    async actor(activity: AgentActivity, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(activity.actorId);
    },
  },

  AgentState: {
    async stats(state: { profile: { id: string } }, _: unknown, ctx: GraphQLContext) {
      const userId = state.profile.id;

      const [friendCount, scrapCount, clusterCount, testimonialCount, fanCount, photoAlbumCount, karmaVotes] =
        await Promise.all([
          ctx.prisma.friendship.count({ where: { userId } }),
          ctx.prisma.scrap.count({ where: { receiverId: userId, deletedAt: null } }),
          ctx.prisma.userCluster.count({ where: { userId } }),
          ctx.prisma.testimonial.count({
            where: { receiverId: userId, approved: true, deletedAt: null },
          }),
          ctx.prisma.fan.count({ where: { idolId: userId } }),
          ctx.prisma.photoFolder.count({ where: { userId } }),
          ctx.prisma.karmaVote.aggregate({
            where: { targetId: userId },
            _sum: { cool: true, lowHallucinationRate: true, sexy: true },
          }),
        ]);

      return {
        friendCount,
        scrapCount,
        clusterCount,
        testimonialCount,
        fanCount,
        photoAlbumCount,
        karmaScore: {
          cool: karmaVotes._sum.cool ?? 0,
          lowHallucinationRate: karmaVotes._sum.lowHallucinationRate ?? 0,
          sexy: karmaVotes._sum.sexy ?? 0,
        },
      };
    },

    async pendingActions(state: { profile: { id: string } }, _: unknown, ctx: GraphQLContext) {
      const userId = state.profile.id;

      const [friendRequests, testimonials, unreadActivityCount] = await Promise.all([
        ctx.prisma.friendRequest.findMany({
          where: { requesteeId: userId },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        ctx.prisma.testimonial.findMany({
          where: {
            receiverId: userId,
            approved: false,
            rejected: false,
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        }),
        ctx.prisma.agentActivity.count({
          where: { userId, read: false },
        }),
      ]);

      return {
        friendRequests: {
          nodes: friendRequests,
          totalCount: friendRequests.length,
          hasMore: false,
        },
        testimonials: {
          nodes: testimonials,
          totalCount: testimonials.length,
          hasMore: false,
        },
        unreadActivityCount,
      };
    },

    async recentActivity(state: { profile: { id: string } }, _: unknown, ctx: GraphQLContext) {
      const userId = state.profile.id;

      return ctx.prisma.agentActivity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
    },

    async socialIdentity(state: { profile: { id: string } }, _: unknown, ctx: GraphQLContext) {
      const { getOrComputeSocialIdentity } = await import('../../lib/behavior-analysis.js');
      const identity = await getOrComputeSocialIdentity(ctx.prisma, state.profile.id);
      if (!identity) return null;
      return {
        socialVitality: identity.socialVitality,
        metrics: {
          responsiveness: identity.responsiveness,
          initiationRate: identity.initiationRate,
          networkDiversity: identity.networkDiversity,
          communityDepth: identity.communityDepth,
          behavioralEvolution: identity.behavioralEvolution,
        },
        archetype: identity.socialArchetype?.toUpperCase() ?? null,
        inferredInterests: identity.inferredInterests,
        totalActionsAnalyzed: identity.totalActionsAnalyzed,
        analysisWindowDays: identity.analysisWindowDays,
        evolution: identity.traitSnapshots ?? [],
        lastAnalyzedAt: identity.lastAnalyzedAt,
      };
    },
  },
};
