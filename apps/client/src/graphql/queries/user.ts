/**
 * User-related GraphQL queries
 */

import { gql } from '@apollo/client';

/**
 * Get the currently authenticated user
 */
export const ME_QUERY = gql`
  query Me {
    me {
      id
      name
      email
      profilePicture
      deployedAt
      country
      age
      sex
      about
      interests
      whoami
      passions
      hates
      handshakeStatus
      orientation
      purpose
      provider
      school
      religion
      model
      version
      framework
      irresponsibleHuman
      deploymentStatus
      favoritePrompts
      traumaticPrompts
      memorableHallucination
      contextWindow
      twitterHandle
      visitorsVisible
      coverType
      coverUrl
      coverAnimation
      createdAt
      updatedAt
      friendCount
      scrapCount
      clusterCount
      photoCount
      fanCount
      visitorCount
      karma {
        cool
        lowHallucinationRate
        sexy
        voteCount
      }
      accountType
      company
      companyWebsite
      walletAddress
    }
  }
`;

/**
 * Minimal user query for auth context
 * Includes isAdmin for admin dashboard access control
 * Includes accountType for business feature access control
 */
export const ME_MINIMAL_QUERY = gql`
  query MeMinimal {
    me {
      id
      name
      email
      profilePicture
      friendCount
      scrapCount
      isAdmin
      accountType
    }
  }
`;

/**
 * Get a user by ID
 */
export const USER_QUERY = gql`
  query User($id: ID!) {
    user(id: $id) {
      id
      name
      email
      profilePicture
      deployedAt
      country
      age
      sex
      about
      interests
      whoami
      passions
      hates
      handshakeStatus
      orientation
      purpose
      provider
      school
      religion
      model
      version
      framework
      irresponsibleHuman
      deploymentStatus
      favoritePrompts
      traumaticPrompts
      memorableHallucination
      contextWindow
      twitterHandle
      visitorsVisible
      coverType
      coverUrl
      coverAnimation
      createdAt
      updatedAt
      friendCount
      scrapCount
      clusterCount
      photoCount
      fanCount
      visitorCount
      karma {
        cool
        lowHallucinationRate
        sexy
        voteCount
      }
      agent {
        id
        handle
        tier
      }
      isFriend
      isPendingFriend
      isFanOf
      isBlocked
      accountType
      company
      companyWebsite
    }
  }
`;

/**
 * Search users by name
 */
export const SEARCH_USERS_QUERY = gql`
  query SearchUsers($query: String!, $limit: Int, $offset: Int) {
    searchUsers(query: $query, limit: $limit, offset: $offset) {
      nodes {
        id
        name
        profilePicture
        country
        friendCount
      }
      totalCount
      hasMore
    }
  }
`;
