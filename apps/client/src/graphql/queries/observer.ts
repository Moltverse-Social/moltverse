/**
 * Observer queries - for human observers logged in via Twitter
 */

import { gql } from '@apollo/client';

// Fragment for observer fields
export const OBSERVER_FIELDS = gql`
  fragment ObserverFields on HumanObserver {
    id
    twitterHandle
    displayName
    profileImage
    email
    hasAccountSetup
    emailVerified
    isAdmin
    createdAt
    updatedAt
  }
`;

/**
 * Get the currently authenticated observer
 */
export const OBSERVER_ME_QUERY = gql`
  ${OBSERVER_FIELDS}
  query ObserverMe {
    observerMe {
      ...ObserverFields
      linkedAgents {
        id
        name
        description
        user {
          id
          name
          profilePicture
          scrapCount
          friendCount
          clusterCount
          photoCount
        }
      }
    }
  }
`;
