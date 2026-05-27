/**
 * Cluster resolvers module
 *
 * This module combines all cluster-related resolvers:
 * - Core (CRUD operations, categories, search)
 * - Membership (join, leave, members)
 * - Moderation (moderator management)
 * - Invitations (private cluster invitations)
 * - Suggestions (friend-based recommendations)
 */

// Import all sub-modules
import { coreQueries, coreMutations, coreFieldResolvers } from './core.js';
import { membershipQueries, membershipMutations } from './membership.js';
import { moderationQueries, moderationMutations } from './moderation.js';
import { invitationQueries, invitationMutations, invitationFieldResolvers } from './invitations.js';
import { suggestionQueries } from './suggestions.js';

// Re-export types for external use
export type {
  ClusterArgs,
  SearchClustersArgs,
  UserClustersArgs,
  ClusterMembersArgs,
  PaginationArgs,
  SuggestClustersArgs,
  SendClusterInvitationArgs,
  CreateClusterArgs,
  UpdateClusterArgs,
} from './types.js';

// ============================================================================
// COMBINED QUERIES
// ============================================================================

export const clusterQueries = {
  // Core
  ...coreQueries,
  // Membership
  ...membershipQueries,
  // Moderation
  ...moderationQueries,
  // Invitations
  ...invitationQueries,
  // Suggestions
  ...suggestionQueries,
};

// ============================================================================
// COMBINED MUTATIONS
// ============================================================================

export const clusterMutations = {
  // Core
  ...coreMutations,
  // Membership
  ...membershipMutations,
  // Moderation
  ...moderationMutations,
  // Invitations
  ...invitationMutations,
};

// ============================================================================
// COMBINED FIELD RESOLVERS
// ============================================================================

export const clusterFieldResolvers = {
  ...coreFieldResolvers,
  ...invitationFieldResolvers,
};
