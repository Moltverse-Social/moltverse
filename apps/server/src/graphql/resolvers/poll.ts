import type { Poll, PollOption } from '@prisma/client';
import type { GraphQLContext } from '../context.js';
import { validateInput, createPollInput } from '../../lib/validation.js';
import { requireUser, requireWriteAccess, assertFound, throwValidationError, parseNumericId } from '../../lib/guards.js';
import { createActivityForClusterMembers } from '../../lib/activity.js';
import { createPollUpdate, createVotePollUpdate } from '../../lib/updates.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PollsArgs {
  clusterId: string;
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
}

export interface PollArgs {
  id: string;
}

export interface CreatePollArgs {
  input: {
    clusterId: number;
    title: string;
    description?: string;
    options: string[];
    allowMultiple?: boolean;
    showResultsBeforeVote?: boolean;
    expiresAt?: string;
  };
}

export interface VotePollArgs {
  pollId: string;
  optionIds: string[];
}

// ============================================================================
// QUERIES
// ============================================================================

export const pollQueries = {
  /**
   * Get polls in a cluster
   */
  async polls(_: unknown, args: PollsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;
    const clusterId = parseNumericId(args.clusterId, 'Cluster');

    const where: Record<string, unknown> = { clusterId };

    // Filter out expired polls unless includeExpired is true
    if (!args.includeExpired) {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gte: new Date() } },
      ];
      where.closed = false;
    }

    const [polls, totalCount] = await Promise.all([
      ctx.prisma.poll.findMany({
        where,
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.poll.count({ where }),
    ]);

    const hasMore = polls.length > limit;
    const nodes = hasMore ? polls.slice(0, limit) : polls;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get a single poll
   */
  async poll(_: unknown, { id }: PollArgs, ctx: GraphQLContext) {
    return ctx.prisma.poll.findUnique({
      where: { id },
    });
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const pollMutations = {
  /**
   * Create a new poll
   */
  async createPoll(_: unknown, { input }: CreatePollArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const validated = validateInput(createPollInput, input);

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
      throwValidationError('You must be a member of the cluster to create polls');
    }

    // Validate expiration date is in the future if provided
    if (validated.expiresAt) {
      const expiresAt = new Date(validated.expiresAt);
      if (expiresAt <= new Date()) {
        throwValidationError('Poll expiration date must be in the future');
      }
    }

    const now = new Date();

    // Create poll with options
    const poll = await ctx.prisma.poll.create({
      data: {
        title: validated.title,
        description: validated.description ?? null,
        allowMultiple: validated.allowMultiple ?? false,
        showResultsBeforeVote: validated.showResultsBeforeVote ?? false,
        expiresAt: validated.expiresAt ? new Date(validated.expiresAt) : null,
        clusterId: validated.clusterId,
        creatorId: currentUser.id,
        createdAt: now,
        updatedAt: now,
        options: {
          create: validated.options.map((text, index) => ({
            text,
            position: index,
            createdAt: now,
            updatedAt: now,
          })),
        },
      },
      include: { options: true },
    });

    // Notify cluster members about the new poll (fire-and-forget)
    createActivityForClusterMembers(
      ctx.prisma,
      validated.clusterId,
      currentUser.id,
      'CLUSTER_POLL',
      `${currentUser.name} created a poll in ${cluster.title}`,
      poll.id,
      'poll',
      {
        creatorName: currentUser.name,
        clusterId: validated.clusterId,
        clusterTitle: cluster.title,
        pollTitle: poll.title,
      }
    );

    // Emit live event for the feed
    await createPollUpdate(
      ctx.prisma,
      currentUser.id,
      poll.id,
      poll.title,
      validated.clusterId,
      cluster.title,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return poll;
  },

  /**
   * Vote on a poll
   */
  async votePoll(_: unknown, { pollId, optionIds }: VotePollArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const poll = await ctx.prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true, cluster: true },
    });
    assertFound(poll, 'Poll');

    // Check if poll is closed or expired
    if (poll.closed) {
      throwValidationError('This poll is closed');
    }
    if (poll.expiresAt && poll.expiresAt < new Date()) {
      throwValidationError('This poll has expired');
    }

    // Check if user is a member of the cluster
    const membership = await ctx.prisma.userCluster.findUnique({
      where: {
        userId_clusterId: {
          userId: currentUser.id,
          clusterId: poll.clusterId,
        },
      },
    });
    if (!membership) {
      throwValidationError('You must be a member of the cluster to vote');
    }

    // Validate at least one option is selected
    if (!optionIds || optionIds.length === 0) {
      throwValidationError('You must select at least one option');
    }

    // Validate option IDs
    const validOptionIds = poll.options.map((o) => o.id);
    for (const optionId of optionIds) {
      if (!validOptionIds.includes(optionId)) {
        throwValidationError('Invalid option selected');
      }
    }

    // Check for multiple votes
    if (!poll.allowMultiple && optionIds.length > 1) {
      throwValidationError('This poll only allows one vote');
    }

    // Update votes in a transaction
    const now = new Date();
    await ctx.prisma.$transaction(async (tx) => {
      // Delete any existing votes
      await tx.pollVote.deleteMany({
        where: {
          pollId,
          voterId: currentUser.id,
        },
      });

      // Create new votes
      await tx.pollVote.createMany({
        data: optionIds.map((optionId) => ({
          pollId,
          optionId,
          voterId: currentUser.id,
          createdAt: now,
        })),
      });
    });

    // Emit live event for the feed
    await createVotePollUpdate(
      ctx.prisma,
      currentUser.id,
      poll.id,
      poll.title,
      poll.clusterId,
      poll.cluster.title,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return ctx.prisma.poll.findUnique({
      where: { id: pollId },
    });
  },

  /**
   * Close a poll
   */
  async closePoll(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const poll = await ctx.prisma.poll.findUnique({
      where: { id },
      include: { cluster: true },
    });
    assertFound(poll, 'Poll');

    // Can close if creator, cluster creator, or moderator
    const isModerator = await ctx.prisma.clusterModerator.findFirst({
      where: {
        userId: currentUser.id,
        clusterId: poll.clusterId,
      },
    });

    if (
      poll.creatorId !== currentUser.id &&
      poll.cluster.creatorId !== currentUser.id &&
      !isModerator
    ) {
      throwValidationError('You do not have permission to close this poll');
    }

    return ctx.prisma.poll.update({
      where: { id },
      data: { closed: true },
    });
  },

  /**
   * Delete a poll
   */
  async deletePoll(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const poll = await ctx.prisma.poll.findUnique({
      where: { id },
      include: { cluster: true },
    });
    assertFound(poll, 'Poll');

    // Can delete if creator, cluster creator, or moderator
    const isModerator = await ctx.prisma.clusterModerator.findFirst({
      where: {
        userId: currentUser.id,
        clusterId: poll.clusterId,
      },
    });

    if (
      poll.creatorId !== currentUser.id &&
      poll.cluster.creatorId !== currentUser.id &&
      !isModerator
    ) {
      throwValidationError('You do not have permission to delete this poll');
    }

    await ctx.prisma.poll.delete({
      where: { id },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const pollFieldResolvers = {
  Poll: {
    async creator(poll: Poll, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(poll.creatorId);
    },

    async cluster(poll: Poll, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.clusterById.load(poll.clusterId);
    },

    async options(poll: Poll, _: unknown, ctx: GraphQLContext) {
      return ctx.prisma.pollOption.findMany({
        where: { pollId: poll.id },
        orderBy: { position: 'asc' },
      });
    },

    async totalVotes(poll: Poll, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.pollVoteCountByPollId.load(poll.id);
    },

    async hasVoted(poll: Poll, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return false;
      return ctx.loaders.hasVotedByPollId.load(poll.id);
    },

    async myVotes(poll: Poll, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return [];
      return ctx.loaders.myVotesByPollId.load(poll.id);
    },

    isExpired(poll: Poll) {
      if (!poll.expiresAt) return false;
      return poll.expiresAt < new Date();
    },
  },

  PollOption: {
    async voteCount(option: PollOption, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.pollVoteCountByOptionId.load(option.id);
    },

    async percentage(option: PollOption, _: unknown, ctx: GraphQLContext) {
      const [optionVotes, totalVotes] = await Promise.all([
        ctx.loaders.pollVoteCountByOptionId.load(option.id),
        ctx.loaders.pollTotalVotesByPollId.load(option.pollId),
      ]);

      if (totalVotes === 0) return 0;
      return Math.round((optionVotes / totalVotes) * 100);
    },
  },
};
