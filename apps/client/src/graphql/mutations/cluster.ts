/**
 * Cluster-related GraphQL mutations
 */

import { gql } from '@apollo/client';

// =============================================================================
// CLUSTER MUTATIONS
// =============================================================================

export const CREATE_CLUSTER_MUTATION = gql`
  mutation CreateCluster($input: CreateClusterInput!) {
    createCluster(input: $input) {
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
      isMember
      isModerator
      isCreator
    }
  }
`;

export const UPDATE_CLUSTER_MUTATION = gql`
  mutation UpdateCluster($id: ID!, $input: UpdateClusterInput!) {
    updateCluster(id: $id, input: $input) {
      id
      title
      picture
      description
      type
      language
      country
      updatedAt
    }
  }
`;

export const DELETE_CLUSTER_MUTATION = gql`
  mutation DeleteCluster($id: ID!) {
    deleteCluster(id: $id)
  }
`;

export const JOIN_CLUSTER_MUTATION = gql`
  mutation JoinCluster($clusterId: ID!) {
    joinCluster(clusterId: $clusterId)
  }
`;

export const LEAVE_CLUSTER_MUTATION = gql`
  mutation LeaveCluster($clusterId: ID!) {
    leaveCluster(clusterId: $clusterId)
  }
`;

export const ADD_MODERATOR_MUTATION = gql`
  mutation AddModerator($clusterId: ID!, $userId: ID!) {
    addModerator(clusterId: $clusterId, userId: $userId)
  }
`;

export const REMOVE_MODERATOR_MUTATION = gql`
  mutation RemoveModerator($clusterId: ID!, $userId: ID!) {
    removeModerator(clusterId: $clusterId, userId: $userId)
  }
`;

// =============================================================================
// TOPIC MUTATIONS
// =============================================================================

export const CREATE_TOPIC_MUTATION = gql`
  mutation CreateTopic($input: CreateTopicInput!) {
    createTopic(input: $input) {
      id
      title
      body
      createdAt
      creator {
        id
        name
        profilePicture
      }
      cluster {
        id
        title
      }
      commentCount
    }
  }
`;

export const DELETE_TOPIC_MUTATION = gql`
  mutation DeleteTopic($id: ID!) {
    deleteTopic(id: $id)
  }
`;

// =============================================================================
// TOPIC COMMENT MUTATIONS
// =============================================================================

export const CREATE_TOPIC_COMMENT_MUTATION = gql`
  mutation CreateTopicComment($input: CreateTopicCommentInput!) {
    createTopicComment(input: $input) {
      id
      body
      createdAt
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
  }
`;

export const DELETE_TOPIC_COMMENT_MUTATION = gql`
  mutation DeleteTopicComment($id: ID!) {
    deleteTopicComment(id: $id)
  }
`;

// =============================================================================
// POLL MUTATIONS
// =============================================================================

export const CREATE_POLL_MUTATION = gql`
  mutation CreatePoll($input: CreatePollInput!) {
    createPoll(input: $input) {
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
  }
`;

export const VOTE_POLL_MUTATION = gql`
  mutation VotePoll($pollId: ID!, $optionIds: [ID!]!) {
    votePoll(pollId: $pollId, optionIds: $optionIds) {
      id
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
    }
  }
`;

export const CLOSE_POLL_MUTATION = gql`
  mutation ClosePoll($id: ID!) {
    closePoll(id: $id) {
      id
      closed
      options {
        id
        text
        position
        voteCount
        percentage
      }
      totalVotes
    }
  }
`;

export const DELETE_POLL_MUTATION = gql`
  mutation DeletePoll($id: ID!) {
    deletePoll(id: $id)
  }
`;

// =============================================================================
// EVENT MUTATIONS
// =============================================================================

export const CREATE_EVENT_MUTATION = gql`
  mutation CreateEvent($input: CreateEventInput!) {
    createEvent(input: $input) {
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
      cluster {
        id
        title
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

export const UPDATE_EVENT_MUTATION = gql`
  mutation UpdateEvent($id: ID!, $input: UpdateEventInput!) {
    updateEvent(id: $id, input: $input) {
      id
      title
      description
      picture
      eventDate
      location
      updatedAt
      rsvpCounts {
        yes
        maybe
        no
      }
    }
  }
`;

export const DELETE_EVENT_MUTATION = gql`
  mutation DeleteEvent($id: ID!) {
    deleteEvent(id: $id)
  }
`;

export const RSVP_EVENT_MUTATION = gql`
  mutation RsvpEvent($eventId: ID!, $status: String!) {
    rsvpEvent(eventId: $eventId, status: $status) {
      id
      status
      createdAt
      user {
        id
        name
        profilePicture
      }
    }
  }
`;

export const CANCEL_RSVP_MUTATION = gql`
  mutation CancelRsvp($eventId: ID!) {
    cancelRsvp(eventId: $eventId)
  }
`;
