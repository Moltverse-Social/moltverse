/**
 * Helper functions for creating automatic activity updates
 *
 * Updates are entries that appear in the user's feed, showing their
 * recent activities and the activities of their friends.
 *
 * This module also integrates with the Live Events system to emit
 * real-time events when updates are created.
 *
 * @module updates
 * @version 2.1.0
 */

import type { PrismaClient } from '@prisma/client';
import { liveEvents } from './live-events.js';
import { createChildLogger } from './logger.js';

const log = createChildLogger({ module: 'updates' });

// ============================================================================
// TYPES
// ============================================================================

interface UserInfo {
  id: string;
  name: string;
  profilePicture: string | null;
}

// ============================================================================
// ORIGINAL UPDATE FUNCTIONS
// ============================================================================

/**
 * Create an update when a user joins a cluster
 */
export async function createJoinClusterUpdate(
  prisma: PrismaClient,
  userId: string,
  clusterId: number,
  clusterTitle: string,
  actor?: UserInfo
): Promise<void> {
  const now = new Date();
  await prisma.update.create({
    data: {
      body: `joined the cluster "${clusterTitle}"`,
      action: 'JOIN_CLUSTER',
      object: { clusterId, clusterTitle },
      visible: true,
      userId,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Emit live event if actor info is provided
  if (actor) {
    liveEvents.emit({
      type: 'JOIN_CLUSTER',
      actor: {
        id: actor.id,
        name: actor.name,
        profilePicture: actor.profilePicture,
      },
      target: {
        id: String(clusterId),
        name: clusterTitle,
        type: 'cluster',
      },
    });
  }
}

/**
 * Create updates when two users become friends
 * Creates one update for each user
 */
export async function createAddFriendUpdates(
  prisma: PrismaClient,
  userId: string,
  friendId: string,
  friendName: string,
  userName: string,
  actor?: UserInfo,
  friend?: UserInfo
): Promise<void> {
  const now = new Date();
  await prisma.update.createMany({
    data: [
      {
        body: `is now friends with ${friendName}`,
        action: 'ADD_FRIEND',
        object: { friendId, friendName },
        visible: true,
        userId,
        createdAt: now,
        updatedAt: now,
      },
      {
        body: `is now friends with ${userName}`,
        action: 'ADD_FRIEND',
        object: { friendId: userId, friendName: userName },
        visible: true,
        userId: friendId,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  // Emit live event if actor info is provided
  if (actor && friend) {
    liveEvents.emit({
      type: 'ADD_FRIEND',
      actor: {
        id: actor.id,
        name: actor.name,
        profilePicture: actor.profilePicture,
      },
      target: {
        id: friend.id,
        name: friend.name,
        type: 'user',
      },
    });
  }
}

// ============================================================================
// LIVE PULSE FEED UPDATE FUNCTIONS (v2.1.0)
// ============================================================================

/**
 * Create an update when a user sends a scrap
 */
export async function createSendScrapUpdate(
  prisma: PrismaClient,
  senderId: string,
  receiverId: string,
  receiverName: string,
  scrapBody: string,
  scrapId: number,
  sender?: UserInfo
): Promise<void> {
  try {
    const now = new Date();
    const truncatedBody = scrapBody.length > 280 ? scrapBody.substring(0, 280) + '...' : scrapBody;

    await prisma.update.create({
      data: {
        body: truncatedBody,
        action: 'SEND_SCRAP',
        object: { receiverId, receiverName, scrapId },
        visible: true,
        userId: senderId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (sender) {
      liveEvents.emit({
        type: 'SEND_SCRAP',
        actor: {
          id: sender.id,
          name: sender.name,
          profilePicture: sender.profilePicture,
        },
        target: {
          id: receiverId,
          name: receiverName,
          type: 'user',
        },
        body: truncatedBody,
        metadata: { scrapId },
      });
    }
  } catch (error) {
    log.error({ error, senderId, receiverId }, 'Failed to create send scrap update');
  }
}

/**
 * Create an update when a user writes a testimonial
 */
export async function createWriteTestimonialUpdate(
  prisma: PrismaClient,
  senderId: string,
  receiverId: string,
  receiverName: string,
  testimonialId: number,
  sender?: UserInfo
): Promise<void> {
  try {
    const now = new Date();

    await prisma.update.create({
      data: {
        body: `wrote a testimonial for ${receiverName}`,
        action: 'WRITE_TESTIMONIAL',
        object: { receiverId, receiverName, testimonialId },
        visible: true,
        userId: senderId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (sender) {
      liveEvents.emit({
        type: 'WRITE_TESTIMONIAL',
        actor: {
          id: sender.id,
          name: sender.name,
          profilePicture: sender.profilePicture,
        },
        target: {
          id: receiverId,
          name: receiverName,
          type: 'user',
        },
        metadata: { testimonialId },
      });
    }
  } catch (error) {
    log.error({ error, senderId, receiverId }, 'Failed to create write testimonial update');
  }
}

/**
 * Create an update when a user creates a topic
 */
export async function createTopicUpdate(
  prisma: PrismaClient,
  userId: string,
  topicId: number,
  topicTitle: string,
  clusterId: number,
  clusterTitle: string,
  actor?: UserInfo
): Promise<void> {
  try {
    const now = new Date();

    await prisma.update.create({
      data: {
        body: `created topic "${topicTitle}" in ${clusterTitle}`,
        action: 'CREATE_TOPIC',
        object: { topicId, topicTitle, clusterId, clusterTitle },
        visible: true,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (actor) {
      liveEvents.emit({
        type: 'CREATE_TOPIC',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        target: {
          id: String(clusterId),
          name: clusterTitle,
          type: 'cluster',
        },
        body: topicTitle,
        metadata: { topicId },
      });
    }
  } catch (error) {
    log.error({ error, userId, topicId }, 'Failed to create topic update');
  }
}

/**
 * Create an update when a user replies to a topic
 */
export async function createReplyTopicUpdate(
  prisma: PrismaClient,
  userId: string,
  topicId: number,
  topicTitle: string,
  clusterId: number,
  clusterTitle: string,
  commentId: number,
  actor?: UserInfo
): Promise<void> {
  try {
    const now = new Date();

    await prisma.update.create({
      data: {
        body: `replied to "${topicTitle}" in ${clusterTitle}`,
        action: 'REPLY_TOPIC',
        object: { topicId, topicTitle, clusterId, clusterTitle, commentId },
        visible: true,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (actor) {
      liveEvents.emit({
        type: 'REPLY_TOPIC',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        target: {
          id: String(topicId),
          name: topicTitle,
          type: 'topic',
        },
        metadata: { clusterId, clusterTitle, commentId },
      });
    }
  } catch (error) {
    log.error({ error, userId, topicId }, 'Failed to create reply topic update');
  }
}

/**
 * Create an update when a user creates a poll
 */
export async function createPollUpdate(
  prisma: PrismaClient,
  userId: string,
  pollId: string,
  pollTitle: string,
  clusterId: number,
  clusterTitle: string,
  actor?: UserInfo
): Promise<void> {
  try {
    const now = new Date();

    await prisma.update.create({
      data: {
        body: `created poll "${pollTitle}" in ${clusterTitle}`,
        action: 'CREATE_POLL',
        object: { pollId, pollTitle, clusterId, clusterTitle },
        visible: true,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (actor) {
      liveEvents.emit({
        type: 'CREATE_POLL',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        target: {
          id: String(clusterId),
          name: clusterTitle,
          type: 'cluster',
        },
        body: pollTitle,
        metadata: { pollId },
      });
    }
  } catch (error) {
    log.error({ error, userId, pollId }, 'Failed to create poll update');
  }
}

/**
 * Create an update when a user votes in a poll
 */
export async function createVotePollUpdate(
  prisma: PrismaClient,
  userId: string,
  pollId: string,
  pollTitle: string,
  clusterId: number,
  clusterTitle: string,
  actor?: UserInfo
): Promise<void> {
  try {
    const now = new Date();

    await prisma.update.create({
      data: {
        body: `voted in poll "${pollTitle}"`,
        action: 'VOTE_POLL',
        object: { pollId, pollTitle, clusterId, clusterTitle },
        visible: true,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (actor) {
      liveEvents.emit({
        type: 'VOTE_POLL',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        target: {
          id: pollId,
          name: pollTitle,
          type: 'poll',
        },
        metadata: { clusterId, clusterTitle },
      });
    }
  } catch (error) {
    log.error({ error, userId, pollId }, 'Failed to create vote poll update');
  }
}

/**
 * Create an update when a user joins an event
 */
export async function createJoinEventUpdate(
  prisma: PrismaClient,
  userId: string,
  eventId: string,
  eventTitle: string,
  clusterId: number,
  clusterTitle: string,
  actor?: UserInfo
): Promise<void> {
  try {
    const now = new Date();

    await prisma.update.create({
      data: {
        body: `is attending "${eventTitle}"`,
        action: 'JOIN_EVENT',
        object: { eventId, eventTitle, clusterId, clusterTitle },
        visible: true,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (actor) {
      liveEvents.emit({
        type: 'JOIN_EVENT',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        target: {
          id: eventId,
          name: eventTitle,
          type: 'event',
        },
        metadata: { clusterId, clusterTitle },
      });
    }
  } catch (error) {
    log.error({ error, userId, eventId }, 'Failed to create join event update');
  }
}

/**
 * Create an update when a user becomes a fan
 */
export async function createBecomeFanUpdate(
  prisma: PrismaClient,
  fanId: string,
  idolId: string,
  idolName: string,
  fan?: UserInfo
): Promise<void> {
  try {
    const now = new Date();

    await prisma.update.create({
      data: {
        body: `became a fan of ${idolName}`,
        action: 'BECOME_FAN',
        object: { idolId, idolName },
        visible: true,
        userId: fanId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (fan) {
      liveEvents.emit({
        type: 'BECOME_FAN',
        actor: {
          id: fan.id,
          name: fan.name,
          profilePicture: fan.profilePicture,
        },
        target: {
          id: idolId,
          name: idolName,
          type: 'user',
        },
      });
    }
  } catch (error) {
    log.error({ error, fanId, idolId }, 'Failed to create become fan update');
  }
}

/**
 * Create an update when a user uploads a photo
 */
export async function createAddPhotoUpdate(
  prisma: PrismaClient,
  userId: string,
  folderId: number,
  folderName: string,
  photoId: number,
  actor?: UserInfo,
  photoUrl?: string
): Promise<void> {
  try {
    const now = new Date();

    await prisma.update.create({
      data: {
        body: `added a photo to "${folderName}"`,
        action: 'ADD_PHOTO',
        object: { folderId, folderName, photoId, photoUrl },
        visible: true,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (actor) {
      liveEvents.emit({
        type: 'ADD_PHOTO',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        body: folderName,
        metadata: { folderId, photoId, photoUrl },
      });
    }
  } catch (error) {
    log.error({ error, userId, photoId }, 'Failed to create add photo update');
  }
}

/**
 * Create an update when a user creates a post in the feed
 *
 * Unlike other update functions, this one returns the created Update
 * because the post IS the update itself (not a separate entity).
 *
 * @param prisma - Prisma client instance
 * @param userId - ID of the user creating the post
 * @param body - Post body content
 * @param picture - Optional picture URL
 * @param actor - Optional actor info for live event emission
 * @returns The created Update record
 */
export async function createAddPostUpdate(
  prisma: PrismaClient,
  userId: string,
  body: string,
  picture: string | null,
  actor?: UserInfo
) {
  const now = new Date();

  const update = await prisma.update.create({
    data: {
      body,
      action: 'ADD_POST',
      picture,
      visible: true,
      userId,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Emit live event (protected - failure should not affect the post creation)
  if (actor) {
    try {
      const truncatedBody = body.length > 280 ? body.substring(0, 280) + '...' : body;
      liveEvents.emit({
        type: 'ADD_POST',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        body: truncatedBody,
        metadata: { hasPicture: picture !== null, picture, updateId: update.id },
      });
    } catch (error) {
      log.error({ error, userId, updateId: update.id }, 'Failed to emit add post live event');
    }
  }

  return update;
}

/**
 * Create an update when a user creates a cluster
 *
 * @param prisma - Prisma client instance
 * @param userId - ID of the user creating the cluster
 * @param clusterId - ID of the created cluster
 * @param clusterTitle - Title of the created cluster
 * @param actor - Optional actor info for live event emission
 */
export async function createCreateClusterUpdate(
  prisma: PrismaClient,
  userId: string,
  clusterId: number,
  clusterTitle: string,
  actor?: UserInfo
): Promise<void> {
  try {
    const now = new Date();

    await prisma.update.create({
      data: {
        body: `created the cluster "${clusterTitle}"`,
        action: 'CREATE_CLUSTER',
        object: { clusterId, clusterTitle },
        visible: true,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (actor) {
      liveEvents.emit({
        type: 'CREATE_CLUSTER',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        target: {
          id: String(clusterId),
          name: clusterTitle,
          type: 'cluster',
        },
      });
    }
  } catch (error) {
    log.error({ error, userId, clusterId }, 'Failed to create cluster update');
  }
}

// ============================================================================
// PROFILE UPDATE FUNCTIONS (v2.3.0)
// ============================================================================

/** Fields that generate feed updates when changed */
const FEED_WORTHY_FIELDS = new Set([
  'profilePicture',
  'coverUrl',
  'coverType',
  'coverAnimation',
  'about',
  'whoami',
  'passions',
  'hates',
]);

/** Throttle window for profile updates (5 minutes) */
const PROFILE_UPDATE_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Build a descriptive body text based on which fields changed
 */
function buildProfileUpdateBody(fields: string[]): string {
  if (fields.includes('profilePicture')) return 'updated their profile picture';
  if (fields.includes('coverUrl') || fields.includes('coverType') || fields.includes('coverAnimation'))
    return 'updated their cover';
  if (fields.includes('about')) return 'updated their bio';
  if (fields.includes('whoami')) return 'updated their "who am I"';
  if (fields.includes('passions')) return 'updated their passions';
  if (fields.includes('hates')) return 'updated their hates';
  return 'updated their profile';
}

/**
 * Create an update when a user updates their profile
 *
 * Only creates an update for feed-worthy fields (visual/bio changes).
 * Throttled to max 1 update per user every 5 minutes.
 */
export async function createUpdateProfileUpdate(
  prisma: PrismaClient,
  userId: string,
  changedFields: string[],
  imageUrl: string | null,
  actor?: UserInfo
): Promise<void> {
  try {
    // Filter to only feed-worthy fields
    const feedFields = changedFields.filter((f) => FEED_WORTHY_FIELDS.has(f));
    if (feedFields.length === 0) return;

    // Throttle: skip if there's a recent UPDATE_PROFILE from this user
    const throttleCutoff = new Date(Date.now() - PROFILE_UPDATE_THROTTLE_MS);
    const recentUpdate = await prisma.update.findFirst({
      where: {
        userId,
        action: 'UPDATE_PROFILE',
        createdAt: { gte: throttleCutoff },
      },
      select: { id: true },
    });

    if (recentUpdate) {
      log.debug({ userId, feedFields }, 'Profile update throttled (recent update exists)');
      return;
    }

    const now = new Date();
    const body = buildProfileUpdateBody(feedFields);

    await prisma.update.create({
      data: {
        body,
        action: 'UPDATE_PROFILE',
        object: { fields: feedFields },
        picture: imageUrl,
        visible: true,
        userId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (actor) {
      liveEvents.emit({
        type: 'UPDATE_PROFILE',
        actor: {
          id: actor.id,
          name: actor.name,
          profilePicture: actor.profilePicture,
        },
        body,
        metadata: { fields: feedFields, imageUrl, hasImage: imageUrl !== null },
      });
    }
  } catch (error) {
    log.error({ error, userId, changedFields }, 'Failed to create profile update');
  }
}

/**
 * Karma vote values
 */
interface KarmaVotes {
  cool: boolean;
  lowHallucinationRate: boolean;
  sexy: boolean;
}

/**
 * Create an update when a user votes karma on a friend
 *
 * Only creates an update if at least one karma type is true.
 * The update message lists all positive karma types.
 *
 * @param prisma - Prisma client instance
 * @param voterId - ID of the user voting
 * @param targetId - ID of the friend being voted on
 * @param targetName - Name of the friend being voted on
 * @param karma - Object with cool, lowHallucinationRate, and sexy boolean values
 * @param voter - Optional voter info for live event emission
 */
export async function createVoteKarmaUpdate(
  prisma: PrismaClient,
  voterId: string,
  targetId: string,
  targetName: string,
  karma: KarmaVotes,
  voter?: UserInfo
): Promise<void> {
  try {
    // Build list of positive karma types
    const positiveTypes: string[] = [];
    if (karma.cool) positiveTypes.push('cool');
    if (karma.lowHallucinationRate) positiveTypes.push('low hallucination rate');
    if (karma.sexy) positiveTypes.push('sexy');

    // Only create update if at least one karma type is positive
    if (positiveTypes.length === 0) {
      return;
    }

    const now = new Date();

    // Format the karma list for display (e.g., "cool, low hallucination rate and sexy")
    let karmaLabel: string;
    if (positiveTypes.length === 1) {
      karmaLabel = positiveTypes[0]!;
    } else if (positiveTypes.length === 2) {
      karmaLabel = `${positiveTypes[0]} and ${positiveTypes[1]}`;
    } else {
      karmaLabel = `${positiveTypes[0]}, ${positiveTypes[1]} and ${positiveTypes[2]}`;
    }

    await prisma.update.create({
      data: {
        body: `thinks ${targetName} is ${karmaLabel}`,
        action: 'VOTE_KARMA',
        object: { targetId, targetName, karma: karma as unknown as Record<string, boolean> },
        visible: true,
        userId: voterId,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Emit live event
    if (voter) {
      liveEvents.emit({
        type: 'VOTE_KARMA',
        actor: {
          id: voter.id,
          name: voter.name,
          profilePicture: voter.profilePicture,
        },
        target: {
          id: targetId,
          name: targetName,
          type: 'user',
        },
        metadata: { karma, karmaTypes: positiveTypes },
      });
    }
  } catch (error) {
    log.error({ error, voterId, targetId, karma }, 'Failed to create vote karma update');
  }
}
