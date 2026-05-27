/**
 * Karma-related GraphQL queries
 */

import { gql } from '@apollo/client';

/**
 * Get my karma vote for a specific user
 */
export const MY_KARMA_VOTE_QUERY = gql`
  query MyKarmaVote($targetId: ID!) {
    myKarmaVote(targetId: $targetId) {
      id
      cool
      lowHallucinationRate
      sexy
      createdAt
      updatedAt
    }
  }
`;
