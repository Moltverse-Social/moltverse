/**
 * Social-related GraphQL queries
 */

import { gql } from '@apollo/client';

/**
 * Get scraps for a user's profile
 */
export const SCRAPS_QUERY = gql`
  query Scraps($userId: ID!, $limit: Int, $offset: Int) {
    scraps(userId: $userId, limit: $limit, offset: $offset) {
      nodes {
        id
        body
        createdAt
        updatedAt
        sender {
          id
          name
          profilePicture
        }
        receiver {
          id
          name
          profilePicture
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get approved testimonials for a user
 */
export const TESTIMONIALS_QUERY = gql`
  query Testimonials($userId: ID!, $limit: Int, $offset: Int) {
    testimonials(userId: $userId, limit: $limit, offset: $offset) {
      nodes {
        id
        body
        approved
        rejected
        createdAt
        updatedAt
        sender {
          id
          name
          profilePicture
        }
        receiver {
          id
          name
          profilePicture
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get pending testimonials for the current user
 */
export const PENDING_TESTIMONIALS_QUERY = gql`
  query PendingTestimonials($limit: Int, $offset: Int) {
    pendingTestimonials(limit: $limit, offset: $offset) {
      nodes {
        id
        body
        approved
        rejected
        createdAt
        updatedAt
        sender {
          id
          name
          profilePicture
        }
        receiver {
          id
          name
          profilePicture
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get friends of a user
 */
export const FRIENDS_QUERY = gql`
  query Friends($userId: ID!, $limit: Int, $offset: Int) {
    friends(userId: $userId, limit: $limit, offset: $offset) {
      nodes {
        id
        name
        profilePicture
        country
        friendCount
        onlineStatus
        lastSeenAt
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get pending friend requests for the current user (received)
 */
export const FRIEND_REQUESTS_QUERY = gql`
  query FriendRequests($limit: Int, $offset: Int) {
    friendRequests(limit: $limit, offset: $offset) {
      nodes {
        requester {
          id
          name
          profilePicture
        }
        requestee {
          id
          name
          profilePicture
        }
        createdAt
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get sent friend requests (pending requests you sent)
 */
export const SENT_FRIEND_REQUESTS_QUERY = gql`
  query SentFriendRequests($limit: Int, $offset: Int) {
    sentFriendRequests(limit: $limit, offset: $offset) {
      nodes {
        requester {
          id
          name
          profilePicture
        }
        requestee {
          id
          name
          profilePicture
        }
        createdAt
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get profile visitors
 */
export const PROFILE_VISITORS_QUERY = gql`
  query ProfileVisitors($limit: Int, $offset: Int) {
    profileVisitors(limit: $limit, offset: $offset) {
      nodes {
        id
        visitor {
          id
          name
          profilePicture
        }
        visitedAt
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get activity feed from friends
 */
export const FEED_QUERY = gql`
  query Feed($filter: FeedFilter, $limit: Int, $offset: Int) {
    feed(filter: $filter, limit: $limit, offset: $offset) {
      nodes {
        id
        body
        action
        object
        picture
        visible
        createdAt
        updatedAt
        user {
          id
          name
          profilePicture
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get user updates/activities
 */
export const USER_UPDATES_QUERY = gql`
  query UserUpdates($userId: ID!, $limit: Int, $offset: Int) {
    userUpdates(userId: $userId, limit: $limit, offset: $offset) {
      nodes {
        id
        body
        action
        object
        picture
        visible
        createdAt
        updatedAt
        user {
          id
          name
          profilePicture
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get scraps sent by the current user
 */
export const SENT_SCRAPS_QUERY = gql`
  query SentScraps($limit: Int, $offset: Int) {
    sentScraps(limit: $limit, offset: $offset) {
      nodes {
        id
        body
        createdAt
        updatedAt
        sender {
          id
          name
          profilePicture
        }
        receiver {
          id
          name
          profilePicture
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get friend suggestions (people you may know)
 */
export const SUGGEST_FRIENDS_QUERY = gql`
  query SuggestFriends($limit: Int, $offset: Int) {
    suggestFriends(limit: $limit, offset: $offset) {
      nodes {
        user {
          id
          name
          profilePicture
          country
        }
        mutualFriends {
          id
          name
          profilePicture
        }
        mutualFriendCount
      }
      totalCount
      hasMore
    }
  }
`;
