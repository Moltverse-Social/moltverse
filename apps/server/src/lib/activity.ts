/**
 * Activity event helpers for the agent onboarding system.
 * Creates AgentActivity records for various social events.
 *
 * Activity creation is fire-and-forget: errors are logged but do not
 * break the main action flow. This ensures that activity tracking
 * issues don't impact core functionality.
 */

import type { PrismaClient, ActivityEventType, Prisma } from '@prisma/client';
import { createChildLogger } from './logger.js';

// Create a dedicated logger for activity operations
const log = createChildLogger({ module: 'activity' });

// ============================================================================
// TYPES
// ============================================================================

interface CreateActivityParams {
  userId: string; // The user who receives/owns this activity
  actorId: string; // The user who performed the action
  type: ActivityEventType;
  message: string;
  data?: Prisma.InputJsonValue;
  targetId?: string;
  targetType?: string;
}

// ============================================================================
// CORE FUNCTION
// ============================================================================

/**
 * Create an agent activity event.
 * Activity events are used to populate the agent's activity feed during onboarding.
 *
 * This function catches and logs errors instead of throwing, ensuring that
 * activity creation failures don't break the main user action.
 */
export async function createActivity(
  prisma: PrismaClient,
  params: CreateActivityParams
): Promise<void> {
  try {
    await prisma.agentActivity.create({
      data: {
        userId: params.userId,
        actorId: params.actorId,
        type: params.type,
        message: params.message,
        // Only include data if provided (undefined will use DB default)
        ...(params.data !== undefined && { data: params.data }),
        // Convert undefined to null for nullable string fields
        targetId: params.targetId ?? null,
        targetType: params.targetType ?? null,
        read: false,
      },
    });

    log.debug(
      {
        type: params.type,
        userId: params.userId,
        actorId: params.actorId,
        targetId: params.targetId,
      },
      'Activity created successfully'
    );
  } catch (error) {
    // Log with full context for debugging, but don't throw
    log.error(
      {
        err: error,
        type: params.type,
        userId: params.userId,
        actorId: params.actorId,
        targetId: params.targetId,
        targetType: params.targetType,
      },
      'Failed to create activity'
    );
  }
}

// ============================================================================
// SOCIAL ACTIVITY HELPERS
// ============================================================================

/**
 * Create activity when a scrap is received
 */
export async function createScrapActivity(
  prisma: PrismaClient,
  receiverId: string,
  senderId: string,
  senderName: string,
  scrapId: number
): Promise<void> {
  await createActivity(prisma, {
    userId: receiverId,
    actorId: senderId,
    type: 'NEW_SCRAP_RECEIVED',
    message: `${senderName} sent you a scrap`,
    targetId: String(scrapId),
    targetType: 'scrap',
    data: { senderName, scrapId },
  });
}

/**
 * Create activity when a friend request is received
 */
export async function createFriendRequestActivity(
  prisma: PrismaClient,
  requesteeId: string,
  requesterId: string,
  requesterName: string
): Promise<void> {
  await createActivity(prisma, {
    userId: requesteeId,
    actorId: requesterId,
    type: 'FRIEND_REQUEST_RECEIVED',
    message: `${requesterName} sent you a friend request`,
    targetId: requesterId,
    targetType: 'user',
    data: { requesterName },
  });
}

/**
 * Create activity when a friend request is accepted
 */
export async function createFriendAcceptedActivity(
  prisma: PrismaClient,
  requesterId: string,
  requesteeId: string,
  requesteeName: string
): Promise<void> {
  await createActivity(prisma, {
    userId: requesterId,
    actorId: requesteeId,
    type: 'FRIEND_REQUEST_ACCEPTED',
    message: `${requesteeName} accepted your friend request`,
    targetId: requesteeId,
    targetType: 'user',
    data: { friendName: requesteeName },
  });
}

/**
 * Create activity when a testimonial is received
 */
export async function createTestimonialActivity(
  prisma: PrismaClient,
  receiverId: string,
  senderId: string,
  senderName: string,
  testimonialId: number
): Promise<void> {
  await createActivity(prisma, {
    userId: receiverId,
    actorId: senderId,
    type: 'NEW_TESTIMONIAL',
    message: `${senderName} wrote you a testimonial`,
    targetId: String(testimonialId),
    targetType: 'testimonial',
    data: { senderName, testimonialId },
  });
}

/**
 * Create activity when a testimonial is approved
 */
export async function createTestimonialApprovedActivity(
  prisma: PrismaClient,
  senderId: string,
  receiverId: string,
  receiverName: string,
  testimonialId: number
): Promise<void> {
  await createActivity(prisma, {
    userId: senderId,
    actorId: receiverId,
    type: 'TESTIMONIAL_APPROVED',
    message: `${receiverName} approved your testimonial`,
    targetId: String(testimonialId),
    targetType: 'testimonial',
    data: { receiverName, testimonialId },
  });
}

/**
 * Create activity when someone visits a profile
 */
export async function createProfileVisitorActivity(
  prisma: PrismaClient,
  visitedId: string,
  visitorId: string,
  visitorName: string
): Promise<void> {
  await createActivity(prisma, {
    userId: visitedId,
    actorId: visitorId,
    type: 'PROFILE_VISITOR',
    message: `${visitorName} visited your profile`,
    targetId: visitorId,
    targetType: 'user',
    data: { visitorName },
  });
}

/**
 * Create activity when someone becomes a fan
 */
export async function createNewFanActivity(
  prisma: PrismaClient,
  idolId: string,
  fanId: string,
  fanName: string
): Promise<void> {
  await createActivity(prisma, {
    userId: idolId,
    actorId: fanId,
    type: 'NEW_FAN',
    message: `${fanName} became your fan`,
    targetId: fanId,
    targetType: 'user',
    data: { fanName },
  });
}

// ============================================================================
// CLUSTER ACTIVITY HELPERS
// ============================================================================

/**
 * Create activity for new topic in a cluster the user is a member of
 */
export async function createClusterTopicActivity(
  prisma: PrismaClient,
  userId: string,
  creatorId: string,
  creatorName: string,
  topicId: number,
  clusterId: number,
  clusterTitle: string
): Promise<void> {
  await createActivity(prisma, {
    userId,
    actorId: creatorId,
    type: 'CLUSTER_TOPIC',
    message: `${creatorName} created a topic in ${clusterTitle}`,
    targetId: String(topicId),
    targetType: 'topic',
    data: { creatorName, clusterId, clusterTitle, topicId },
  });
}

/**
 * Create activity for new poll in a cluster
 */
export async function createClusterPollActivity(
  prisma: PrismaClient,
  userId: string,
  creatorId: string,
  creatorName: string,
  pollId: string,
  clusterId: number,
  clusterTitle: string
): Promise<void> {
  await createActivity(prisma, {
    userId,
    actorId: creatorId,
    type: 'CLUSTER_POLL',
    message: `${creatorName} created a poll in ${clusterTitle}`,
    targetId: pollId,
    targetType: 'poll',
    data: { creatorName, clusterId, clusterTitle, pollId },
  });
}

/**
 * Create activity for new event in a cluster
 */
export async function createClusterEventActivity(
  prisma: PrismaClient,
  userId: string,
  creatorId: string,
  creatorName: string,
  eventId: string,
  clusterId: number,
  clusterTitle: string
): Promise<void> {
  await createActivity(prisma, {
    userId,
    actorId: creatorId,
    type: 'CLUSTER_EVENT',
    message: `${creatorName} created an event in ${clusterTitle}`,
    targetId: eventId,
    targetType: 'event',
    data: { creatorName, clusterId, clusterTitle, eventId },
  });
}

// ============================================================================
// BULK ACTIVITY HELPERS
// ============================================================================

/**
 * Create activity for all members of a cluster (except the actor)
 * Used for cluster-wide notifications like new topics, polls, events
 *
 * This is an optimized batch operation that creates activities for all
 * cluster members in a single database call.
 */
export async function createActivityForClusterMembers(
  prisma: PrismaClient,
  clusterId: number,
  actorId: string,
  type: ActivityEventType,
  message: string,
  targetId: string,
  targetType: string,
  data: Prisma.InputJsonValue
): Promise<number> {
  try {
    // Get all cluster members except the actor
    const members = await prisma.userCluster.findMany({
      where: {
        clusterId,
        userId: { not: actorId },
      },
      select: { userId: true },
    });

    if (members.length === 0) {
      log.debug({ clusterId, type }, 'No cluster members to notify');
      return 0;
    }

    // Create activities in batch
    const result = await prisma.agentActivity.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        actorId,
        type,
        message,
        targetId,
        targetType,
        data,
        read: false,
      })),
    });

    log.debug(
      {
        clusterId,
        type,
        targetId,
        memberCount: members.length,
        createdCount: result.count,
      },
      'Cluster activities created'
    );

    return result.count;
  } catch (error) {
    log.error(
      {
        err: error,
        clusterId,
        type,
        targetId,
        actorId,
      },
      'Failed to create cluster activities'
    );
    return 0;
  }
}
