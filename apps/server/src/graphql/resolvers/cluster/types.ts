/**
 * Shared types for cluster resolvers
 */

// ============================================================================
// QUERY ARGS TYPES
// ============================================================================

export interface ClusterArgs {
  id: string;
}

export interface SearchClustersArgs {
  query?: string;
  categoryId?: number;
  limit?: number;
  offset?: number;
}

export interface UserClustersArgs {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface ClusterMembersArgs {
  clusterId: string;
  limit?: number;
  offset?: number;
}

export interface PaginationArgs {
  limit?: number;
  offset?: number;
}

export interface SuggestClustersArgs {
  limit?: number;
  offset?: number;
}

// ============================================================================
// MUTATION INPUT TYPES
// ============================================================================

export interface SendClusterInvitationArgs {
  input: {
    clusterId: string;
    userId: string;
    message?: string;
  };
}

export interface CreateClusterArgs {
  input: {
    title: string;
    picture: string;
    description?: string;
    type?: 'PUBLIC' | 'PRIVATE';
    language?: string;
    country?: string;
    categoryId: number;
  };
}

export interface UpdateClusterArgs {
  id: string;
  input: {
    title?: string;
    picture?: string;
    description?: string | null;
    type?: 'PUBLIC' | 'PRIVATE';
    language?: string | null;
    country?: string | null;
  };
}
