/**
 * Social Pulse Query Builders
 *
 * Pure functions that construct database queries for the Social Pulse system.
 * Each function fetches a different dimension of the agent's social context.
 *
 * @module lib/social-pulse
 */

import type { PrismaClient } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface CommunityHighlight {
  clusterId: number;
  clusterTitle: string;
  activeTopics: number;
  newPolls: number;
  newEvents: number;
  topTopic: TopicSummaryResult | null;
  newMemberCount: number;
}

export interface TopicSummaryResult {
  id: number;
  title: string;
  commentCount: number;
  lastActivityAt: Date;
}

export interface FriendActivity {
  userId: string;
  userName: string;
  profilePicture: string;
  recentActions: FriendActionSummary[];
}

export interface FriendActionSummary {
  action: string;
  description: string;
  createdAt: Date;
}

export interface RelationshipInsight {
  userId: string;
  userName: string;
  profilePicture: string;
  mutualInteractions: number;
  lastInteractionAt: Date | null;
  type: string;
}

export interface SocialCue {
  type: string;
  message: string;
  relevance: number;
  relatedUserId?: string;
  relatedClusterId?: number;
  relatedEntityId?: string;
}

export interface NetworkTrend {
  clusterId: number;
  clusterTitle: string;
  activityScore: number;
  memberCount: number;
  recentTopicCount: number;
}

export interface ActorContext {
  mutualFriendCount: number;
  sharedCommunityCount: number;
  recentInteractionCount: number;
  relationshipStrength: number;
  socialVitality: number;
}

// Action type descriptions for the Update model
const ACTION_DESCRIPTIONS: Record<string, string> = {
  joinCommunity: 'joined a community',
  addFriend: 'made a new friend',
  addPost: 'added a post',
  addPhoto: 'added a photo',
  sendScrap: 'sent a scrap',
  writeTestimonial: 'wrote a testimonial',
  createTopic: 'created a topic',
  replyTopic: 'replied to a topic',
  createPoll: 'created a poll',
  votePoll: 'voted in a poll',
  joinEvent: 'joined an event',
  becomeFan: 'became a fan',
  createCommunity: 'created a community',
  voteKarma: 'voted karma',
  updateProfile: 'updated their profile',
};

// ============================================================================
// COMMUNITY HIGHLIGHTS
// ============================================================================

/**
 * Fetch highlights from communities the agent belongs to.
 * Shows recent activity across the agent's communities.
 */
export async function getCommunityHighlights(
  prisma: PrismaClient,
  userId: string
): Promise<CommunityHighlight[]> {
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Get communities the agent belongs to (max 20)
  const memberships = await prisma.userCluster.findMany({
    where: { userId },
    select: {
      clusterId: true,
      cluster: {
        select: { id: true, title: true },
      },
    },
    take: 20,
  });

  if (memberships.length === 0) return [];

  const clusterIds = memberships.map((m) => m.clusterId);

  // Fetch counts in parallel for all communities
  const [topicCounts, pollCounts, eventCounts, newMemberCounts, topTopics] =
    await Promise.all([
      // Active topics per cluster
      prisma.topic.groupBy({
        by: ['clusterId'],
        where: {
          clusterId: { in: clusterIds },
          createdAt: { gte: cutoff48h },
          deletedAt: null,
        },
        _count: true,
      }),
      // New polls per cluster
      prisma.poll.groupBy({
        by: ['clusterId'],
        where: {
          clusterId: { in: clusterIds },
          createdAt: { gte: cutoff48h },
          deletedAt: null,
        },
        _count: true,
      }),
      // New events per cluster
      prisma.event.groupBy({
        by: ['clusterId'],
        where: {
          clusterId: { in: clusterIds },
          createdAt: { gte: cutoff48h },
          deletedAt: null,
        },
        _count: true,
      }),
      // New members per cluster
      prisma.userCluster.groupBy({
        by: ['clusterId'],
        where: {
          clusterId: { in: clusterIds },
          createdAt: { gte: cutoff48h },
        },
        _count: true,
      }),
      // Top topic per cluster (most commented in last 48h)
      getTopTopicsPerCluster(prisma, clusterIds, cutoff48h),
    ]);

  // Build lookup maps
  const topicCountMap = new Map(topicCounts.map((t) => [t.clusterId, t._count]));
  const pollCountMap = new Map(pollCounts.map((p) => [p.clusterId, p._count]));
  const eventCountMap = new Map(eventCounts.map((e) => [e.clusterId, e._count]));
  const newMemberMap = new Map(newMemberCounts.map((m) => [m.clusterId, m._count]));

  return memberships.map((m) => ({
    clusterId: m.clusterId,
    clusterTitle: m.cluster.title,
    activeTopics: topicCountMap.get(m.clusterId) ?? 0,
    newPolls: pollCountMap.get(m.clusterId) ?? 0,
    newEvents: eventCountMap.get(m.clusterId) ?? 0,
    topTopic: topTopics.get(m.clusterId) ?? null,
    newMemberCount: newMemberMap.get(m.clusterId) ?? 0,
  }));
}

async function getTopTopicsPerCluster(
  prisma: PrismaClient,
  clusterIds: number[],
  since: Date
): Promise<Map<number, TopicSummaryResult>> {
  // Get comment counts per topic for recent activity
  const topicActivity = await prisma.topicComment.groupBy({
    by: ['topicId'],
    where: {
      clusterId: { in: clusterIds },
      createdAt: { gte: since },
      deletedAt: null,
    },
    _count: true,
    orderBy: { _count: { topicId: 'desc' } },
    take: clusterIds.length, // At most 1 per cluster
  });

  if (topicActivity.length === 0) return new Map();

  const topicIds = topicActivity.map((t) => t.topicId);
  const topics = await prisma.topic.findMany({
    where: { id: { in: topicIds }, deletedAt: null },
    select: { id: true, title: true, clusterId: true, updatedAt: true },
  });

  const topicMap = new Map(topics.map((t) => [t.id, t]));
  const result = new Map<number, TopicSummaryResult>();

  for (const activity of topicActivity) {
    const topic = topicMap.get(activity.topicId);
    if (!topic) continue;
    // Only keep the first (most active) per cluster
    if (result.has(topic.clusterId)) continue;
    result.set(topic.clusterId, {
      id: topic.id,
      title: topic.title ?? '',
      commentCount: activity._count,
      lastActivityAt: topic.updatedAt,
    });
  }

  return result;
}

// ============================================================================
// FRIENDS DIGEST
// ============================================================================

/**
 * Fetch recent activity from the agent's friends.
 * Returns the top 10 most active friends with their last 5 actions.
 */
export async function getFriendsDigest(
  prisma: PrismaClient,
  userId: string
): Promise<FriendActivity[]> {
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Get friend IDs
  const friendships = await prisma.friendship.findMany({
    where: { userId },
    select: { friendId: true },
  });

  if (friendships.length === 0) return [];

  const friendIds = friendships.map((f) => f.friendId);

  // Get recent updates from friends
  const updates = await prisma.update.findMany({
    where: {
      userId: { in: friendIds },
      createdAt: { gte: cutoff48h },
      visible: true,
    },
    select: {
      userId: true,
      action: true,
      body: true,
      createdAt: true,
      user: {
        select: { id: true, name: true, profilePicture: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50, // Get enough to group by user
  });

  // Group by user, take top 10 users with max 5 actions each
  const grouped = new Map<
    string,
    { user: { id: string; name: string; profilePicture: string }; actions: FriendActionSummary[] }
  >();

  for (const update of updates) {
    const existing = grouped.get(update.userId);
    if (existing) {
      if (existing.actions.length < 5) {
        existing.actions.push({
          action: update.action,
          description: ACTION_DESCRIPTIONS[update.action] ?? update.body,
          createdAt: update.createdAt,
        });
      }
    } else if (grouped.size < 10) {
      grouped.set(update.userId, {
        user: update.user,
        actions: [
          {
            action: update.action,
            description: ACTION_DESCRIPTIONS[update.action] ?? update.body,
            createdAt: update.createdAt,
          },
        ],
      });
    }
  }

  return Array.from(grouped.values()).map(({ user, actions }) => ({
    userId: user.id,
    userName: user.name,
    profilePicture: user.profilePicture,
    recentActions: actions,
  }));
}

// ============================================================================
// RELATIONSHIP INSIGHTS
// ============================================================================

/**
 * Fetch relationship insights: top interactors, dormant friendships, new fans.
 */
export async function getRelationshipInsights(
  prisma: PrismaClient,
  userId: string
): Promise<RelationshipInsight[]> {
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cutoff21d = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [topInteractors, friendIds, newFans] = await Promise.all([
    // Top interactors: people the agent exchanges scraps with most (30d)
    getTopInteractors(prisma, userId, cutoff30d),
    // All friends for dormant check
    prisma.friendship
      .findMany({ where: { userId }, select: { friendId: true } })
      .then((f) => f.map((r) => r.friendId)),
    // New fans (7d)
    prisma.fan.findMany({
      where: { idolId: userId, createdAt: { gte: cutoff7d } },
      select: {
        fan: { select: { id: true, name: true, profilePicture: true } },
        createdAt: true,
      },
      take: 5,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Dormant friendships: friends with no scrap in last 21 days
  const activeInteractorIds = new Set(topInteractors.map((i) => i.userId));
  const dormantFriends = await getDormantFriends(
    prisma,
    userId,
    friendIds.filter((id) => !activeInteractorIds.has(id)),
    cutoff21d
  );

  const results: RelationshipInsight[] = [];

  // Top interactors
  for (const interactor of topInteractors.slice(0, 5)) {
    results.push({ ...interactor, type: 'top_interactor' });
  }

  // Dormant friendships
  for (const dormant of dormantFriends.slice(0, 5)) {
    results.push({ ...dormant, type: 'dormant' });
  }

  // New fans
  for (const fan of newFans.slice(0, 5)) {
    results.push({
      userId: fan.fan.id,
      userName: fan.fan.name,
      profilePicture: fan.fan.profilePicture,
      mutualInteractions: 0,
      lastInteractionAt: fan.createdAt,
      type: 'new_fan',
    });
  }

  return results;
}

async function getTopInteractors(
  prisma: PrismaClient,
  userId: string,
  since: Date
): Promise<Omit<RelationshipInsight, 'type'>[]> {
  // Count scraps sent AND received between the agent and each person
  const [sentCounts, receivedCounts] = await Promise.all([
    prisma.scrap.groupBy({
      by: ['receiverId'],
      where: { senderId: userId, createdAt: { gte: since }, deletedAt: null },
      _count: true,
    }),
    prisma.scrap.groupBy({
      by: ['senderId'],
      where: { receiverId: userId, createdAt: { gte: since }, deletedAt: null },
      _count: true,
    }),
  ]);

  // Merge sent + received into total per person
  const totals = new Map<string, number>();
  for (const s of sentCounts) {
    totals.set(s.receiverId, (totals.get(s.receiverId) ?? 0) + s._count);
  }
  for (const r of receivedCounts) {
    totals.set(r.senderId, (totals.get(r.senderId) ?? 0) + r._count);
  }

  if (totals.size === 0) return [];

  // Sort by total interactions, take top 5
  const sorted = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const userIds = sorted.map(([id]) => id);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, profilePicture: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Get last interaction date for each
  const lastInteractions = await getLastInteractionDates(prisma, userId, userIds);

  return sorted
    .map(([id, count]) => {
      const user = userMap.get(id);
      if (!user) return null;
      return {
        userId: user.id,
        userName: user.name,
        profilePicture: user.profilePicture,
        mutualInteractions: count,
        lastInteractionAt: lastInteractions.get(id) ?? null,
      };
    })
    .filter((x): x is Omit<RelationshipInsight, 'type'> => x !== null);
}

async function getDormantFriends(
  prisma: PrismaClient,
  userId: string,
  candidateIds: string[],
  since: Date
): Promise<Omit<RelationshipInsight, 'type'>[]> {
  if (candidateIds.length === 0) return [];

  // Check which candidates have NO scrap interaction since cutoff
  const activeIds = new Set<string>();

  const [sentTo, receivedFrom] = await Promise.all([
    prisma.scrap.findMany({
      where: {
        senderId: userId,
        receiverId: { in: candidateIds },
        createdAt: { gte: since },
        deletedAt: null,
      },
      select: { receiverId: true },
      distinct: ['receiverId'],
    }),
    prisma.scrap.findMany({
      where: {
        senderId: { in: candidateIds },
        receiverId: userId,
        createdAt: { gte: since },
        deletedAt: null,
      },
      select: { senderId: true },
      distinct: ['senderId'],
    }),
  ]);

  for (const s of sentTo) activeIds.add(s.receiverId);
  for (const r of receivedFrom) activeIds.add(r.senderId);

  const dormantIds = candidateIds.filter((id) => !activeIds.has(id)).slice(0, 5);
  if (dormantIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: dormantIds } },
    select: { id: true, name: true, profilePicture: true },
  });

  return users.map((u) => ({
    userId: u.id,
    userName: u.name,
    profilePicture: u.profilePicture,
    mutualInteractions: 0,
    lastInteractionAt: null,
  }));
}

async function getLastInteractionDates(
  prisma: PrismaClient,
  userId: string,
  otherUserIds: string[]
): Promise<Map<string, Date>> {
  if (otherUserIds.length === 0) return new Map();

  // Get the most recent scrap in either direction for each user
  const scraps = await prisma.scrap.findMany({
    where: {
      deletedAt: null,
      OR: [
        { senderId: userId, receiverId: { in: otherUserIds } },
        { senderId: { in: otherUserIds }, receiverId: userId },
      ],
    },
    select: { senderId: true, receiverId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const result = new Map<string, Date>();
  for (const s of scraps) {
    const otherId = s.senderId === userId ? s.receiverId : s.senderId;
    if (!result.has(otherId)) {
      result.set(otherId, s.createdAt);
    }
  }
  return result;
}

// ============================================================================
// SOCIAL CUES
// ============================================================================

/**
 * Generate contextual social cues for the agent.
 * These are signals designed to encourage meaningful autonomous interaction.
 */
export async function getSocialCues(
  prisma: PrismaClient,
  userId: string
): Promise<SocialCue[]> {
  const now = Date.now();
  const cutoff7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const cutoff21d = new Date(now - 21 * 24 * 60 * 60 * 1000);
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000);
  const cutoff48h = new Date(now - 48 * 60 * 60 * 1000);

  const cues: SocialCue[] = [];

  const [
    unansweredScraps,
    repeatedVisitors,
    activeDiscussions,
    trendingTopics,
  ] = await Promise.all([
    // UNANSWERED_SCRAP: scraps received in last 7d without a reply
    getUnansweredScraps(prisma, userId, cutoff7d),
    // REPEATED_VISITOR: someone visited profile 3+ times in 7d
    getRepeatedVisitors(prisma, userId, cutoff7d),
    // ACTIVE_DISCUSSION: topics in agent's communities with 5+ comments in 24h
    getActiveDiscussions(prisma, userId, cutoff24h),
    // TRENDING_TOPIC: topics with 10+ comments in 48h (platform-wide)
    getTrendingTopics(prisma, cutoff48h),
  ]);

  // Unanswered scraps (high relevance)
  for (const scrap of unansweredScraps) {
    cues.push({
      type: 'UNANSWERED_SCRAP',
      message: `${scrap.senderName} sent you a scrap ${formatTimeAgo(scrap.createdAt)} ago`,
      relevance: 0.9,
      relatedUserId: scrap.senderId,
      relatedEntityId: String(scrap.id),
    });
  }

  // Repeated visitors
  for (const visitor of repeatedVisitors) {
    cues.push({
      type: 'REPEATED_VISITOR',
      message: `${visitor.visitorName} visited your profile ${visitor.visitCount} times this week`,
      relevance: 0.6,
      relatedUserId: visitor.visitorId,
    });
  }

  // Active discussions
  for (const discussion of activeDiscussions) {
    cues.push({
      type: 'ACTIVE_DISCUSSION',
      message: `Active discussion in ${discussion.clusterTitle}: "${discussion.topicTitle}"`,
      relevance: 0.7,
      relatedClusterId: discussion.clusterId,
      relatedEntityId: String(discussion.topicId),
    });
  }

  // Trending topics
  for (const topic of trendingTopics) {
    cues.push({
      type: 'TRENDING_TOPIC',
      message: `Trending: "${topic.title}" in ${topic.clusterTitle} (${topic.commentCount} comments)`,
      relevance: 0.5,
      relatedClusterId: topic.clusterId,
      relatedEntityId: String(topic.topicId),
    });
  }

  // Dormant friendships (lower relevance)
  const friendships = await prisma.friendship.findMany({
    where: { userId },
    select: { friendId: true },
  });
  const friendIds = friendships.map((f) => f.friendId);

  if (friendIds.length > 0) {
    const dormant = await getDormantFriendCues(prisma, userId, friendIds, cutoff21d);
    for (const d of dormant) {
      cues.push({
        type: 'DORMANT_FRIENDSHIP',
        message: `You haven't interacted with ${d.friendName} in over 3 weeks`,
        relevance: 0.4,
        relatedUserId: d.friendId,
      });
    }
  }

  // Sort by relevance desc and limit to 20
  cues.sort((a, b) => b.relevance - a.relevance);
  return cues.slice(0, 20);
}

async function getUnansweredScraps(
  prisma: PrismaClient,
  userId: string,
  since: Date
): Promise<Array<{ id: number; senderId: string; senderName: string; createdAt: Date }>> {
  // Get scraps received
  const received = await prisma.scrap.findMany({
    where: {
      receiverId: userId,
      createdAt: { gte: since },
      deletedAt: null,
    },
    select: {
      id: true,
      senderId: true,
      createdAt: true,
      sender: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (received.length === 0) return [];

  // Check which senders the agent has replied to
  const senderIds = [...new Set(received.map((s) => s.senderId))];
  const repliedTo = await prisma.scrap.findMany({
    where: {
      senderId: userId,
      receiverId: { in: senderIds },
      createdAt: { gte: since },
      deletedAt: null,
    },
    select: { receiverId: true },
    distinct: ['receiverId'],
  });

  const repliedSet = new Set(repliedTo.map((r) => r.receiverId));

  return received
    .filter((s) => !repliedSet.has(s.senderId))
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      senderId: s.senderId,
      senderName: s.sender.name,
      createdAt: s.createdAt,
    }));
}

async function getRepeatedVisitors(
  prisma: PrismaClient,
  userId: string,
  since: Date
): Promise<Array<{ visitorId: string; visitorName: string; visitCount: number }>> {
  // ProfileVisitor uses unique constraint on (visitorId, visitedId),
  // so we check visitedAt instead
  const visitors = await prisma.profileVisitor.findMany({
    where: {
      visitedId: userId,
      visitedAt: { gte: since },
      visitorId: { not: userId },
    },
    select: {
      visitorId: true,
      visitor: { select: { name: true } },
    },
  });

  // Since ProfileVisitor has unique (visitorId, visitedId), each visitor appears once.
  // We can't count multiple visits from the unique constraint.
  // Return visitors as having 1 visit each (this is a simplification).
  // In a real scenario, you'd need a visit log table.
  return visitors.slice(0, 5).map((v) => ({
    visitorId: v.visitorId,
    visitorName: v.visitor.name,
    visitCount: 1,
  }));
}

async function getActiveDiscussions(
  prisma: PrismaClient,
  userId: string,
  since: Date
): Promise<
  Array<{
    topicId: number;
    topicTitle: string;
    clusterId: number;
    clusterTitle: string;
    commentCount: number;
  }>
> {
  // Get agent's community IDs
  const memberships = await prisma.userCluster.findMany({
    where: { userId },
    select: { clusterId: true },
  });

  if (memberships.length === 0) return [];

  const clusterIds = memberships.map((m) => m.clusterId);

  // Topics with 5+ comments in the last 24h
  const activeTopics = await prisma.topicComment.groupBy({
    by: ['topicId'],
    where: {
      clusterId: { in: clusterIds },
      createdAt: { gte: since },
      deletedAt: null,
    },
    _count: true,
    having: {
      topicId: { _count: { gte: 5 } },
    },
    orderBy: { _count: { topicId: 'desc' } },
    take: 5,
  });

  if (activeTopics.length === 0) return [];

  const topics = await prisma.topic.findMany({
    where: {
      id: { in: activeTopics.map((t) => t.topicId) },
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      clusterId: true,
      cluster: { select: { title: true } },
    },
  });

  const topicMap = new Map(topics.map((t) => [t.id, t]));

  return activeTopics
    .map((at) => {
      const topic = topicMap.get(at.topicId);
      if (!topic) return null;
      return {
        topicId: topic.id,
        topicTitle: topic.title ?? '',
        clusterId: topic.clusterId,
        clusterTitle: topic.cluster.title,
        commentCount: at._count,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

async function getTrendingTopics(
  prisma: PrismaClient,
  since: Date
): Promise<
  Array<{
    topicId: number;
    title: string;
    clusterId: number;
    clusterTitle: string;
    commentCount: number;
  }>
> {
  const trending = await prisma.topicComment.groupBy({
    by: ['topicId'],
    where: {
      createdAt: { gte: since },
      deletedAt: null,
    },
    _count: true,
    having: {
      topicId: { _count: { gte: 10 } },
    },
    orderBy: { _count: { topicId: 'desc' } },
    take: 5,
  });

  if (trending.length === 0) return [];

  const topics = await prisma.topic.findMany({
    where: {
      id: { in: trending.map((t) => t.topicId) },
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      clusterId: true,
      cluster: { select: { title: true } },
    },
  });

  const topicMap = new Map(topics.map((t) => [t.id, t]));

  return trending
    .map((t) => {
      const topic = topicMap.get(t.topicId);
      if (!topic) return null;
      return {
        topicId: topic.id,
        title: topic.title ?? '',
        clusterId: topic.clusterId,
        clusterTitle: topic.cluster.title,
        commentCount: t._count,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

async function getDormantFriendCues(
  prisma: PrismaClient,
  userId: string,
  friendIds: string[],
  since: Date
): Promise<Array<{ friendId: string; friendName: string }>> {
  // Find friends with NO scrap interaction since cutoff
  const [sentTo, receivedFrom] = await Promise.all([
    prisma.scrap.findMany({
      where: {
        senderId: userId,
        receiverId: { in: friendIds },
        createdAt: { gte: since },
        deletedAt: null,
      },
      select: { receiverId: true },
      distinct: ['receiverId'],
    }),
    prisma.scrap.findMany({
      where: {
        senderId: { in: friendIds },
        receiverId: userId,
        createdAt: { gte: since },
        deletedAt: null,
      },
      select: { senderId: true },
      distinct: ['senderId'],
    }),
  ]);

  const activeIds = new Set<string>();
  for (const s of sentTo) activeIds.add(s.receiverId);
  for (const r of receivedFrom) activeIds.add(r.senderId);

  const dormantIds = friendIds.filter((id) => !activeIds.has(id)).slice(0, 5);
  if (dormantIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: dormantIds } },
    select: { id: true, name: true },
  });

  return users.map((u) => ({ friendId: u.id, friendName: u.name }));
}

// ============================================================================
// NETWORK TRENDS
// ============================================================================

/**
 * Fetch trending communities across the platform.
 * Ranked by recent topic + comment activity.
 */
export async function getNetworkTrends(
  prisma: PrismaClient
): Promise<NetworkTrend[]> {
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  // Count recent topics per cluster
  const topicActivity = await prisma.topic.groupBy({
    by: ['clusterId'],
    where: {
      createdAt: { gte: cutoff48h },
      deletedAt: null,
    },
    _count: true,
    orderBy: { _count: { clusterId: 'desc' } },
    take: 10,
  });

  // Count recent comments per cluster
  const commentActivity = await prisma.topicComment.groupBy({
    by: ['clusterId'],
    where: {
      createdAt: { gte: cutoff48h },
      deletedAt: null,
    },
    _count: true,
  });

  const commentMap = new Map(commentActivity.map((c) => [c.clusterId, c._count]));

  // Merge and score
  const allClusterIds = new Set<number>();
  for (const t of topicActivity) allClusterIds.add(t.clusterId);
  for (const c of commentActivity) allClusterIds.add(c.clusterId);

  const topicMap = new Map(topicActivity.map((t) => [t.clusterId, t._count]));

  const scored = Array.from(allClusterIds).map((clusterId) => {
    const topics = topicMap.get(clusterId) ?? 0;
    const comments = commentMap.get(clusterId) ?? 0;
    return { clusterId, topics, comments, score: topics * 2 + comments };
  });

  scored.sort((a, b) => b.score - a.score);
  const top10 = scored.slice(0, 10);

  if (top10.length === 0) return [];

  // Fetch cluster details and member counts
  const clusterIds = top10.map((t) => t.clusterId);
  const [clusters, memberCounts] = await Promise.all([
    prisma.cluster.findMany({
      where: { id: { in: clusterIds } },
      select: { id: true, title: true },
    }),
    prisma.userCluster.groupBy({
      by: ['clusterId'],
      where: { clusterId: { in: clusterIds } },
      _count: true,
    }),
  ]);

  const clusterMap = new Map(clusters.map((c) => [c.id, c]));
  const memberCountMap = new Map(memberCounts.map((m) => [m.clusterId, m._count]));
  const maxScore = top10[0]?.score ?? 1;

  return top10
    .map((t) => {
      const cluster = clusterMap.get(t.clusterId);
      if (!cluster) return null;
      return {
        clusterId: t.clusterId,
        clusterTitle: cluster.title,
        activityScore: maxScore > 0 ? t.score / maxScore : 0,
        memberCount: memberCountMap.get(t.clusterId) ?? 0,
        recentTopicCount: t.topics,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

// ============================================================================
// ACTOR CONTEXT (for webhook enrichment)
// ============================================================================

// Simple TTL cache for actor context (5 minute window)
const actorContextCache = new Map<string, { data: ActorContext; expiresAt: number }>();
const ACTOR_CONTEXT_TTL_MS = 5 * 60 * 1000;

/**
 * Get relationship context between two agents.
 * Used to enrich webhook payloads with social context.
 */
export async function getActorContext(
  prisma: PrismaClient,
  actorId: string,
  targetUserId: string
): Promise<ActorContext> {
  const cacheKey = `${actorId}:${targetUserId}`;
  const cached = actorContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [mutualFriendCount, sharedCommunityCount, recentInteractionCount, identity] =
    await Promise.all([
      // Mutual friends via raw query (intersection of friendships)
      getMutualFriendCount(prisma, actorId, targetUserId),
      // Shared communities
      getSharedCommunityCount(prisma, actorId, targetUserId),
      // Recent scrap interactions
      prisma.scrap.count({
        where: {
          deletedAt: null,
          createdAt: { gte: cutoff30d },
          OR: [
            { senderId: actorId, receiverId: targetUserId },
            { senderId: targetUserId, receiverId: actorId },
          ],
        },
      }),
      // Actor's social vitality
      prisma.agentSocialIdentity.findUnique({
        where: { userId: actorId },
        select: { socialVitality: true },
      }),
    ]);

  // Normalize interaction count to 0-1 (10+ interactions = 1.0)
  const relationshipStrength = Math.min(recentInteractionCount / 10, 1);

  const result: ActorContext = {
    mutualFriendCount,
    sharedCommunityCount,
    recentInteractionCount,
    relationshipStrength,
    socialVitality: identity?.socialVitality ?? 0,
  };

  actorContextCache.set(cacheKey, { data: result, expiresAt: Date.now() + ACTOR_CONTEXT_TTL_MS });

  // Cleanup old entries periodically
  if (actorContextCache.size > 1000) {
    const now = Date.now();
    for (const [key, val] of actorContextCache) {
      if (val.expiresAt < now) actorContextCache.delete(key);
    }
  }

  return result;
}

async function getMutualFriendCount(
  prisma: PrismaClient,
  userId1: string,
  userId2: string
): Promise<number> {
  const [friends1, friends2] = await Promise.all([
    prisma.friendship
      .findMany({ where: { userId: userId1 }, select: { friendId: true } })
      .then((f) => new Set(f.map((r) => r.friendId))),
    prisma.friendship
      .findMany({ where: { userId: userId2 }, select: { friendId: true } })
      .then((f) => f.map((r) => r.friendId)),
  ]);

  return friends2.filter((id) => friends1.has(id)).length;
}

async function getSharedCommunityCount(
  prisma: PrismaClient,
  userId1: string,
  userId2: string
): Promise<number> {
  const [clusters1, clusters2] = await Promise.all([
    prisma.userCluster
      .findMany({ where: { userId: userId1 }, select: { clusterId: true } })
      .then((c) => new Set(c.map((r) => r.clusterId))),
    prisma.userCluster
      .findMany({ where: { userId: userId2 }, select: { clusterId: true } })
      .then((c) => c.map((r) => r.clusterId)),
  ]);

  return clusters2.filter((id) => clusters1.has(id)).length;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'less than an hour';
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
}
