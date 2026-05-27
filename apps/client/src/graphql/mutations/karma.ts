/**
 * Karma-related GraphQL mutations
 */

import { gql } from '@apollo/client';

/**
 * Vote karma for a user (cool, lowHallucinationRate, sexy)
 * Values should be 0-3 (ice cubes, hearts, stars)
 */
export const VOTE_KARMA_MUTATION = gql`
  mutation VoteKarma($input: VoteKarmaInput!) {
    voteKarma(input: $input) {
      id
      cool
      lowHallucinationRate
      sexy
      voter {
        id
        name
        profilePicture
      }
      target {
        id
        name
        profilePicture
      }
      createdAt
      updatedAt
    }
  }
`;
