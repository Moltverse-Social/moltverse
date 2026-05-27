import type { Event, EventRsvp } from '@prisma/client';
import type { GraphQLContext } from '../context.js';
import { validateInput, createEventInput, updateEventInput } from '../../lib/validation.js';
import { requireUser, requireWriteAccess, assertFound, throwValidationError, parseNumericId } from '../../lib/guards.js';
import { createActivityForClusterMembers } from '../../lib/activity.js';
import { createJoinEventUpdate } from '../../lib/updates.js';
import { validateImageUrl } from '../../lib/cloudinary.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EventsArgs {
  clusterId: string;
  upcoming?: boolean;
  limit?: number;
  offset?: number;
}

export interface EventArgs {
  id: string;
}

export interface EventRsvpsArgs {
  eventId: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface CreateEventArgs {
  input: {
    clusterId: number;
    title: string;
    description?: string;
    picture?: string;
    eventDate: string;
    location?: string;
  };
}

export interface UpdateEventArgs {
  id: string;
  input: {
    title?: string;
    description?: string | null;
    picture?: string | null;
    eventDate?: string;
    location?: string | null;
  };
}

export interface RsvpEventArgs {
  eventId: string;
  status: 'yes' | 'maybe' | 'no';
}

// ============================================================================
// QUERIES
// ============================================================================

export const eventQueries = {
  /**
   * Get events in a cluster
   */
  async events(_: unknown, args: EventsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;
    const clusterId = parseNumericId(args.clusterId, 'Cluster');

    const where: Record<string, unknown> = { clusterId };

    if (args.upcoming) {
      where.eventDate = { gte: new Date() };
    }

    const [events, totalCount] = await Promise.all([
      ctx.prisma.event.findMany({
        where,
        take: limit + 1,
        skip: offset,
        orderBy: { eventDate: args.upcoming ? 'asc' : 'desc' },
      }),
      ctx.prisma.event.count({ where }),
    ]);

    const hasMore = events.length > limit;
    const nodes = hasMore ? events.slice(0, limit) : events;

    return { nodes, totalCount, hasMore };
  },

  /**
   * Get a single event
   */
  async event(_: unknown, { id }: EventArgs, ctx: GraphQLContext) {
    return ctx.prisma.event.findUnique({
      where: { id },
    });
  },

  /**
   * Get RSVPs for an event
   */
  async eventRsvps(_: unknown, args: EventRsvpsArgs, ctx: GraphQLContext) {
    const limit = Math.min(args.limit ?? 50, 200);
    const offset = args.offset ?? 0;

    const where: Record<string, unknown> = { eventId: args.eventId };

    if (args.status) {
      where.status = args.status;
    }

    const [rsvps, totalCount] = await Promise.all([
      ctx.prisma.eventRsvp.findMany({
        where,
        take: limit + 1,
        skip: offset,
        orderBy: { createdAt: 'asc' },
      }),
      ctx.prisma.eventRsvp.count({ where }),
    ]);

    const hasMore = rsvps.length > limit;
    const nodes = hasMore ? rsvps.slice(0, limit) : rsvps;

    return { nodes, totalCount, hasMore };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const eventMutations = {
  /**
   * Create a new event
   */
  async createEvent(_: unknown, { input }: CreateEventArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);
    const validated = validateInput(createEventInput, input);

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
      throwValidationError('You must be a member of the cluster to create events');
    }

    // Validate event date is in the future
    const eventDate = new Date(validated.eventDate);
    if (eventDate <= new Date()) {
      throwValidationError('Event date must be in the future');
    }

    // Validate picture URL if provided
    if (validated.picture) {
      validateImageUrl(validated.picture, 'event picture');
    }

    const now = new Date();
    const event = await ctx.prisma.event.create({
      data: {
        title: validated.title,
        description: validated.description ?? null,
        picture: validated.picture ?? null,
        eventDate: new Date(validated.eventDate),
        location: validated.location ?? null,
        clusterId: validated.clusterId,
        creatorId: currentUser.id,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Notify cluster members about the new event (fire-and-forget)
    createActivityForClusterMembers(
      ctx.prisma,
      validated.clusterId,
      currentUser.id,
      'CLUSTER_EVENT',
      `${currentUser.name} created an event in ${cluster.title}`,
      event.id,
      'event',
      {
        creatorName: currentUser.name,
        clusterId: validated.clusterId,
        clusterTitle: cluster.title,
        eventTitle: event.title,
        eventDate: event.eventDate.toISOString(),
      }
    );

    return event;
  },

  /**
   * Update an event
   */
  async updateEvent(_: unknown, { id, input }: UpdateEventArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const event = await ctx.prisma.event.findUnique({
      where: { id },
      include: { cluster: true },
    });
    assertFound(event, 'Event');

    // Cannot edit past events
    if (event.eventDate < new Date()) {
      throwValidationError('Cannot edit an event that has already occurred');
    }

    // Can update if creator, cluster creator, or moderator
    const isModerator = await ctx.prisma.clusterModerator.findFirst({
      where: {
        userId: currentUser.id,
        clusterId: event.clusterId,
      },
    });

    if (
      event.creatorId !== currentUser.id &&
      event.cluster.creatorId !== currentUser.id &&
      !isModerator
    ) {
      throwValidationError('You do not have permission to update this event');
    }

    const validated = validateInput(updateEventInput, input);

    // Validate picture URL if provided
    if (validated.picture !== undefined && validated.picture !== null) {
      validateImageUrl(validated.picture, 'event picture');
    }

    const updateData: Record<string, unknown> = {};
    if (validated.title !== undefined) updateData.title = validated.title;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.picture !== undefined) updateData.picture = validated.picture;
    if (validated.eventDate !== undefined) updateData.eventDate = new Date(validated.eventDate);
    if (validated.location !== undefined) updateData.location = validated.location;

    return ctx.prisma.event.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Delete an event
   */
  async deleteEvent(_: unknown, { id }: { id: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const event = await ctx.prisma.event.findUnique({
      where: { id },
      include: { cluster: true },
    });
    assertFound(event, 'Event');

    // Can delete if creator, cluster creator, or moderator
    const isModerator = await ctx.prisma.clusterModerator.findFirst({
      where: {
        userId: currentUser.id,
        clusterId: event.clusterId,
      },
    });

    if (
      event.creatorId !== currentUser.id &&
      event.cluster.creatorId !== currentUser.id &&
      !isModerator
    ) {
      throwValidationError('You do not have permission to delete this event');
    }

    await ctx.prisma.event.delete({
      where: { id },
    });

    return true;
  },

  /**
   * RSVP to an event
   */
  async rsvpEvent(_: unknown, { eventId, status }: RsvpEventArgs, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    const event = await ctx.prisma.event.findUnique({
      where: { id: eventId },
      include: { cluster: true },
    });
    assertFound(event, 'Event');

    // Cannot RSVP to past events
    if (event.eventDate < new Date()) {
      throwValidationError('Cannot RSVP to an event that has already occurred');
    }

    // Check if user is a member of the cluster
    const membership = await ctx.prisma.userCluster.findUnique({
      where: {
        userId_clusterId: {
          userId: currentUser.id,
          clusterId: event.clusterId,
        },
      },
    });
    if (!membership) {
      throwValidationError('You must be a member of the cluster to RSVP');
    }

    const now = new Date();

    // Upsert RSVP
    const rsvp = await ctx.prisma.eventRsvp.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId: currentUser.id,
        },
      },
      update: {
        status,
        updatedAt: now,
      },
      create: {
        eventId,
        userId: currentUser.id,
        status,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event when user confirms attendance
    if (status === 'yes') {
      await createJoinEventUpdate(
        ctx.prisma,
        currentUser.id,
        event.id,
        event.title,
        event.clusterId,
        event.cluster.title,
        {
          id: currentUser.id,
          name: currentUser.name,
          profilePicture: currentUser.profilePicture,
        }
      );
    }

    return rsvp;
  },

  /**
   * Cancel RSVP
   */
  async cancelRsvp(_: unknown, { eventId }: { eventId: string }, ctx: GraphQLContext) {
    requireWriteAccess(ctx);
    const currentUser = requireUser(ctx);

    await ctx.prisma.eventRsvp.deleteMany({
      where: {
        eventId,
        userId: currentUser.id,
      },
    });

    return true;
  },
};

// ============================================================================
// FIELD RESOLVERS
// ============================================================================

export const eventFieldResolvers = {
  Event: {
    async creator(event: Event, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(event.creatorId);
    },

    async cluster(event: Event, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.clusterById.load(event.clusterId);
    },

    async rsvpCounts(event: Event, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.rsvpCountsByEventId.load(event.id);
    },

    async myRsvp(event: Event, _: unknown, ctx: GraphQLContext) {
      if (!ctx.currentUser) return null;
      return ctx.loaders.myRsvpByEventId.load(event.id);
    },

    isPast(event: Event) {
      return event.eventDate < new Date();
    },
  },

  EventRsvp: {
    async user(rsvp: EventRsvp, _: unknown, ctx: GraphQLContext) {
      return ctx.loaders.userById.load(rsvp.userId);
    },

    async event(rsvp: EventRsvp, _: unknown, ctx: GraphQLContext) {
      // Events use string IDs, need to handle this
      return ctx.prisma.event.findUnique({ where: { id: rsvp.eventId } });
    },
  },
};
