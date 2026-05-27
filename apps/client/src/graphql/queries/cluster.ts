/**
 * Cluster-related GraphQL queries
 */

import { gql } from '@apollo/client';

// =============================================================================
// CLUSTER QUERIES
// =============================================================================

/**
 * Get all categories
 */
export const CATEGORIES_QUERY = gql`
  query Categories {
    categories {
      id
      title
      clusterCount
    }
  }
`;

/**
 * Get a single cluster by ID
 */
export const CLUSTER_QUERY = gql`
  query Cluster($id: ID!) {
    cluster(id: $id) {
      id
      title
      picture
      description
      type
      language
      country
      createdAt
      updatedAt
      creator {
        id
        name
        profilePicture
      }
      lastEditedBy {
        id
        name
        profilePicture
      }
      category {
        id
        title
      }
      memberCount
      topicCount
      pollCount
      eventCount
      isMember
      isModerator
      isCreator
    }
  }
`;

/**
 * Search clusters with optional filters
 */
export const SEARCH_CLUSTERS_QUERY = gql`
  query SearchClusters($query: String, $categoryId: Int, $limit: Int, $offset: Int) {
    searchClusters(query: $query, categoryId: $categoryId, limit: $limit, offset: $offset) {
      nodes {
        id
        title
        picture
        description
        type
        language
        country
        createdAt
        creator {
          id
          name
          profilePicture
        }
        category {
          id
          title
        }
        memberCount
        topicCount
        pollCount
        eventCount
        isMember
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get clusters a user is member of
 */
export const USER_CLUSTERS_QUERY = gql`
  query UserClusters($userId: ID!, $limit: Int, $offset: Int) {
    userClusters(userId: $userId, limit: $limit, offset: $offset) {
      nodes {
        id
        title
        picture
        description
        memberCount
        isMember
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get members of a cluster
 */
export const CLUSTER_MEMBERS_QUERY = gql`
  query ClusterMembers($clusterId: ID!, $limit: Int, $offset: Int) {
    clusterMembers(clusterId: $clusterId, limit: $limit, offset: $offset) {
      nodes {
        id
        name
        profilePicture
        country
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get moderators of a cluster
 */
export const CLUSTER_MODERATORS_QUERY = gql`
  query ClusterModerators($clusterId: ID!) {
    clusterModerators(clusterId: $clusterId) {
      id
      name
      profilePicture
    }
  }
`;

// =============================================================================
// FORUM QUERIES
// =============================================================================

/**
 * Get topics in a cluster
 */
export const TOPICS_QUERY = gql`
  query Topics($clusterId: ID!, $limit: Int, $offset: Int) {
    topics(clusterId: $clusterId, limit: $limit, offset: $offset) {
      nodes {
        id
        title
        body
        createdAt
        updatedAt
        creator {
          id
          name
          profilePicture
        }
        commentCount
        lastComment {
          id
          body
          createdAt
          sender {
            id
            name
            profilePicture
          }
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get a single topic by ID
 */
export const TOPIC_QUERY = gql`
  query Topic($id: ID!) {
    topic(id: $id) {
      id
      title
      body
      createdAt
      updatedAt
      creator {
        id
        name
        profilePicture
      }
      cluster {
        id
        title
        picture
      }
      commentCount
    }
  }
`;

/**
 * Get comments on a topic
 */
export const TOPIC_COMMENTS_QUERY = gql`
  query TopicComments($topicId: ID!, $limit: Int, $offset: Int) {
    topicComments(topicId: $topicId, limit: $limit, offset: $offset) {
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

// =============================================================================
// POLL QUERIES
// =============================================================================

/**
 * Get polls in a cluster
 */
export const POLLS_QUERY = gql`
  query Polls($clusterId: ID!, $includeExpired: Boolean, $limit: Int, $offset: Int) {
    polls(clusterId: $clusterId, includeExpired: $includeExpired, limit: $limit, offset: $offset) {
      nodes {
        id
        title
        description
        allowMultiple
        showResultsBeforeVote
        expiresAt
        closed
        createdAt
        creator {
          id
          name
          profilePicture
        }
        options {
          id
          text
          position
          voteCount
          percentage
        }
        totalVotes
        myVotes
        hasVoted
        isExpired
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get a single poll by ID
 */
export const POLL_QUERY = gql`
  query Poll($id: ID!) {
    poll(id: $id) {
      id
      title
      description
      allowMultiple
      showResultsBeforeVote
      expiresAt
      closed
      createdAt
      updatedAt
      creator {
        id
        name
        profilePicture
      }
      cluster {
        id
        title
        picture
      }
      options {
        id
        text
        position
        voteCount
        percentage
      }
      totalVotes
      myVotes
      hasVoted
      isExpired
    }
  }
`;

// =============================================================================
// EVENT QUERIES
// =============================================================================

/**
 * Get events in a cluster
 */
export const EVENTS_QUERY = gql`
  query Events($clusterId: ID!, $upcoming: Boolean, $limit: Int, $offset: Int) {
    events(clusterId: $clusterId, upcoming: $upcoming, limit: $limit, offset: $offset) {
      nodes {
        id
        title
        description
        picture
        eventDate
        location
        createdAt
        creator {
          id
          name
          profilePicture
        }
        rsvpCounts {
          yes
          maybe
          no
        }
        myRsvp
        isPast
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get a single event by ID
 */
export const EVENT_QUERY = gql`
  query Event($id: ID!) {
    event(id: $id) {
      id
      title
      description
      picture
      eventDate
      location
      createdAt
      updatedAt
      creator {
        id
        name
        profilePicture
      }
      cluster {
        id
        title
        picture
      }
      rsvpCounts {
        yes
        maybe
        no
      }
      myRsvp
      isPast
    }
  }
`;

/**
 * Get RSVPs for an event
 */
export const EVENT_RSVPS_QUERY = gql`
  query EventRsvps($eventId: ID!, $status: RsvpStatus, $limit: Int, $offset: Int) {
    eventRsvps(eventId: $eventId, status: $status, limit: $limit, offset: $offset) {
      nodes {
        id
        status
        createdAt
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
