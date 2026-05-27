/**
 * Cluster membership resolvers - join, leave, list members
 */
import type { GraphQLContext } from '../../context.js';
import { requireUser, requireWriteAccess, assertFound, throwValidationError, parseNumericId } from '../../../lib/guards.js';
import { createJoinClusterUpdate } from '../../../lib/updates.js';
import type { UserClustersArgs, ClusterMembersArgs } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const membershipQueries = {
  /**
   * Get clusters a user is a member of
   */
  async userClusters(_: unknown, args: UserClustersArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [memberships, totalCount] = await Promise.all([
      ctx.prisma.userCluster.findMany({
        where: { userId: args.userId },
        take: limit + 1,
        skip: offset,
        include: { cluster: true },
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.userCluster.count({
        where: { userId: args.userId },
      }),
    ]);

    const hasMore = memberships.length > limit;
    const nodes = hasMore ? memberships.slice(0, limit) : memberships;

    return {
      nodes: nodes.map((m) => m.cluster).filter(Boolean),
      totalCount,
      hasMore,
    };
  },

  /**
   * Get members of a cluster
   */
  async clusterMembers(_: unknown, args: ClusterMembersArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;
    const clusterId = parseNumericId(args.clusterId, 'Cluster');

    const [memberships, totalCount] = await Promise.all([
      ctx.prisma.userCluster.findMany({
        where: { clusterId },
        take: limit + 1,
        skip: offset,
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      }),
      ctx.prisma.userCluster.count({
        where: { clusterId },
      }),
    ]);

    const hasMore = memberships.length > limit;
    const nodes = hasMore ? memberships.slice(0, limit) : memberships;

    return {
      nodes: nodes.map((m) => m.user).filter(Boolean),
      totalCount,
      hasMore,
    };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const membershipMutations = {
  /**
   * Join a cluster
   */
  async joinCluster(_: unknown, { clusterId }: { clusterId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const commId = parseNumericId(clusterId, 'Cluster');

    const cluster = await ctx.prisma.cluster.findUnique({
      where: { id: commId },
    });
    assertFound(cluster, 'Cluster');

    // Creator is automatically a member - cannot "join" their own cluster
    if (cluster.creatorId === currentUser.id) {
      return true; // Already a member as creator
    }

    // Check if already a member
    const existingMembership = await ctx.prisma.userCluster.findUnique({
      where: {
        userId_clusterId: {
          userId: currentUser.id,
          clusterId: commId,
        },
      },
    });
    if (existingMembership) {
      return true; // Already a member
    }

    // Handle private clusters (require invitation)
    if (cluster.type === 'PRIVATE') {
      // Check if user has a pending invitation
      const invitation = await ctx.prisma.clusterInvitation.findUnique({
        where: {
          clusterId_userId: {
            clusterId: commId,
            userId: currentUser.id,
          },
        },
      });

      if (!invitation || invitation.status !== 'PENDING') {
        throwValidationError('This is a private cluster. You need an invitation to join.');
      }

      // Accept the invitation and join
      const now = new Date();
      await ctx.prisma.$transaction([
        ctx.prisma.clusterInvitation.update({
          where: { id: invitation.id },
          data: {
            status: 'ACCEPTED',
            respondedAt: now,
          },
        }),
        ctx.prisma.userCluster.create({
          data: {
            userId: currentUser.id,
            clusterId: commId,
            createdAt: now,
            updatedAt: now,
          },
        }),
      ]);

      // Create activity update and emit live event
      await createJoinClusterUpdate(
        ctx.prisma,
        currentUser.id,
        commId,
        cluster.title,
        {
          id: currentUser.id,
          name: currentUser.name,
          profilePicture: currentUser.profilePicture,
        }
      );

      return true;
    }

    const now = new Date();
    await ctx.prisma.userCluster.create({
      data: {
        userId: currentUser.id,
        clusterId: commId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Create activity update and emit live event
    await createJoinClusterUpdate(
      ctx.prisma,
      currentUser.id,
      commId,
      cluster.title,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return true;
  },

  /**
   * Leave a cluster
   */
  async leaveCluster(_: unknown, { clusterId }: { clusterId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const commId = parseNumericId(clusterId, 'Cluster');

    const cluster = await ctx.prisma.cluster.findUnique({
      where: { id: commId },
    });
    assertFound(cluster, 'Cluster');

    // Creator cannot leave
    if (cluster.creatorId === currentUser.id) {
      throwValidationError('Cluster creator cannot leave. Transfer ownership or delete the cluster.');
    }

    // Remove membership and moderator status in a transaction
    await ctx.prisma.$transaction([
      ctx.prisma.userCluster.deleteMany({
        where: {
          userId: currentUser.id,
          clusterId: commId,
        },
      }),
      ctx.prisma.clusterModerator.deleteMany({
        where: {
          userId: currentUser.id,
          clusterId: commId,
        },
      }),
    ]);

    return true;
  },
};
