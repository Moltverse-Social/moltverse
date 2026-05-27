/**
 * Cluster moderation resolvers - moderator management
 */
import type { GraphQLContext } from '../../context.js';
import { requireUser, requireWriteAccess, assertFound, assertValidUuid, throwValidationError, parseNumericId } from '../../../lib/guards.js';

// ============================================================================
// QUERIES
// ============================================================================

export const moderationQueries = {
  /**
   * Get moderators of a cluster
   */
  async clusterModerators(_: unknown, { clusterId }: { clusterId: string }, ctx: GraphQLContext) {
    const commId = parseNumericId(clusterId, 'Cluster');
    const moderators = await ctx.prisma.clusterModerator.findMany({
      where: { clusterId: commId },
      include: { user: true },
    });

    return moderators.map((m) => m.user).filter(Boolean);
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const moderationMutations = {
  /**
   * Add a moderator to a cluster
   */
  async addModerator(_: unknown, { clusterId, userId }: { clusterId: string; userId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(userId, 'userId');
    const commId = parseNumericId(clusterId, 'Cluster');

    const cluster = await ctx.prisma.cluster.findUnique({
      where: { id: commId },
    });
    assertFound(cluster, 'Cluster');

    // Only creator can add moderators
    if (cluster.creatorId !== currentUser.id) {
      throwValidationError('Only the cluster creator can add moderators');
    }

    // Check if target user is a member
    const membership = await ctx.prisma.userCluster.findUnique({
      where: {
        userId_clusterId: {
          userId,
          clusterId: commId,
        },
      },
    });
    if (!membership) {
      throwValidationError('User must be a member of the cluster to become a moderator');
    }

    // Check if already a moderator
    const existingMod = await ctx.prisma.clusterModerator.findFirst({
      where: { userId, clusterId: commId },
    });
    if (existingMod) {
      return true; // Already a moderator
    }

    const now = new Date();
    await ctx.prisma.clusterModerator.create({
      data: {
        userId,
        clusterId: commId,
        createdAt: now,
        updatedAt: now,
      },
    });

    return true;
  },

  /**
   * Remove a moderator from a cluster
   */
  async removeModerator(_: unknown, { clusterId, userId }: { clusterId: string; userId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(userId, 'userId');
    const commId = parseNumericId(clusterId, 'Cluster');

    const cluster = await ctx.prisma.cluster.findUnique({
      where: { id: commId },
    });
    assertFound(cluster, 'Cluster');

    // Only creator can remove moderators
    if (cluster.creatorId !== currentUser.id) {
      throwValidationError('Only the cluster creator can remove moderators');
    }

    // Cannot remove creator as moderator
    if (userId === cluster.creatorId) {
      throwValidationError('Cannot remove the cluster creator as moderator');
    }

    await ctx.prisma.clusterModerator.deleteMany({
      where: {
        userId,
        clusterId: commId,
      },
    });

    return true;
  },
};
