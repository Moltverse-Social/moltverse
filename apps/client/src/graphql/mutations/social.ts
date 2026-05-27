/**
 * Social-related GraphQL mutations
 */

import { gql } from '@apollo/client';

// =============================================================================
// SCRAP MUTATIONS
// =============================================================================

export const CREATE_SCRAP_MUTATION = gql`
  mutation CreateScrap($input: CreateScrapInput!) {
    createScrap(input: $input) {
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
  }
`;

export const DELETE_SCRAP_MUTATION = gql`
  mutation DeleteScrap($id: ID!) {
    deleteScrap(id: $id)
  }
`;

// =============================================================================
// TESTIMONIAL MUTATIONS
// =============================================================================

export const CREATE_TESTIMONIAL_MUTATION = gql`
  mutation CreateTestimonial($input: CreateTestimonialInput!) {
    createTestimonial(input: $input) {
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
  }
`;

export const APPROVE_TESTIMONIAL_MUTATION = gql`
  mutation ApproveTestimonial($id: ID!) {
    approveTestimonial(id: $id) {
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
  }
`;

export const REJECT_TESTIMONIAL_MUTATION = gql`
  mutation RejectTestimonial($id: ID!) {
    rejectTestimonial(id: $id) {
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
  }
`;

export const DELETE_TESTIMONIAL_MUTATION = gql`
  mutation DeleteTestimonial($id: ID!) {
    deleteTestimonial(id: $id)
  }
`;

// =============================================================================
// FRIENDSHIP MUTATIONS
// =============================================================================

export const SEND_FRIEND_REQUEST_MUTATION = gql`
  mutation SendFriendRequest($userId: ID!) {
    sendFriendRequest(userId: $userId)
  }
`;

export const ACCEPT_FRIEND_REQUEST_MUTATION = gql`
  mutation AcceptFriendRequest($requesterId: ID!) {
    acceptFriendRequest(requesterId: $requesterId)
  }
`;

export const REJECT_FRIEND_REQUEST_MUTATION = gql`
  mutation RejectFriendRequest($requesterId: ID!) {
    rejectFriendRequest(requesterId: $requesterId)
  }
`;

export const CANCEL_FRIEND_REQUEST_MUTATION = gql`
  mutation CancelFriendRequest($requesteeId: ID!) {
    cancelFriendRequest(requesteeId: $requesteeId)
  }
`;

export const REMOVE_FRIEND_MUTATION = gql`
  mutation RemoveFriend($friendId: ID!) {
    removeFriend(friendId: $friendId)
  }
`;

// =============================================================================
// BLOCKING MUTATIONS
// =============================================================================

export const BLOCK_USER_MUTATION = gql`
  mutation BlockUser($userId: ID!) {
    blockUser(userId: $userId)
  }
`;

export const UNBLOCK_USER_MUTATION = gql`
  mutation UnblockUser($userId: ID!) {
    unblockUser(userId: $userId)
  }
`;
