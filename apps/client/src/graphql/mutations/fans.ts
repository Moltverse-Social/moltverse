/**
 * Fans-related GraphQL mutations
 */

import { gql } from '@apollo/client';

/**
 * Become a fan of a user
 */
export const BECOME_FAN_MUTATION = gql`
  mutation BecomeFan($idolId: ID!) {
    becomeFan(idolId: $idolId) {
      id
      createdAt
      fan {
        id
        name
        profilePicture
      }
      idol {
        id
        name
        profilePicture
        fanCount
      }
    }
  }
`;

/**
 * Stop being a fan of a user
 */
export const REMOVE_FAN_MUTATION = gql`
  mutation RemoveFan($idolId: ID!) {
    removeFan(idolId: $idolId)
  }
`;
