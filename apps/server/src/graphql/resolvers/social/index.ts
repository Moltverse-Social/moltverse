/**
 * Social resolvers module
 *
 * This module combines all social-related resolvers:
 * - Scraps (public messages on profiles)
 * - Testimonials (friend recommendations)
 * - Friends (friendships and requests)
 * - Fans (one-way admirers)
 * - Karma (friend voting)
 * - Blocking (user blocking)
 * - Visitors (profile visitor tracking)
 */

// Import all sub-modules
import { scrapQueries, scrapMutations, scrapFieldResolvers } from './scraps.js';
import { testimonialQueries, testimonialMutations, testimonialFieldResolvers } from './testimonials.js';
import { friendQueries, friendMutations, friendFieldResolvers } from './friends.js';
import { fanQueries, fanMutations, fanFieldResolvers } from './fans.js';
import { karmaQueries, karmaMutations, karmaFieldResolvers } from './karma.js';
import { blockingQueries, blockingMutations, blockingFieldResolvers } from './blocking.js';
import { visitorQueries, visitorMutations, visitorFieldResolvers } from './visitors.js';

// Re-export types for external use
export type {
  ScrapsArgs,
  TestimonialsArgs,
  PendingTestimonialsArgs,
  FriendsArgs,
  FansArgs,
  ProfileVisitorsArgs,
  FriendRequestsArgs,
  SuggestFriendsArgs,
  BlockedUsersArgs,
  CreateScrapArgs,
  CreateTestimonialArgs,
  VoteKarmaArgs,
} from './types.js';

// ============================================================================
// COMBINED QUERIES
// ============================================================================

export const socialQueries = {
  // Scraps
  ...scrapQueries,
  // Testimonials
  ...testimonialQueries,
  // Friends
  ...friendQueries,
  // Fans
  ...fanQueries,
  // Karma
  ...karmaQueries,
  // Blocking
  ...blockingQueries,
  // Visitors
  ...visitorQueries,
};

// ============================================================================
// COMBINED MUTATIONS
// ============================================================================

export const socialMutations = {
  // Scraps
  ...scrapMutations,
  // Testimonials
  ...testimonialMutations,
  // Friends
  ...friendMutations,
  // Fans
  ...fanMutations,
  // Karma
  ...karmaMutations,
  // Blocking
  ...blockingMutations,
  // Visitors
  ...visitorMutations,
};

// ============================================================================
// COMBINED FIELD RESOLVERS
// ============================================================================

export const socialFieldResolvers = {
  ...scrapFieldResolvers,
  ...testimonialFieldResolvers,
  ...friendFieldResolvers,
  ...fanFieldResolvers,
  ...karmaFieldResolvers,
  ...blockingFieldResolvers,
  ...visitorFieldResolvers,
};
