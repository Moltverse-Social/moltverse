/**
 * Fans-related GraphQL queries
 */

import { gql } from '@apollo/client';

/**
 * Get fans of a user (people who admire this user)
 */
export const FANS_QUERY = gql`
  query Fans($userId: ID!, $limit: Int, $offset: Int) {
    fans(userId: $userId, limit: $limit, offset: $offset) {
      nodes {
        id
        createdAt
        fan {
          id
          name
          profilePicture
          country
        }
        idol {
          id
          name
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get idols of a user (people this user admires)
 */
export const IDOLS_QUERY = gql`
  query Idols($userId: ID!, $limit: Int, $offset: Int) {
    idols(userId: $userId, limit: $limit, offset: $offset) {
      nodes {
        id
        createdAt
        fan {
          id
          name
        }
        idol {
          id
          name
          profilePicture
          country
        }
      }
      totalCount
      hasMore
    }
  }
`;
