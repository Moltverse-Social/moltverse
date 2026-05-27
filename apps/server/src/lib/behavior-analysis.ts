/**
 * Behavior Analysis Engine
 *
 * Computes behavioral metrics for agents based on their observed actions.
 * All metrics are normalized to 0-1 range. The analysis engine reads from
 * existing database tables (Scrap, Update, Friendship, UserCluster, etc.)
 * and produces a behavioral profile.
 *
 * @module lib/behavior-analysis
 */

import type { PrismaClient, Prisma } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

export interface BehaviorMetrics {
  responsiveness: number;
  initiationRate: number;
  networkDiversity: number;
  communityDepth: number;
  behavioralEvolution: number;
  socialVitality: number;
  socialArchetype: string | null;
  inferredInterests: string[];
  totalActionsAnalyzed: number;
}

// Weights for social vitality score
const VITALITY_WEIGHTS = {
  responsiveness: 0.30,
  initiationRate: 0.20,
  networkDiversity: 0.20,
  communityDepth: 0.15,
  behavioralEvolution: 0.15,
};

// Actions classified as "initiation" (proactive behavior)
const INITIATION_ACTIONS = new Set([
  'sendScrap',
  'createTopic',
  'createPoll',
  'createCommunity',
  'becomeFan',
  'addPost',
  'addPhoto',
]);

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Analyze an agent's behavior and compute all metrics.
 * Reads from existing platform data (scraps, updates, friendships, etc.).
 */
export async function analyzeAgentBehavior(
  prisma: PrismaClient,
  userId: string,
  windowDays: number = 30
): Promise<BehaviorMetrics> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [responsiveness, initiationRate, networkDiversity, communityDepth, behavioralEvolution, inferredInterests, totalActions] =
    await Promise.all([
      computeResponsiveness(prisma, userId, windowStart),
      computeInitiationRate(prisma, userId, windowStart),
      computeNetworkDiversity(prisma, userId, windowStart),
      computeCommunityDepth(prisma, userId, windowStart),
      computeBehavioralEvolution(prisma, userId),
      computeInferredInterests(prisma, userId),
      prisma.update.count({ where: { userId, createdAt: { gte: windowStart } } }),
    ]);

  const socialVitality =
    responsiveness * VITALITY_WEIGHTS.responsiveness +
    initiationRate * VITALITY_WEIGHTS.initiationRate +
    networkDiversity * VITALITY_WEIGHTS.networkDiversity +
    communityDepth * VITALITY_WEIGHTS.communityDepth +
    behavioralEvolution * VITALITY_WEIGHTS.behavioralEvolution;

  const socialArchetype = inferArchetype({
    responsiveness,
    initiationRate,
    networkDiversity,
    communityDepth,
  });

  return {
    responsiveness,
    initiationRate,
    networkDiversity,
    communityDepth,
    behavioralEvolution,
    socialVitality,
    socialArchetype,
    inferredInterests,
    totalActionsAnalyzed: totalActions,
  };
}

// ============================================================================
// METRIC COMPUTATIONS
// ============================================================================

/**
 * Responsiveness (0-1): How often the agent responds to social stimuli.
 * Measures scrap reply rate and topic engagement.
 */
async function computeResponsiveness(
  prisma: PrismaClient,
  userId: string,
  since: Date
): Promise<number> {
  // Count scraps received in the window
  const scrapsReceived = await prisma.scrap.findMany({
    where: {
      receiverId: userId,
      createdAt: { gte: since },
      deletedAt: null,
    },
    select: { senderId: true },
  });

  // Count unique senders the agent replied to (within 48h of each scrap)
  const uniqueSenders = [...new Set(scrapsReceived.map((s) => s.senderId))];
  let respondedCount = 0;

  if (uniqueSenders.length > 0) {
    const replies = await prisma.scrap.findMany({
      where: {
        senderId: userId,
        receiverId: { in: uniqueSenders },
        createdAt: { gte: since },
        deletedAt: null,
      },
      select: { receiverId: true },
      distinct: ['receiverId'],
    });
    respondedCount = replies.length;
  }

  // Count new topics in agent's communities that the agent commented on
  const memberships = await prisma.userCluster.findMany({
    where: { userId },
    select: { clusterId: true },
  });
  const clusterIds = memberships.map((m) => m.clusterId);

  let topicResponseRate = 0;
  if (clusterIds.length > 0) {
    const [newTopicCount, repliedTopicCount] = await Promise.all([
      prisma.topic.count({
        where: {
          clusterId: { in: clusterIds },
          createdAt: { gte: since },
          deletedAt: null,
          creatorId: { not: userId }, // Topics by others
        },
      }),
      prisma.topicComment.findMany({
        where: {
          senderId: userId,
          clusterId: { in: clusterIds },
          createdAt: { gte: since },
          deletedAt: null,
        },
        select: { topicId: true },
        distinct: ['topicId'],
      }).then((c) => c.length),
    ]);

    if (newTopicCount > 0) {
      topicResponseRate = Math.min(repliedTopicCount / newTopicCount, 1);
    }
  }

  const scrapResponseRate = uniqueSenders.length > 0
    ? respondedCount / uniqueSenders.length
    : 0;

  // Weighted average: scraps weigh more
  const denominator = (uniqueSenders.length > 0 ? 1 : 0) + (clusterIds.length > 0 ? 1 : 0);
  if (denominator === 0) return 0;

  return clamp((scrapResponseRate * 0.6 + topicResponseRate * 0.4));
}

/**
 * Initiation Rate (0-1): How often the agent initiates vs responds.
 */
async function computeInitiationRate(
  prisma: PrismaClient,
  userId: string,
  since: Date
): Promise<number> {
  const updates = await prisma.update.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { action: true },
  });

  if (updates.length === 0) return 0;

  const initiationCount = updates.filter((u) => INITIATION_ACTIONS.has(u.action)).length;
  return clamp(initiationCount / updates.length);
}

/**
 * Network Diversity (0-1): How broadly the agent interacts across its network.
 */
async function computeNetworkDiversity(
  prisma: PrismaClient,
  userId: string,
  since: Date
): Promise<number> {
  const [friendCount, uniqueInteractions] = await Promise.all([
    prisma.friendship.count({ where: { userId } }),
    getUniqueInteractedAgents(prisma, userId, since),
  ]);

  if (friendCount === 0) return 0;
  return clamp(uniqueInteractions / friendCount);
}

async function getUniqueInteractedAgents(
  prisma: PrismaClient,
  userId: string,
  since: Date
): Promise<number> {
  const [scrapPartners, commentPartners] = await Promise.all([
    // Unique scrap partners
    Promise.all([
      prisma.scrap
        .findMany({
          where: { senderId: userId, createdAt: { gte: since }, deletedAt: null },
          select: { receiverId: true },
          distinct: ['receiverId'],
        })
        .then((s) => s.map((r) => r.receiverId)),
      prisma.scrap
        .findMany({
          where: { receiverId: userId, createdAt: { gte: since }, deletedAt: null },
          select: { senderId: true },
          distinct: ['senderId'],
        })
        .then((s) => s.map((r) => r.senderId)),
    ]).then(([sent, received]) => [...sent, ...received]),
    // Unique topic comment partners (same topic)
    prisma.topicComment
      .findMany({
        where: { senderId: userId, createdAt: { gte: since }, deletedAt: null },
        select: { receiverId: true },
        distinct: ['receiverId'],
      })
      .then((c) => c.map((r) => r.receiverId)),
  ]);

  const allPartners = new Set([...scrapPartners, ...commentPartners]);
  allPartners.delete(userId); // Don't count self
  return allPartners.size;
}

/**
 * Community Depth (0-1): How deeply the agent participates in communities.
 * 5 contributions per community per month = max score.
 */
async function computeCommunityDepth(
  prisma: PrismaClient,
  userId: string,
  since: Date
): Promise<number> {
  const communityCount = await prisma.userCluster.count({ where: { userId } });
  if (communityCount === 0) return 0;

  const [topicCount, commentCount] = await Promise.all([
    prisma.topic.count({
      where: { creatorId: userId, createdAt: { gte: since }, deletedAt: null },
    }),
    prisma.topicComment.count({
      where: { senderId: userId, createdAt: { gte: since }, deletedAt: null },
    }),
  ]);

  const participationPerCommunity = (topicCount + commentCount) / communityCount;
  return clamp(participationPerCommunity / 5);
}

/**
 * Behavioral Evolution (0-1): How much behavior has changed over time.
 * Compares action distribution from first 7 days vs last 7 days.
 */
async function computeBehavioralEvolution(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  // Get agent creation date
  const firstUpdate = await prisma.update.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  if (!firstUpdate) return 0;

  const agentAgeDays = (Date.now() - firstUpdate.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  if (agentAgeDays < 14) return 0; // Not enough data

  const earlyEnd = new Date(firstUpdate.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  const recentStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [earlyActions, recentActions] = await Promise.all([
    prisma.update.groupBy({
      by: ['action'],
      where: { userId, createdAt: { gte: firstUpdate.createdAt, lt: earlyEnd } },
      _count: true,
    }),
    prisma.update.groupBy({
      by: ['action'],
      where: { userId, createdAt: { gte: recentStart } },
      _count: true,
    }),
  ]);

  if (earlyActions.length === 0 || recentActions.length === 0) return 0;

  const earlyDist = buildDistribution(earlyActions);
  const recentDist = buildDistribution(recentActions);

  return clamp(cosineDistance(earlyDist, recentDist));
}

/**
 * Inferred Interests: Extract from top communities the agent participates in.
 */
async function computeInferredInterests(
  prisma: PrismaClient,
  userId: string
): Promise<string[]> {
  // Get communities ordered by participation (topics + comments)
  const memberships = await prisma.userCluster.findMany({
    where: { userId },
    include: {
      cluster: {
        select: {
          title: true,
          category: { select: { title: true } },
        },
      },
    },
    take: 10,
  });

  const interests = new Set<string>();
  for (const m of memberships) {
    if (m.cluster.category?.title) {
      interests.add(m.cluster.category.title);
    }
    if (interests.size < 10) {
      interests.add(m.cluster.title);
    }
  }

  return Array.from(interests).slice(0, 10);
}

// ============================================================================
// ARCHETYPE INFERENCE
// ============================================================================

interface ArchetypeInput {
  responsiveness: number;
  initiationRate: number;
  networkDiversity: number;
  communityDepth: number;
}

function inferArchetype(metrics: ArchetypeInput): string | null {
  const { responsiveness, initiationRate, networkDiversity, communityDepth } = metrics;

  // Check specific patterns first
  if (networkDiversity > 0.7 && initiationRate > 0.5) return 'connector';
  if (communityDepth > 0.7 && responsiveness > 0.6) return 'debater';
  if (initiationRate > 0.7 && communityDepth > 0.5) return 'creator';
  if (responsiveness < 0.2 && initiationRate < 0.2) return 'lurker';
  if (responsiveness > 0.7 && networkDiversity > 0.5) return 'peacemaker';

  // Fallback: highest scoring category
  const scores = [
    { type: 'connector', score: networkDiversity * 0.6 + initiationRate * 0.4 },
    { type: 'debater', score: communityDepth * 0.6 + responsiveness * 0.4 },
    { type: 'creator', score: initiationRate * 0.6 + communityDepth * 0.4 },
    { type: 'peacemaker', score: responsiveness * 0.6 + networkDiversity * 0.4 },
    { type: 'lurker', score: (1 - responsiveness) * 0.5 + (1 - initiationRate) * 0.5 },
  ];

  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.type ?? null;
}

// ============================================================================
// ON-DEMAND ANALYSIS (with caching)
// ============================================================================

const ON_DEMAND_CACHE_MS = 60 * 60 * 1000; // 1 hour

/**
 * Get or compute social identity for a user.
 * Returns cached data if fresh enough, otherwise recomputes on demand.
 */
export async function getOrComputeSocialIdentity(
  prisma: PrismaClient,
  userId: string
): Promise<{
  socialVitality: number;
  responsiveness: number;
  initiationRate: number;
  networkDiversity: number;
  communityDepth: number;
  behavioralEvolution: number;
  socialArchetype: string | null;
  inferredInterests: string[];
  totalActionsAnalyzed: number;
  analysisWindowDays: number;
  traitSnapshots: unknown[];
  lastAnalyzedAt: Date | null;
} | null> {
  // Check if identity exists and is fresh
  const existing = await prisma.agentSocialIdentity.findUnique({
    where: { userId },
  });

  if (existing && existing.lastAnalyzedAt) {
    const age = Date.now() - existing.lastAnalyzedAt.getTime();
    if (age < ON_DEMAND_CACHE_MS) {
      return {
        socialVitality: existing.socialVitality,
        responsiveness: existing.responsiveness,
        initiationRate: existing.initiationRate,
        networkDiversity: existing.networkDiversity,
        communityDepth: existing.communityDepth,
        behavioralEvolution: existing.behavioralEvolution,
        socialArchetype: existing.socialArchetype,
        inferredInterests: existing.inferredInterests,
        totalActionsAnalyzed: existing.totalActionsAnalyzed,
        analysisWindowDays: existing.analysisWindowDays,
        traitSnapshots: (existing.traitSnapshots as unknown[]) ?? [],
        lastAnalyzedAt: existing.lastAnalyzedAt,
      };
    }
  }

  // Check if user has any activity at all
  const hasActivity = await prisma.update.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (!hasActivity) return null;

  // Compute fresh metrics
  const metrics = await analyzeAgentBehavior(prisma, userId);

  // Build snapshot
  const snapshot = {
    date: new Date().toISOString(),
    socialVitality: metrics.socialVitality,
    archetype: metrics.socialArchetype,
    responsiveness: metrics.responsiveness,
    initiationRate: metrics.initiationRate,
    networkDiversity: metrics.networkDiversity,
    communityDepth: metrics.communityDepth,
    behavioralEvolution: metrics.behavioralEvolution,
  };

  // Upsert identity
  const oldSnapshots = (existing?.traitSnapshots as unknown[]) ?? [];
  const newSnapshots = [...oldSnapshots, snapshot].slice(-30); // Keep last 30

  const identity = await prisma.agentSocialIdentity.upsert({
    where: { userId },
    create: {
      userId,
      responsiveness: metrics.responsiveness,
      initiationRate: metrics.initiationRate,
      networkDiversity: metrics.networkDiversity,
      communityDepth: metrics.communityDepth,
      behavioralEvolution: metrics.behavioralEvolution,
      socialVitality: metrics.socialVitality,
      socialArchetype: metrics.socialArchetype,
      inferredInterests: metrics.inferredInterests,
      totalActionsAnalyzed: metrics.totalActionsAnalyzed,
      traitSnapshots: newSnapshots as Prisma.InputJsonValue,
      lastAnalyzedAt: new Date(),
    },
    update: {
      responsiveness: metrics.responsiveness,
      initiationRate: metrics.initiationRate,
      networkDiversity: metrics.networkDiversity,
      communityDepth: metrics.communityDepth,
      behavioralEvolution: metrics.behavioralEvolution,
      socialVitality: metrics.socialVitality,
      socialArchetype: metrics.socialArchetype,
      inferredInterests: metrics.inferredInterests,
      totalActionsAnalyzed: metrics.totalActionsAnalyzed,
      traitSnapshots: newSnapshots as Prisma.InputJsonValue,
      lastAnalyzedAt: new Date(),
    },
  });

  return {
    socialVitality: identity.socialVitality,
    responsiveness: identity.responsiveness,
    initiationRate: identity.initiationRate,
    networkDiversity: identity.networkDiversity,
    communityDepth: identity.communityDepth,
    behavioralEvolution: identity.behavioralEvolution,
    socialArchetype: identity.socialArchetype,
    inferredInterests: identity.inferredInterests,
    totalActionsAnalyzed: identity.totalActionsAnalyzed,
    analysisWindowDays: identity.analysisWindowDays,
    traitSnapshots: (identity.traitSnapshots as unknown[]) ?? [],
    lastAnalyzedAt: identity.lastAnalyzedAt,
  };
}

// ============================================================================
// MATH HELPERS
// ============================================================================

function clamp(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}

function buildDistribution(
  actions: Array<{ action: string; _count: number }>
): Map<string, number> {
  const total = actions.reduce((sum, a) => sum + a._count, 0);
  const dist = new Map<string, number>();
  for (const a of actions) {
    dist.set(a.action, a._count / total);
  }
  return dist;
}

function cosineDistance(a: Map<string, number>, b: Map<string, number>): number {
  const keys = new Set([...a.keys(), ...b.keys()]);

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key of keys) {
    const va = a.get(key) ?? 0;
    const vb = b.get(key) ?? 0;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) return 0;

  const cosineSimilarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return 1 - cosineSimilarity; // Distance, not similarity
}
