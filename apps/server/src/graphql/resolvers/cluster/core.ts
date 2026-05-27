/**
 * Core cluster resolvers - CRUD operations, categories, search
 */
import type { Cluster, Prisma } from '@prisma/client';
import type { GraphQLContext } from '../../context.js';
import { validateInput, createClusterInput, updateClusterInput } from '../../../lib/validation.js';
import { requireUser, requireWriteAccess, assertFound, throwValidationError, parseNumericId } from '../../../lib/guards.js';
import { isCloudinaryUrl } from '../../../lib/cloudinary.js';
import { createCreateClusterUpdate } from '../../../lib/updates.js';
import type { ClusterArgs, SearchClustersArgs, CreateClusterArgs, UpdateClusterArgs } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const coreQueries = {
  /**
   * Get all categories
   */
  async categories(_: unknown, __: unknown, ctx: GraphQLContext) {
    return ctx.prisma.category.findMany({
      orderBy: { title: 'asc' },
    });
  },

  /**
   * Get a cluster by ID
   */
  async cluster(_: unknown, { id }: ClusterArgs, ctx: GraphQLContext) {
    const clusterId = parseNumericId(id, 'Cluster');
    return ctx.prisma.cluster.findUnique({
      where: { id: clusterId },
    });
  },

  /**
   * Search clusters
   * Filters private clusters unless user is a member (COM-005 fix)
   */
  async searchClusters(_: unknown, args: SearchClustersArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;
    const query = args.query?.trim() ?? '';

    // Reject excessively long search queries
    if (query.length > 200) {
      return { nodes: [], totalCount: 0, hasMore: false };
    }

    // Build visibility filter (COM-005 fix)
    // Users can see: PUBLIC clusters OR PRIVATE clusters they're members of
    let visibilityFilter: Prisma.ClusterWhereInput;

    if (ctx.currentUser) {
      // Get clusters the user is a member of
      const memberships = await ctx.prisma.userCluster.findMany({
        where: { userId: ctx.currentUser.id },
        select: { clusterId: true },
      });
      const memberClusterIds = memberships.map((m) => m.clusterId);

      if (memberClusterIds.length > 0) {
        visibilityFilter = {
          OR: [
            { type: 'PUBLIC' },
            { id: { in: memberClusterIds } },
          ],
        };
      } else {
        visibilityFilter = { type: 'PUBLIC' };
      }
    } else {
      // Non-authenticated users can only see public clusters
      visibilityFilter = { type: 'PUBLIC' };
    }

    // Build search filter
    const searchFilters: Prisma.ClusterWhereInput[] = [];
    if (query.length >= 2) {
      searchFilters.push({
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      });
    }

    // Build category filter
    const categoryFilters: Prisma.ClusterWhereInput[] = [];
    if (args.categoryId) {
      categoryFilters.push({ categoryId: args.categoryId });
    }

    // Combine all filters with AND
    const where: Prisma.ClusterWhereInput = {
      AND: [
        visibilityFilter,
        ...searchFilters,
        ...categoryFilters,
      ],
    };

    const [clusters, totalCount] = await Promise.all([
      ctx.prisma.cluster.findMany({
        where,
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.cluster.count({ where }),
    ]);

    const hasMore = clusters.length > limit;
    const nodes = hasMore ? clusters.slice(0, limit) : clusters;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const coreMutations = {
  /**
   * Create a new cluster
   */
  async createCluster(_: unknown, { input }: CreateClusterArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const validated = validateInput(createClusterInput, input);

    // Validate Cloudinary URL for cluster picture (MED-001 fix)
    if (validated.picture && !isCloudinaryUrl(validated.picture)) {
      throwValidationError('Invalid cluster picture URL. Only Cloudinary URLs are accepted.');
    }

    // Check if category exists
    const category = await ctx.prisma.category.findUnique({
      where: { id: validated.categoryId },
    });
    assertFound(category, 'Category');

    const now = new Date();

    // Create cluster, membership, and moderator in a transaction
    const cluster = await ctx.prisma.$transaction(async (tx) => {
      const newCluster = await tx.cluster.create({
        data: {
          title: validated.title,
          picture: validated.picture ?? '',
          description: validated.description ?? null,
          type: validated.type ?? 'PUBLIC',
          language: validated.language ?? null,
          country: validated.country ?? null,
          categoryId: validated.categoryId,
          creatorId: currentUser.id,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.userCluster.create({
        data: {
          userId: currentUser.id,
          clusterId: newCluster.id,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.clusterModerator.create({
        data: {
          userId: currentUser.id,
          clusterId: newCluster.id,
          createdAt: now,
          updatedAt: now,
        },
      });

      return newCluster;
    });

    // Create activity update and emit live event
    await createCreateClusterUpdate(
      ctx.prisma,
      currentUser.id,
      cluster.id,
      cluster.title,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return cluster;
  },

  /**
   * Update a cluster
   */
  async updateCluster(_: unknown, { id, input }: UpdateClusterArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const clusterId = parseNumericId(id, 'Cluster');

    const cluster = await ctx.prisma.cluster.findUnique({
      where: { id: clusterId },
    });
    assertFound(cluster, 'Cluster');

    // Check if user is creator or moderator
    const isModerator = await ctx.prisma.clusterModerator.findFirst({
      where: { clusterId, userId: currentUser.id },
    });
    if (cluster.creatorId !== currentUser.id && !isModerator) {
      throwValidationError('You do not have permission to update this cluster');
    }

    const validated = validateInput(updateClusterInput, input);

    const updateData: Record<string, unknown> = {};
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.picture !== undefined) {
      // Validate Cloudinary URL for cluster picture (MED-001 fix)
      if (validated.picture && !isCloudinaryUrl(validated.picture)) {
        throwValidationError('Invalid cluster picture URL. Only Cloudinary URLs are accepted.');
      }
      updateData.picture = validated.picture;
    }
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.type !== undefined) updateData.type = validated.type;
    if (validated.language !== undefined) updateData.language = validated.language;
    if (validated.country !== undefined) updateData.country = validated.country;

    // Track who made the edit (for audit purposes)
    updateData.lastEditedById = currentUser.id;

    return ctx.prisma.cluster.update({
      where: { id: clusterId },
      data: updateData,
    });
  },

  /**
   * Delete a cluster (creator only)
   */
  async deleteCluster(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const clusterId = parseNumericId(id, 'Cluster');

    const cluster = await ctx.prisma.cluster.findUnique({
      where: { id: clusterId },
    });
    assertFound(cluster, 'Cluster');

    if (cluster.creatorId !== currentUser.id) {
      throwValidationError('Only the cluster creator can delete it');
    }

    await ctx.prisma.cluster.delete({
      where: { id: clusterId },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const coreFieldResolvers = {
  Category: {
    async clusterCount(category: { id: number }, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.clusterCountByCategoryId.load(category.id);
    },
  },

  Cluster: {
    async creator(cluster: Cluster, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(cluster.creatorId);
    },

    async category(cluster: Cluster, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.categoryById.load(cluster.categoryId);
    },

    async memberCount(cluster: Cluster, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.memberCountByClusterId.load(cluster.id);
    },

    async topicCount(cluster: Cluster, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.topicCountByClusterId.load(cluster.id);
    },

    async pollCount(cluster: Cluster, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.pollCountByClusterId.load(cluster.id);
    },

    async eventCount(cluster: Cluster, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.eventCountByClusterId.load(cluster.id);
    },

    async isMember(cluster: Cluster, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return false;
      return ctx.loaders.isMemberByClusterId.load(cluster.id);
    },

    async isModerator(cluster: Cluster, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return false;
      return ctx.loaders.isModeratorByClusterId.load(cluster.id);
    },

    async isCreator(cluster: Cluster, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return false;
      return cluster.creatorId === ctx.currentUser.id;
    },

    async lastEditedBy(cluster: Cluster & { lastEditedById?: string | null }, _: unknown, ctx: GraphQLContext) {
      if (!cluster.lastEditedById) return null;
      return ctx.loaders.userById.load(cluster.lastEditedById);
    },
  },
};
