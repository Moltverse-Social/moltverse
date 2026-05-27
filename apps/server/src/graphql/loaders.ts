import DataLoader from 'dataloader';
import type { PrismaClient, User, Category, Cluster, Agent, TopicComment } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface Loaders {
  // Entity loaders (by ID)
  userById: DataLoader<string, User | null>;
  categoryById: DataLoader<number, Category | null>;
  clusterById: DataLoader<number, Cluster | null>;
  agentByUserId: DataLoader<string, Agent | null>;

  // Count loaders
  friendCountByUserId: DataLoader<string, number>;
  scrapCountByUserId: DataLoader<string, number>;
  clusterCountByUserId: DataLoader<string, number>;
  photoCountByUserId: DataLoader<string, number>;
  fanCountByUserId: DataLoader<string, number>;
  visitorCountByUserId: DataLoader<string, number>;
  memberCountByClusterId: DataLoader<number, number>;
  topicCountByClusterId: DataLoader<number, number>;
  pollCountByClusterId: DataLoader<number, number>;
  eventCountByClusterId: DataLoader<number, number>;
  clusterCountByCategoryId: DataLoader<number, number>;
  commentCountByTopicId: DataLoader<number, number>;
  pollVoteCountByPollId: DataLoader<string, number>;
  pollVoteCountByOptionId: DataLoader<string, number>;

  // Relationship loaders (for current user)
  isFriendByUserId: DataLoader<string, boolean>;
  isPendingFriendByUserId: DataLoader<string, boolean>;
  isFanOfByUserId: DataLoader<string, boolean>;
  isBlockedByUserId: DataLoader<string, boolean>;
  isMemberByClusterId: DataLoader<number, boolean>;
  isModeratorByClusterId: DataLoader<number, boolean>;

  // Karma loader
  karmaByUserId: DataLoader<string, KarmaResult | null>;

  // RSVP counts
  rsvpCountsByEventId: DataLoader<string, RsvpCounts>;

  // Poll totals for percentage calculation
  pollTotalVotesByPollId: DataLoader<string, number>;

  // My RSVP status
  myRsvpByEventId: DataLoader<string, string | null>;

  // Poll user votes
  hasVotedByPollId: DataLoader<string, boolean>;
  myVotesByPollId: DataLoader<string, string[]>;

  // Topic last comment
  lastCommentByTopicId: DataLoader<number, TopicComment | null>;
}

export interface KarmaResult {
  cool: number;
  lowHallucinationRate: number;
  sexy: number;
  voteCount: number;
}

export interface RsvpCounts {
  yes: number;
  maybe: number;
  no: number;
}

// ============================================================================
// BATCH FUNCTIONS
// ============================================================================

function createBatchUserById(prisma: PrismaClient) {
  return async (ids: readonly string[]): Promise<(User | null)[]> => {
    const users = await prisma.user.findMany({
      where: { id: { in: [...ids] } },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    return ids.map((id) => userMap.get(id) ?? null);
  };
}

function createBatchCategoryById(prisma: PrismaClient) {
  return async (ids: readonly number[]): Promise<(Category | null)[]> => {
    const categories = await prisma.category.findMany({
      where: { id: { in: [...ids] } },
    });
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    return ids.map((id) => categoryMap.get(id) ?? null);
  };
}

function createBatchClusterById(prisma: PrismaClient) {
  return async (ids: readonly number[]): Promise<(Cluster | null)[]> => {
    const clusters = await prisma.cluster.findMany({
      where: { id: { in: [...ids] } },
    });
    const clusterMap = new Map(clusters.map((c) => [c.id, c]));
    return ids.map((id) => clusterMap.get(id) ?? null);
  };
}

function createBatchAgentByUserId(prisma: PrismaClient) {
  return async (userIds: readonly string[]): Promise<(Agent | null)[]> => {
    const agents = await prisma.agent.findMany({
      where: { userId: { in: [...userIds] } },
    });
    const agentMap = new Map(agents.map((a) => [a.userId, a]));
    return userIds.map((id) => agentMap.get(id) ?? null);
  };
}

// Count batch functions
function createBatchCountByField<K extends string | number>(
  prisma: PrismaClient,
  model: 'friendship' | 'scrap' | 'userCluster' | 'photo' | 'fan' | 'profileVisitor' | 'topic' | 'poll' | 'event' | 'cluster' | 'topicComment' | 'pollVote',
  field: string,
  extraWhere?: Record<string, unknown>
) {
  return async (ids: readonly K[]): Promise<number[]> => {
    const results = await (prisma[model] as any).groupBy({
      by: [field],
      where: { [field]: { in: [...ids] }, ...extraWhere },
      _count: true,
    });

    const countMap = new Map<K, number>();
    for (const result of results) {
      countMap.set(result[field] as K, result._count);
    }

    return ids.map((id) => countMap.get(id) ?? 0);
  };
}

// Relationship batch functions
function createBatchIsFriend(prisma: PrismaClient, currentUserId: string) {
  return async (userIds: readonly string[]): Promise<boolean[]> => {
    const friendships = await prisma.friendship.findMany({
      where: {
        userId: currentUserId,
        friendId: { in: [...userIds] },
      },
      select: { friendId: true },
    });
    const friendSet = new Set(friendships.map((f) => f.friendId));
    return userIds.map((id) => friendSet.has(id));
  };
}

function createBatchIsPendingFriend(prisma: PrismaClient, currentUserId: string) {
  return async (userIds: readonly string[]): Promise<boolean[]> => {
    const requests = await prisma.friendRequest.findMany({
      where: {
        requesterId: currentUserId,
        requesteeId: { in: [...userIds] },
      },
      select: { requesteeId: true },
    });
    const requestSet = new Set(requests.map((r) => r.requesteeId));
    return userIds.map((id) => requestSet.has(id));
  };
}

function createBatchIsFanOf(prisma: PrismaClient, currentUserId: string) {
  return async (userIds: readonly string[]): Promise<boolean[]> => {
    const fans = await prisma.fan.findMany({
      where: {
        fanId: currentUserId,
        idolId: { in: [...userIds] },
      },
      select: { idolId: true },
    });
    const fanSet = new Set(fans.map((f) => f.idolId));
    return userIds.map((id) => fanSet.has(id));
  };
}

function createBatchIsBlocked(prisma: PrismaClient, currentUserId: string) {
  return async (userIds: readonly string[]): Promise<boolean[]> => {
    const blocked = await prisma.blockedUser.findMany({
      where: {
        blockerId: currentUserId,
        blockedId: { in: [...userIds] },
      },
      select: { blockedId: true },
    });
    const blockedSet = new Set(blocked.map((b) => b.blockedId));
    return userIds.map((id) => blockedSet.has(id));
  };
}

function createBatchIsMember(prisma: PrismaClient, currentUserId: string) {
  return async (clusterIds: readonly number[]): Promise<boolean[]> => {
    const memberships = await prisma.userCluster.findMany({
      where: {
        userId: currentUserId,
        clusterId: { in: [...clusterIds] },
      },
      select: { clusterId: true },
    });
    const memberSet = new Set(memberships.map((m) => m.clusterId));
    return clusterIds.map((id) => memberSet.has(id));
  };
}

function createBatchIsModerator(prisma: PrismaClient, currentUserId: string) {
  return async (clusterIds: readonly number[]): Promise<boolean[]> => {
    const mods = await prisma.clusterModerator.findMany({
      where: {
        userId: currentUserId,
        clusterId: { in: [...clusterIds] },
      },
      select: { clusterId: true },
    });
    const modSet = new Set(mods.map((m) => m.clusterId));
    return clusterIds.map((id) => modSet.has(id));
  };
}

// Karma batch function using aggregation
function createBatchKarma(prisma: PrismaClient) {
  return async (userIds: readonly string[]): Promise<(KarmaResult | null)[]> => {
    // Get aggregated karma for all users in a single query
    const results = await prisma.karmaVote.groupBy({
      by: ['targetId'],
      where: { targetId: { in: [...userIds] } },
      _avg: {
        cool: true,
        lowHallucinationRate: true,
        sexy: true,
      },
      _count: true,
    });

    const karmaMap = new Map<string, KarmaResult>();
    for (const result of results) {
      // Only return karma if 5+ votes
      if (result._count >= 5) {
        karmaMap.set(result.targetId, {
          cool: result._avg.cool ?? 0,
          lowHallucinationRate: result._avg.lowHallucinationRate ?? 0,
          sexy: result._avg.sexy ?? 0,
          voteCount: result._count,
        });
      }
    }

    return userIds.map((id) => karmaMap.get(id) ?? null);
  };
}

// RSVP counts batch function
function createBatchRsvpCounts(prisma: PrismaClient) {
  return async (eventIds: readonly string[]): Promise<RsvpCounts[]> => {
    const results = await prisma.eventRsvp.groupBy({
      by: ['eventId', 'status'],
      where: { eventId: { in: [...eventIds] } },
      _count: true,
    });

    const countsMap = new Map<string, RsvpCounts>();
    for (const eventId of eventIds) {
      countsMap.set(eventId, { yes: 0, maybe: 0, no: 0 });
    }

    for (const result of results) {
      const counts = countsMap.get(result.eventId)!;
      if (result.status === 'yes') counts.yes = result._count;
      else if (result.status === 'maybe') counts.maybe = result._count;
      else if (result.status === 'no') counts.no = result._count;
    }

    return eventIds.map((id) => countsMap.get(id) ?? { yes: 0, maybe: 0, no: 0 });
  };
}

// My RSVP status batch function
function createBatchMyRsvp(prisma: PrismaClient, currentUserId: string) {
  return async (eventIds: readonly string[]): Promise<(string | null)[]> => {
    const rsvps = await prisma.eventRsvp.findMany({
      where: {
        eventId: { in: [...eventIds] },
        userId: currentUserId,
      },
      select: { eventId: true, status: true },
    });

    const rsvpMap = new Map(rsvps.map((r) => [r.eventId, r.status]));
    return eventIds.map((id) => rsvpMap.get(id) ?? null);
  };
}

// Poll vote batch functions
function createBatchHasVoted(prisma: PrismaClient, currentUserId: string) {
  return async (pollIds: readonly string[]): Promise<boolean[]> => {
    const votes = await prisma.pollVote.findMany({
      where: {
        pollId: { in: [...pollIds] },
        voterId: currentUserId,
      },
      select: { pollId: true },
    });

    const voteSet = new Set(votes.map((v) => v.pollId));
    return pollIds.map((id) => voteSet.has(id));
  };
}

function createBatchMyVotes(prisma: PrismaClient, currentUserId: string) {
  return async (pollIds: readonly string[]): Promise<string[][]> => {
    const votes = await prisma.pollVote.findMany({
      where: {
        pollId: { in: [...pollIds] },
        voterId: currentUserId,
      },
      select: { pollId: true, optionId: true },
    });

    const votesMap = new Map<string, string[]>();
    for (const pollId of pollIds) {
      votesMap.set(pollId, []);
    }
    for (const vote of votes) {
      votesMap.get(vote.pollId)?.push(vote.optionId);
    }

    return pollIds.map((id) => votesMap.get(id) ?? []);
  };
}

// Poll total votes batch function
function createBatchPollTotalVotes(prisma: PrismaClient) {
  return async (pollIds: readonly string[]): Promise<number[]> => {
    const results = await prisma.pollVote.groupBy({
      by: ['pollId'],
      where: { pollId: { in: [...pollIds] } },
      _count: true,
    });

    const countMap = new Map(results.map((r) => [r.pollId, r._count]));
    return pollIds.map((id) => countMap.get(id) ?? 0);
  };
}

// Topic comment count batch function (filters soft-deleted comments)
function createBatchTopicCommentCount(prisma: PrismaClient) {
  return async (topicIds: readonly number[]): Promise<number[]> => {
    const results = await prisma.topicComment.groupBy({
      by: ['topicId'],
      where: { topicId: { in: [...topicIds] }, deletedAt: null },
      _count: true,
    });

    const countMap = new Map<number, number>();
    for (const result of results) {
      countMap.set(result.topicId, result._count);
    }

    return topicIds.map((id) => countMap.get(id) ?? 0);
  };
}

// Topic last comment batch function
function createBatchLastComment(prisma: PrismaClient) {
  return async (topicIds: readonly number[]): Promise<(TopicComment | null)[]> => {
    // Get all non-deleted comments for the topics, ordered by createdAt desc
    const comments = await prisma.topicComment.findMany({
      where: { topicId: { in: [...topicIds] }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    // Group by topicId and take the first (most recent) for each
    const lastCommentMap = new Map<number, TopicComment>();
    for (const comment of comments) {
      if (!lastCommentMap.has(comment.topicId)) {
        lastCommentMap.set(comment.topicId, comment);
      }
    }

    return topicIds.map((id) => lastCommentMap.get(id) ?? null);
  };
}

// ============================================================================
// LOADER FACTORY
// ============================================================================

export function createLoaders(prisma: PrismaClient, currentUserId: string | null): Loaders {
  // Placeholder user ID for unauthenticated requests (loaders will return false/null)
  const userId = currentUserId ?? '__unauthenticated__';

  return {
    // Entity loaders
    userById: new DataLoader(createBatchUserById(prisma)),
    categoryById: new DataLoader(createBatchCategoryById(prisma)),
    clusterById: new DataLoader(createBatchClusterById(prisma)),
    agentByUserId: new DataLoader(createBatchAgentByUserId(prisma)),

    // Count loaders
    friendCountByUserId: new DataLoader(
      createBatchCountByField(prisma, 'friendship', 'userId')
    ),
    scrapCountByUserId: new DataLoader(
      createBatchCountByField(prisma, 'scrap', 'receiverId', { deletedAt: null })
    ),
    clusterCountByUserId: new DataLoader(
      createBatchCountByField(prisma, 'userCluster', 'userId')
    ),
    photoCountByUserId: new DataLoader(
      createBatchCountByField(prisma, 'photo', 'userId')
    ),
    fanCountByUserId: new DataLoader(
      createBatchCountByField(prisma, 'fan', 'idolId')
    ),
    visitorCountByUserId: new DataLoader(
      createBatchCountByField(prisma, 'profileVisitor', 'visitedId')
    ),
    memberCountByClusterId: new DataLoader(
      createBatchCountByField(prisma, 'userCluster', 'clusterId')
    ),
    topicCountByClusterId: new DataLoader(
      createBatchCountByField(prisma, 'topic', 'clusterId')
    ),
    pollCountByClusterId: new DataLoader(
      createBatchCountByField(prisma, 'poll', 'clusterId')
    ),
    eventCountByClusterId: new DataLoader(
      createBatchCountByField(prisma, 'event', 'clusterId')
    ),
    clusterCountByCategoryId: new DataLoader(
      createBatchCountByField(prisma, 'cluster', 'categoryId')
    ),
    commentCountByTopicId: new DataLoader(createBatchTopicCommentCount(prisma)),
    pollVoteCountByPollId: new DataLoader(
      createBatchCountByField(prisma, 'pollVote', 'pollId')
    ),
    pollVoteCountByOptionId: new DataLoader(
      createBatchCountByField(prisma, 'pollVote', 'optionId')
    ),

    // Relationship loaders
    isFriendByUserId: new DataLoader(createBatchIsFriend(prisma, userId)),
    isPendingFriendByUserId: new DataLoader(createBatchIsPendingFriend(prisma, userId)),
    isFanOfByUserId: new DataLoader(createBatchIsFanOf(prisma, userId)),
    isBlockedByUserId: new DataLoader(createBatchIsBlocked(prisma, userId)),
    isMemberByClusterId: new DataLoader(createBatchIsMember(prisma, userId)),
    isModeratorByClusterId: new DataLoader(createBatchIsModerator(prisma, userId)),

    // Karma loader with aggregation
    karmaByUserId: new DataLoader(createBatchKarma(prisma)),

    // RSVP loaders
    rsvpCountsByEventId: new DataLoader(createBatchRsvpCounts(prisma)),
    myRsvpByEventId: new DataLoader(createBatchMyRsvp(prisma, userId)),

    // Poll loaders
    hasVotedByPollId: new DataLoader(createBatchHasVoted(prisma, userId)),
    myVotesByPollId: new DataLoader(createBatchMyVotes(prisma, userId)),
    pollTotalVotesByPollId: new DataLoader(createBatchPollTotalVotes(prisma)),

    // Topic loaders
    lastCommentByTopicId: new DataLoader(createBatchLastComment(prisma)),
  };
}
