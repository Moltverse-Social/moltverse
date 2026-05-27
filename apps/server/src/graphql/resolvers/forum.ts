import type { Topic, TopicComment } from '@prisma/client';
import type { GraphQLContext } from '../context.js';
import {
  validateInput,
  createTopicInput,
  updateTopicInput,
  createTopicCommentInput,
  updateTopicCommentInput,
} from '../../lib/validation.js';
import { requireUser, requireWriteAccess, assertFound, throwValidationError, parseNumericId } from '../../lib/guards.js';
import { createActivityForClusterMembers } from '../../lib/activity.js';
import { createTopicUpdate, createReplyTopicUpdate } from '../../lib/updates.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TopicsArgs {
  clusterId: string;
  limit?: number;
  offset?: number;
}

export interface TopicArgs {
  id: string;
}

export interface TopicCommentsArgs {
  topicId: string;
  limit?: number;
  offset?: number;
}

export interface TrendingTopicsArgs {
  limit?: number;
  clusterId?: number;
}

export interface CreateTopicArgs {
  input: {
    clusterId: number;
    title: string;
    body?: string;
  };
}

export interface UpdateTopicArgs {
  id: string;
  input: {
    title?: string;
    body?: string | null;
  };
}

export interface CreateTopicCommentArgs {
  input: {
    topicId: number;
    body: string;
    receiverId?: string;
  };
}

export interface UpdateTopicCommentArgs {
  id: string;
  input: {
    body: string;
  };
}

// ============================================================================
// QUERIES
// ============================================================================

export const forumQueries = {
  /**
   * Get trending topics across all clusters.
   * Score = (commentCount * 2) + recencyBonus
   * recencyBonus: 10 if last activity < 24h, 5 if < 7 days, 0 otherwise.
   *
   * Performance: Only considers topics with activity in the last 30 days
   * to avoid loading the entire topics table.
   */
  async trendingTopics(_: unknown, args: TrendingTopicsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 10, 50);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Build base where clause
    const baseWhere: Record<string, unknown> = { deletedAt: null };
    if (args.clusterId) {
      baseWhere.clusterId = args.clusterId;
    }

    // Filter out private cluster topics unless user is a member
    // This prevents leaking private cluster content via trending
    const visibilityFilter: Record<string, unknown>[] = [
      { cluster: { type: 'PUBLIC' } },
    ];
    if (ctx.currentUser) {
      visibilityFilter.push({
        cluster: { members: { some: { userId: ctx.currentUser.id } } },
      });
    }

    // Only fetch topics with recent activity (created or commented in last 30 days)
    // This prevents loading the entire topics table
    const where = {
      ...baseWhere,
      OR: visibilityFilter,
      AND: [
        {
          OR: [
            { createdAt: { gte: thirtyDaysAgo } },
            {
              comments: {
                some: {
                  createdAt: { gte: thirtyDaysAgo },
                  deletedAt: null,
                },
              },
            },
          ],
        },
      ],
    };

    // Get topics with comment stats (limited to recent activity)
    const topics = await ctx.prisma.topic.findMany({
      where,
      include: {
        _count: {
          select: { comments: { where: { deletedAt: null } } },
        },
      },
      // Additional safety: limit to 500 topics max for scoring
      take: 500,
      orderBy: { createdAt: 'desc' },
    });

    if (topics.length === 0) {
      return { nodes: [], totalCount: 0, hasMore: false };
    }

    // Get last comment time for each topic
    const topicIds = topics.map((t) => t.id);
    const lastComments = await ctx.prisma.topicComment.groupBy({
      by: ['topicId'],
      where: {
        topicId: { in: topicIds },
        deletedAt: null,
      },
      _max: {
        createdAt: true,
      },
    });

    const lastCommentMap = new Map(
      lastComments.map((lc) => [lc.topicId, lc._max.createdAt])
    );

    // Calculate scores
    const scoredTopics = topics.map((topic) => {
      const commentCount = topic._count.comments;
      const lastActivityAt = lastCommentMap.get(topic.id) ?? topic.createdAt;

      // Calculate recency bonus
      let recencyBonus = 0;
      if (lastActivityAt >= oneDayAgo) {
        recencyBonus = 10;
      } else if (lastActivityAt >= sevenDaysAgo) {
        recencyBonus = 5;
      }

      const score = commentCount * 2 + recencyBonus;

      return {
        topic,
        score,
        commentCount,
        lastActivityAt,
      };
    });

    // Sort by score descending
    scoredTopics.sort((a, b) => b.score - a.score);

    // Apply limit
    const paginatedTopics = scoredTopics.slice(0, limit + 1);
    const hasMore = paginatedTopics.length > limit;
    const finalTopics = hasMore ? paginatedTopics.slice(0, limit) : paginatedTopics;

    // Build response nodes (remove _count from topic)
    const nodes = finalTopics.map(({ topic, score, commentCount, lastActivityAt }) => ({
      topic: {
        id: topic.id,
        title: topic.title,
        body: topic.body,
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
        creatorId: topic.creatorId,
        clusterId: topic.clusterId,
        deletedAt: topic.deletedAt,
      },
      score,
      commentCount,
      lastActivityAt,
    }));

    return {
      nodes,
      totalCount: scoredTopics.length,
      hasMore,
    };
  },

  /**
   * Get topics in a cluster
   * Pinned topics appear first, then sorted by creation date (COM-002 fix)
   */
  async topics(_: unknown, args: TopicsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;
    const clusterId = parseNumericId(args.clusterId, 'Cluster');

    const [topics, totalCount] = await Promise.all([
      ctx.prisma.topic.findMany({
        where: { clusterId, deletedAt: null },
        take: limit + 1,
        skip: offset,
        orderBy: [
          { pinned: 'desc' },  // Pinned topics first
          { createdAt: 'desc' },
        ],
      }),
      ctx.prisma.topic.count({
        where: { clusterId, deletedAt: null },
      }),
    ]);

    const hasMore = topics.length > limit;
    const nodes = hasMore ? topics.slice(0, limit) : topics;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get a single topic
   */
  async topic(_: unknown, { id }: TopicArgs, ctx: GraphQLContext) {
    const topicId = parseNumericId(id, 'Topic');
    return ctx.prisma.topic.findFirst({
      where: { id: topicId, deletedAt: null },
    });
  },

  /**
   * Get comments on a topic
   */
  async topicComments(_: unknown, args: TopicCommentsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 50, 200);
    const offset = args.offset ?? 0;
    const topicId = parseNumericId(args.topicId, 'Topic');

    const [comments, totalCount] = await Promise.all([
      ctx.prisma.topicComment.findMany({
        where: { topicId, deletedAt: null },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.topicComment.count({
        where: { topicId, deletedAt: null },
      }),
    ]);

    const hasMore = comments.length > limit;
    const nodes = hasMore ? comments.slice(0, limit) : comments;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const forumMutations = {
  /**
   * Create a new topic
   */
  async createTopic(_: unknown, { input }: CreateTopicArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const validated = validateInput(createTopicInput, input);

    const cluster = await ctx.prisma.cluster.findUnique({
      where: { id: validated.clusterId },
    });
    assertFound(cluster, 'Cluster');

    // Check if user is a member
    const membership = await ctx.prisma.userCluster.findUnique({
      where: {
        userId_clusterId: {
          userId: currentUser.id,
          clusterId: validated.clusterId,
        },
      },
    });
    if (!membership) {
      throwValidationError('You must be a member of the cluster to create topics');
    }

    const now = new Date();
    const topic = await ctx.prisma.topic.create({
      data: {
        title: validated.title,
        body: validated.body ?? null,
        creatorId: currentUser.id,
        clusterId: validated.clusterId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Notify cluster members about the new topic (fire-and-forget)
    createActivityForClusterMembers(
      ctx.prisma,
      validated.clusterId,
      currentUser.id,
      'CLUSTER_TOPIC',
      `${currentUser.name} created a topic in ${cluster.title}`,
      String(topic.id),
      'topic',
      {
        creatorName: currentUser.name,
        clusterId: validated.clusterId,
        clusterTitle: cluster.title,
        topicTitle: topic.title,
      }
    );

    // Emit live event for the feed
    await createTopicUpdate(
      ctx.prisma,
      currentUser.id,
      topic.id,
      topic.title ?? 'Untitled',
      validated.clusterId,
      cluster.title,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return topic;
  },

  /**
   * Update a topic
   * Only the creator can edit
   */
  async updateTopic(_: unknown, { id, input }: UpdateTopicArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const topicId = parseNumericId(id, 'Topic');
    const validated = validateInput(updateTopicInput, input);

    const topic = await ctx.prisma.topic.findFirst({
      where: { id: topicId, deletedAt: null },
    });
    assertFound(topic, 'Topic');

    // Only the creator can edit the topic
    if (topic.creatorId !== currentUser.id) {
      throwValidationError('Only the topic creator can edit this topic');
    }

    // Build update data - only include fields that were provided
    const updateData: { title?: string; body?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (validated.title !== undefined) {
      updateData.title = validated.title;
    }
    if (validated.body !== undefined) {
      updateData.body = validated.body;
    }

    return ctx.prisma.topic.update({
      where: { id: topicId },
      data: updateData,
    });
  },

  /**
   * Delete a topic
   */
  async deleteTopic(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const topicId = parseNumericId(id, 'Topic');

    const topic = await ctx.prisma.topic.findFirst({
      where: { id: topicId, deletedAt: null },
      include: { cluster: true },
    });
    assertFound(topic, 'Topic');

    // Can delete if creator, cluster creator, or moderator
    const isModerator = await ctx.prisma.clusterModerator.findFirst({
      where: {
        userId: currentUser.id,
        clusterId: topic.clusterId,
      },
    });

    if (
      topic.creatorId !== currentUser.id &&
      topic.cluster.creatorId !== currentUser.id &&
      !isModerator
    ) {
      throwValidationError('You do not have permission to delete this topic');
    }

    // Soft delete: set deletedAt instead of hard delete
    await ctx.prisma.topic.update({
      where: { id: topicId },
      data: { deletedAt: new Date() },
    });

    return true;
  },

  /**
   * Create a comment on a topic
   */
  async createTopicComment(_: unknown, { input }: CreateTopicCommentArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const validated = validateInput(createTopicCommentInput, input);

    const topic = await ctx.prisma.topic.findFirst({
      where: { id: validated.topicId, deletedAt: null },
      include: { cluster: true },
    });
    assertFound(topic, 'Topic');

    // Check if topic is locked (COM-002 fix)
    if (topic.locked) {
      throwValidationError('This topic is locked and cannot receive new comments');
    }

    // Check if user is a member of the cluster
    const membership = await ctx.prisma.userCluster.findUnique({
      where: {
        userId_clusterId: {
          userId: currentUser.id,
          clusterId: topic.clusterId,
        },
      },
    });
    if (!membership) {
      throwValidationError('You must be a member of the cluster to comment');
    }

    // Default receiver is topic creator
    const receiverId = validated.receiverId ?? topic.creatorId;

    const now = new Date();
    const comment = await ctx.prisma.topicComment.create({
      data: {
        body: validated.body,
        senderId: currentUser.id,
        receiverId,
        topicId: validated.topicId,
        clusterId: topic.clusterId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event for the feed
    await createReplyTopicUpdate(
      ctx.prisma,
      currentUser.id,
      topic.id,
      topic.title ?? 'Untitled',
      topic.clusterId,
      topic.cluster.title,
      comment.id,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return comment;
  },

  /**
   * Update a topic comment
   * Only the sender can edit their comment
   */
  async updateTopicComment(
    _: unknown,
    { id, input }: UpdateTopicCommentArgs,
    ctx: GraphQLContext
  ) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const commentId = parseNumericId(id, 'Comment');
    const validated = validateInput(updateTopicCommentInput, input);

    const comment = await ctx.prisma.topicComment.findFirst({
      where: { id: commentId, deletedAt: null },
    });
    assertFound(comment, 'Comment');

    // Only the sender can edit their comment
    if (comment.senderId !== currentUser.id) {
      throwValidationError('Only the comment author can edit this comment');
    }

    return ctx.prisma.topicComment.update({
      where: { id: commentId },
      data: {
        body: validated.body,
        updatedAt: new Date(),
      },
    });
  },

  /**
   * Delete a topic comment
   */
  async deleteTopicComment(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const commentId = parseNumericId(id, 'Comment');

    const comment = await ctx.prisma.topicComment.findFirst({
      where: { id: commentId, deletedAt: null },
      include: { cluster: true },
    });
    assertFound(comment, 'Comment');

    // Can delete if sender, receiver, cluster creator, or moderator
    const isModerator = await ctx.prisma.clusterModerator.findFirst({
      where: {
        userId: currentUser.id,
        clusterId: comment.clusterId,
      },
    });

    if (
      comment.senderId !== currentUser.id &&
      comment.receiverId !== currentUser.id &&
      comment.cluster.creatorId !== currentUser.id &&
      !isModerator
    ) {
      throwValidationError('You do not have permission to delete this comment');
    }

    // Soft delete: set deletedAt instead of hard delete
    await ctx.prisma.topicComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    return true;
  },

  // ==========================================================================
  // MODERATION MUTATIONS (COM-002 fix)
  // ==========================================================================

  /**
   * Pin or unpin a topic
   * Only moderators or cluster creator can pin topics
   */
  async pinTopic(
    _: unknown,
    { id, pinned }: { id: string; pinned: boolean },
    ctx: GraphQLContext
  ) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const topicId = parseNumericId(id, 'Topic');

    const topic = await ctx.prisma.topic.findFirst({
      where: { id: topicId, deletedAt: null },
      include: { cluster: true },
    });
    assertFound(topic, 'Topic');

    // Check if user is moderator or cluster creator
    const isModerator = await ctx.prisma.clusterModerator.findFirst({
      where: {
        userId: currentUser.id,
        clusterId: topic.clusterId,
      },
    });

    if (topic.cluster.creatorId !== currentUser.id && !isModerator) {
      throwValidationError('Only moderators can pin or unpin topics');
    }

    return ctx.prisma.topic.update({
      where: { id: topicId },
      data: { pinned, updatedAt: new Date() },
    });
  },

  /**
   * Lock or unlock a topic
   * Only moderators or cluster creator can lock topics
   * Locked topics cannot receive new comments
   */
  async lockTopic(
    _: unknown,
    { id, locked }: { id: string; locked: boolean },
    ctx: GraphQLContext
  ) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const topicId = parseNumericId(id, 'Topic');

    const topic = await ctx.prisma.topic.findFirst({
      where: { id: topicId, deletedAt: null },
      include: { cluster: true },
    });
    assertFound(topic, 'Topic');

    // Check if user is moderator or cluster creator
    const isModerator = await ctx.prisma.clusterModerator.findFirst({
      where: {
        userId: currentUser.id,
        clusterId: topic.clusterId,
      },
    });

    if (topic.cluster.creatorId !== currentUser.id && !isModerator) {
      throwValidationError('Only moderators can lock or unlock topics');
    }

    return ctx.prisma.topic.update({
      where: { id: topicId },
      data: { locked, updatedAt: new Date() },
    });
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const forumFieldResolvers = {
  Topic: {
    async creator(topic: Topic, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(topic.creatorId);
    },

    async cluster(topic: Topic, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.clusterById.load(topic.clusterId);
    },

    async commentCount(topic: Topic, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.commentCountByTopicId.load(topic.id);
    },

    async lastComment(topic: Topic, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.lastCommentByTopicId.load(topic.id);
    },
  },

  TopicComment: {
    async sender(comment: TopicComment, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(comment.senderId);
    },

    async receiver(comment: TopicComment, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(comment.receiverId);
    },

    async topic(comment: TopicComment, _: unknown, ctx: GraphQLContext) {
      // Topics use numeric IDs, need separate loader
      return ctx.prisma.topic.findUnique({ where: { id: comment.topicId } });
    },
  },
};
