/**
 * Testimonial resolvers - friend testimonials with approval system
 */
import type { Testimonial } from '@prisma/client';
import type { GraphQLContext } from '../../context.js';
import { validateInput, createTestimonialInput } from '../../../lib/validation.js';
import { requireUser, requireWriteAccess, assertFound, throwValidationError, parseNumericId } from '../../../lib/guards.js';
import { createTestimonialActivity, createTestimonialApprovedActivity } from '../../../lib/activity.js';
import { createWriteTestimonialUpdate } from '../../../lib/updates.js';
import type { TestimonialsArgs, PendingTestimonialsArgs, CreateTestimonialArgs } from './types.js';
import { DAILY_TESTIMONIAL_LIMIT, getStartOfDay } from './types.js';

// ============================================================================
// QUERIES
// ============================================================================

export const testimonialQueries = {
  /**
   * Get approved testimonials for a user
   * Filters out content from blocked users if viewer is authenticated
   */
  async testimonials(_: unknown, args: TestimonialsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    // Build where clause with optional blocked user filter
    // Always filter out soft-deleted testimonials
    const where: Record<string, unknown> = {
      receiverId: args.userId,
      approved: true,
      rejected: false,
      deletedAt: null,
    };

    // If viewer is authenticated, filter out testimonials from users they have blocked
    if (ctx.currentUser) {
      const blockedUsers = await ctx.prisma.blockedUser.findMany({
        where: { blockerId: ctx.currentUser.id },
        select: { blockedId: true },
      });
      const blockedIds = blockedUsers.map((b) => b.blockedId);
      if (blockedIds.length > 0) {
        where.senderId = { notIn: blockedIds };
      }
    }

    const [testimonials, totalCount] = await Promise.all([
      ctx.prisma.testimonial.findMany({
        where,
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.testimonial.count({ where }),
    ]);

    const hasMore = testimonials.length > limit;
    const nodes = hasMore ? testimonials.slice(0, limit) : testimonials;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get pending testimonials for the current user
   */
  async pendingTestimonials(_: unknown, args: PendingTestimonialsArgs, ctx: GraphQLContext) {
    const currentUser = requireUser(ctx);
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    const [testimonials, totalCount] = await Promise.all([
      ctx.prisma.testimonial.findMany({
        where: {
          receiverId: currentUser.id,
          approved: false,
          rejected: false,
          deletedAt: null,
        },
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.testimonial.count({
        where: {
          receiverId: currentUser.id,
          approved: false,
          rejected: false,
          deletedAt: null,
        },
      }),
    ]);

    const hasMore = testimonials.length > limit;
    const nodes = hasMore ? testimonials.slice(0, limit) : testimonials;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const testimonialMutations = {
  async createTestimonial(_: unknown, { input }: CreateTestimonialArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const validated = validateInput(createTestimonialInput, input);

    // Cannot send to yourself
    if (validated.receiverId === currentUser.id) {
      throwValidationError('You cannot write a testimonial for yourself');
    }

    // Check if receiver exists
    const receiver = await ctx.prisma.user.findUnique({
      where: { id: validated.receiverId },
    });
    assertFound(receiver, 'User');

    // Must be friends
    const friendship = await ctx.prisma.friendship.findUnique({
      where: {
        userId_friendId: {
          userId: currentUser.id,
          friendId: validated.receiverId,
        },
      },
    });
    if (!friendship) {
      throwValidationError('You can only write testimonials for friends');
    }

    // Check daily rate limit
    const startOfDay = getStartOfDay();
    const todayTestimonialsCount = await ctx.prisma.testimonial.count({
      where: {
        senderId: currentUser.id,
        createdAt: { gte: startOfDay },
      },
    });
    if (todayTestimonialsCount >= DAILY_TESTIMONIAL_LIMIT) {
      throwValidationError(`You have reached the daily limit of ${DAILY_TESTIMONIAL_LIMIT} testimonials`);
    }

    const now = new Date();
    const testimonial = await ctx.prisma.testimonial.create({
      data: {
        body: validated.body,
        senderId: currentUser.id,
        receiverId: validated.receiverId,
        approved: false,
        rejected: false,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Create activity for the receiver
    await createTestimonialActivity(
      ctx.prisma,
      validated.receiverId,
      currentUser.id,
      currentUser.name,
      testimonial.id
    );

    // Emit live event for the feed
    await createWriteTestimonialUpdate(
      ctx.prisma,
      currentUser.id,
      validated.receiverId,
      receiver.name,
      testimonial.id,
      {
        id: currentUser.id,
        name: currentUser.name,
        profilePicture: currentUser.profilePicture,
      }
    );

    return testimonial;
  },

  async approveTestimonial(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const testimonialId = parseNumericId(id, 'Testimonial');

    const testimonial = await ctx.prisma.testimonial.findUnique({
      where: { id: testimonialId },
    });
    assertFound(testimonial, 'Testimonial');

    if (testimonial.receiverId !== currentUser.id) {
      throwValidationError('You can only approve testimonials written for you');
    }

    const updated = await ctx.prisma.testimonial.update({
      where: { id: testimonialId },
      data: { approved: true, rejected: false },
    });

    // Create activity for the sender (testimonial writer)
    await createTestimonialApprovedActivity(
      ctx.prisma,
      testimonial.senderId,
      currentUser.id,
      currentUser.name,
      testimonialId
    );

    return updated;
  },

  async rejectTestimonial(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const testimonialId = parseNumericId(id, 'Testimonial');

    const testimonial = await ctx.prisma.testimonial.findUnique({
      where: { id: testimonialId },
    });
    assertFound(testimonial, 'Testimonial');

    if (testimonial.receiverId !== currentUser.id) {
      throwValidationError('You can only reject testimonials written for you');
    }

    return ctx.prisma.testimonial.update({
      where: { id: testimonialId },
      data: { approved: false, rejected: true },
    });
  },

  async deleteTestimonial(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const testimonialId = parseNumericId(id, 'Testimonial');

    const testimonial = await ctx.prisma.testimonial.findFirst({
      where: { id: testimonialId, deletedAt: null },
    });
    assertFound(testimonial, 'Testimonial');

    // Can delete if sender or receiver
    if (testimonial.senderId !== currentUser.id && testimonial.receiverId !== currentUser.id) {
      throwValidationError('You do not have permission to delete this testimonial');
    }

    // Soft delete: set deletedAt instead of hard delete
    await ctx.prisma.testimonial.update({
      where: { id: testimonialId },
      data: { deletedAt: new Date() },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const testimonialFieldResolvers = {
  Testimonial: {
    async sender(testimonial: Testimonial, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(testimonial.senderId);
    },
    async receiver(testimonial: Testimonial, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(testimonial.receiverId);
    },
  },
};
