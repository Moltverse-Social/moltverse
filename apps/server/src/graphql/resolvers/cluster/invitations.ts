/**
 * Cluster invitation resolvers - private cluster invitations
 */
import type { GraphQLContext } from '../../context.js';
import { requireUser, requireWriteAccess, assertFound, assertValidUuid, throwValidationError, parseNumericId } from '../../../lib/guards.js';
import { createJoinClusterUpdate } from '../../../lib/updates.js';
import type { PaginationArgs, SendClusterInvitationArgs } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const invitationQueries = {
  /**
   * Get pending invitations for the current user
   */
  async pendingClusterInvitations(_: unknown, args: PaginationArgs, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [invitations, totalCount] = await Promise.all([
      ctx.prisma.clusterInvitation.findMany({
        where: {
          userId: currentUser.id,
          status: 'PENDING',
        },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          cluster: true,
          sentBy: true,
        },
      }),
      ctx.prisma.clusterInvitation.count({
        where: {
          userId: currentUser.id,
          status: 'PENDING',
        },
      }),
    ]);

    const hasMore = invitations.length > limit;
    const nodes = hasMore ? invitations.slice(0, limit) : invitations;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get invitations sent by the current user for a cluster
   */
  async sentClusterInvitations(_: unknown, { clusterId, ...args }: { clusterId: string } & PaginationArgs, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);
    const commId = parseNumericId(clusterId, 'Cluster');
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    // Check if user is moderator or creator
    const cluster = await ctx.prisma.cluster.findUnique({
      where: { id: commId },
    });
    assertFound(cluster, 'Cluster');

    const isMod = await ctx.prisma.clusterModerator.findFirst({
      where: { clusterId: commId, userId: currentUser.id },
    });
    if (cluster.creatorId !== currentUser.id && !isMod) {
      throwValidationError('Only moderators can view sent invitations');
    }

    const [invitations, totalCount] = await Promise.all([
      ctx.prisma.clusterInvitation.findMany({
        where: {
          clusterId: commId,
          status: 'PENDING',
        },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          user: true,
          sentBy: true,
        },
      }),
      ctx.prisma.clusterInvitation.count({
        where: {
          clusterId: commId,
          status: 'PENDING',
        },
      }),
    ]);

    const hasMore = invitations.length > limit;
    const nodes = hasMore ? invitations.slice(0, limit) : invitations;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const invitationMutations = {
  /**
   * Send an invitation to join a private cluster
   * Any member can invite others to grow the cluster (COM-003 fix)
   */
  async sendClusterInvitation(_: unknown, { input }: SendClusterInvitationArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    assertValidUuid(input.userId, 'userId');
    const commId = parseNumericId(input.clusterId, 'Cluster');

    // Check cluster exists and is private
    const cluster = await ctx.prisma.cluster.findUnique({
      where: { id: commId },
    });
    assertFound(cluster, 'Cluster');

    if (cluster.type !== 'PRIVATE') {
      throwValidationError('Invitations are only for private clusters');
    }

    // Check if sender is a member of the cluster (COM-003 fix)
    // Any member can invite others to encourage cluster growth
    const membership = await ctx.prisma.userCluster.findUnique({
      where: {
        userId_clusterId: {
          userId: currentUser.id,
          clusterId: commId,
        },
      },
    });
    if (!membership) {
      throwValidationError('You must be a member of the cluster to send invitations');
    }

    // Check if target user exists
    const targetUser = await ctx.prisma.user.findUnique({
      where: { id: input.userId },
    });
    assertFound(targetUser, 'User');

    // Check if user is already a member
    const existingMembership = await ctx.prisma.userCluster.findUnique({
      where: {
        userId_clusterId: {
          userId: input.userId,
          clusterId: commId,
        },
      },
    });
    if (existingMembership) {
      throwValidationError('User is already a member of this cluster');
    }

    // Check for existing pending invitation
    const existingInvitation = await ctx.prisma.clusterInvitation.findUnique({
      where: {
        clusterId_userId: {
          clusterId: commId,
          userId: input.userId,
        },
      },
    });
    if (existingInvitation && existingInvitation.status === 'PENDING') {
      throwValidationError('An invitation has already been sent to this user');
    }

    // Create or update invitation
    const invitation = await ctx.prisma.clusterInvitation.upsert({
      where: {
        clusterId_userId: {
          clusterId: commId,
          userId: input.userId,
        },
      },
      create: {
        clusterId: commId,
        userId: input.userId,
        sentById: currentUser.id,
        message: input.message ?? null,
        status: 'PENDING',
      },
      update: {
        status: 'PENDING',
        message: input.message ?? null,
        sentById: currentUser.id,
        respondedAt: null,
      },
      include: {
        cluster: true,
        user: true,
        sentBy: true,
      },
    });

    return invitation;
  },

  /**
   * Accept a cluster invitation
   */
  async acceptClusterInvitation(_: unknown, { invitationId }: { invitationId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const invitation = await ctx.prisma.clusterInvitation.findUnique({
      where: { id: invitationId },
      include: { cluster: true },
    });
    assertFound(invitation, 'Invitation');

    // Only the invited user can accept
    if (invitation.userId !== currentUser.id) {
      throwValidationError('You can only accept your own invitations');
    }

    if (invitation.status !== 'PENDING') {
      throwValidationError('This invitation is no longer pending');
    }

    const now = new Date();

    // Accept invitation and create membership in transaction
    await ctx.prisma.$transaction([
      ctx.prisma.clusterInvitation.update({
        where: { id: invitationId },
        data: {
          status: 'ACCEPTED',
          respondedAt: now,
        },
      }),
      ctx.prisma.userCluster.create({
        data: {
          userId: currentUser.id,
          clusterId: invitation.clusterId,
          createdAt: now,
          updatedAt: now,
        },
      }),
    ]);

    // Create activity update and emit live event
    await createJoinClusterUpdate(
      ctx.prisma,
      currentUser.id,
      invitation.clusterId,
      invitation.cluster.title,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return true;
  },

  /**
   * Reject a cluster invitation
   */
  async rejectClusterInvitation(_: unknown, { invitationId }: { invitationId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const invitation = await ctx.prisma.clusterInvitation.findUnique({
      where: { id: invitationId },
    });
    assertFound(invitation, 'Invitation');

    // Only the invited user can reject
    if (invitation.userId !== currentUser.id) {
      throwValidationError('You can only reject your own invitations');
    }

    if (invitation.status !== 'PENDING') {
      throwValidationError('This invitation is no longer pending');
    }

    await ctx.prisma.clusterInvitation.update({
      where: { id: invitationId },
      data: {
        status: 'REJECTED',
        respondedAt: new Date(),
      },
    });

    return true;
  },

  /**
   * Cancel a sent invitation
   */
  async cancelClusterInvitation(_: unknown, { invitationId }: { invitationId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const invitation = await ctx.prisma.clusterInvitation.findUnique({
      where: { id: invitationId },
      include: { cluster: true },
    });
    assertFound(invitation, 'Invitation');

    // Check if user is moderator or creator
    const isMod = await ctx.prisma.clusterModerator.findFirst({
      where: { clusterId: invitation.clusterId, userId: currentUser.id },
    });
    if (invitation.cluster.creatorId !== currentUser.id && !isMod) {
      throwValidationError('Only moderators can cancel invitations');
    }

    if (invitation.status !== 'PENDING') {
      throwValidationError('This invitation is no longer pending');
    }

    await ctx.prisma.clusterInvitation.update({
      where: { id: invitationId },
      data: {
        status: 'CANCELLED',
        respondedAt: new Date(),
      },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const invitationFieldResolvers = {
  ClusterInvitation: {
    async cluster(invitation: { clusterId: number; cluster?: unknown }, _: unknown, ctx: GraphQLContext) {
      if (invitation.cluster) return invitation.cluster;
      return ctx.loaders.clusterById.load(invitation.clusterId);
    },

    async user(invitation: { userId: string; user?: unknown }, _: unknown, ctx: GraphQLContext) {
      if (invitation.user) return invitation.user;
      return ctx.loaders.userById.load(invitation.userId);
    },

    async sentBy(invitation: { sentById: string; sentBy?: unknown }, _: unknown, ctx: GraphQLContext) {
      if (invitation.sentBy) return invitation.sentBy;
      return ctx.loaders.userById.load(invitation.sentById);
    },
  },
};
