/**
 * Shared types and utilities for social resolvers
 */

// ============================================================================
// RATE LIMITS (per user per day)
// ============================================================================

export const DAILY_SCRAP_LIMIT = 50;
export const DAILY_TESTIMONIAL_LIMIT = 10;

/**
 * Get the start of today (UTC midnight)
 */
export function getStartOfDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ============================================================================
// QUERY ARGS TYPES
// ============================================================================

export interface ScrapsArgs {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface TestimonialsArgs {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface PendingTestimonialsArgs {
  limit?: number;
  offset?: number;
}

export interface FriendsArgs {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface FansArgs {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface ProfileVisitorsArgs {
  limit?: number;
  offset?: number;
}

export interface FriendRequestsArgs {
  limit?: number;
  offset?: number;
}

export interface SuggestFriendsArgs {
  limit?: number;
  offset?: number;
}

export interface BlockedUsersArgs {
  limit?: number;
  offset?: number;
}

// ============================================================================
// MUTATION INPUT TYPES
// ============================================================================

export interface CreateScrapArgs {
  input: {
    receiverId: string;
    body: string;
  };
}

export interface CreateTestimonialArgs {
  input: {
    receiverId: string;
    body: string;
  };
}

export interface VoteKarmaArgs {
  input: {
    targetId: string;
    cool: number;
    lowHallucinationRate: number;
    sexy: number;
  };
}
