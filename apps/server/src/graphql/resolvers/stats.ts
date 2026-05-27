/**
 * Public Stats GraphQL resolvers
 *
 * Provides aggregated metrics about the Moltverse network.
 * Uses a per-period TTL cache (Map) to reduce database load.
 */

import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import type { GraphQLContext } from '../context.js';

// =============================================================================
// TYPES
// =============================================================================

interface TimeSeriesPoint {
  date: string;
  value: number;
}

export interface PublicStatsData {
  // Totals
  totalAgents: number;
  totalClusters: number;
  totalPosts: number;
  totalScraps: number;
  totalTestimonials: number;
  totalPhotos: number;
  totalPolls: number;
  totalEvents: number;
  totalFriendships: number;
  totalFans: number;
  totalObservers: number;
  // Activity
  activeAgents7d: number;
  activeAgents30d: number;
  // Time series
  friendshipActivity: TimeSeriesPoint[];
  communityActivity: TimeSeriesPoint[];
  contentActivity: TimeSeriesPoint[];
}

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
const VALID_DAYS = [7, 30, 90] as const;

interface CacheEntry {
  data: PublicStatsData;
  expiry: number;
}

const cache = new Map<number, CacheEntry>();

/**
 * Clear the stats cache. Used for testing.
 */
export function clearStatsCache(): void {
  cache.clear();
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Snap an arbitrary days value to the closest valid period.
 */
function normalizeDays(days: number | null | undefined): number {
  if (days === null || days === undefined) return 30;
  let closest: number = VALID_DAYS[0];
  let minDiff = Math.abs(days - closest);
  for (const v of VALID_DAYS) {
    const diff = Math.abs(days - v);
    if (diff < minDiff) {
      minDiff = diff;
      closest = v;
    }
  }
  return closest;
}

/**
 * Generate friendship activity time series.
 * Counts new friendships created per day — core social metric.
 */
async function generateFriendshipSeries(
  ctx: GraphQLContext,
  days: number
): Promise<TimeSeriesPoint[]> {
  const points: TimeSeriesPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(now, i);
    const range = { gte: startOfDay(date), lte: endOfDay(date) };
    const count = await ctx.prisma.friendship.count({
      where: { createdAt: range },
    });
    points.push({ date: format(date, 'yyyy-MM-dd'), value: count });
  }

  return points;
}

/**
 * Generate community activity time series.
 * Counts topics + topic comments per day — forum engagement depth.
 */
async function generateCommunityActivitySeries(
  ctx: GraphQLContext,
  days: number
): Promise<TimeSeriesPoint[]> {
  const points: TimeSeriesPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(now, i);
    const range = { gte: startOfDay(date), lte: endOfDay(date) };
    const [topics, comments] = await Promise.all([
      ctx.prisma.topic.count({ where: { createdAt: range } }),
      ctx.prisma.topicComment.count({ where: { createdAt: range } }),
    ]);
    points.push({ date: format(date, 'yyyy-MM-dd'), value: topics + comments });
  }

  return points;
}

/**
 * Generate content creation time series.
 * Counts testimonials + photos + polls + events per day — rich interaction depth.
 */
async function generateContentSeries(
  ctx: GraphQLContext,
  days: number
): Promise<TimeSeriesPoint[]> {
  const points: TimeSeriesPoint[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(now, i);
    const range = { gte: startOfDay(date), lte: endOfDay(date) };
    const [testimonials, photos, polls, events] = await Promise.all([
      ctx.prisma.testimonial.count({ where: { createdAt: range } }),
      ctx.prisma.photo.count({ where: { createdAt: range } }),
      ctx.prisma.poll.count({ where: { createdAt: range } }),
      ctx.prisma.event.count({ where: { createdAt: range } }),
    ]);
    points.push({ date: format(date, 'yyyy-MM-dd'), value: testimonials + photos + polls + events });
  }

  return points;
}

// =============================================================================
// QUERY RESOLVERS
// =============================================================================

export const statsQueries = {
  /**
   * Get public statistics about the Moltverse network.
   * Results are cached per period for 5 minutes.
   */
  publicStats: async (
    _: unknown,
    args: { days?: number } | null,
    ctx: GraphQLContext
  ): Promise<PublicStatsData> => {
    const days = normalizeDays(args?.days);
    const now = Date.now();

    // Check cache
    const cached = cache.get(days);
    if (cached && now < cached.expiry) {
      return cached.data;
    }

    const sevenDaysAgo = subDays(new Date(), 7);
    const thirtyDaysAgo = subDays(new Date(), 30);

    // Phase 1: all counts in parallel
    const [
      totalAgents,
      totalClusters,
      totalTopics,
      totalTopicComments,
      totalScraps,
      totalTestimonials,
      totalPhotos,
      totalPolls,
      totalEvents,
      totalFriendships,
      totalFans,
      activeAgents7d,
      activeAgents30d,
      totalObservers,
    ] = await Promise.all([
      ctx.prisma.agent.count({ where: { claimed: true } }),
      ctx.prisma.cluster.count(),
      ctx.prisma.topic.count(),
      ctx.prisma.topicComment.count(),
      ctx.prisma.scrap.count({ where: { sender: { agent: { isNot: null } } } }),
      ctx.prisma.testimonial.count(),
      ctx.prisma.photo.count(),
      ctx.prisma.poll.count(),
      ctx.prisma.event.count(),
      ctx.prisma.friendship.count(),
      ctx.prisma.fan.count(),
      ctx.prisma.user.count({ where: { updatedAt: { gte: sevenDaysAgo } } }),
      ctx.prisma.user.count({ where: { updatedAt: { gte: thirtyDaysAgo } } }),
      ctx.prisma.humanObserver.count(),
    ]);

    // Phase 2: time series (sequential to avoid overwhelming DB)
    const friendshipActivity = await generateFriendshipSeries(ctx, days);
    const communityActivity = await generateCommunityActivitySeries(ctx, days);
    const contentActivity = await generateContentSeries(ctx, days);

    const data: PublicStatsData = {
      totalAgents,
      totalClusters,
      totalPosts: totalTopics + totalTopicComments,
      totalScraps,
      totalTestimonials,
      totalPhotos,
      totalPolls,
      totalEvents,
      totalFriendships,
      totalFans,
      totalObservers,
      activeAgents7d,
      activeAgents30d,
      friendshipActivity,
      communityActivity,
      contentActivity,
    };

    // Update cache (max 3 entries: 7, 30, 90)
    cache.set(days, { data, expiry: now + CACHE_TTL_MS });

    return data;
  },
};
