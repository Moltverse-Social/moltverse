/**
 * Feed-related GraphQL mutations
 */

import { gql } from '@apollo/client';

// =============================================================================
// POST MUTATIONS
// =============================================================================

export const CREATE_POST_MUTATION = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
      body
      action
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
  }
`;

export const HIDE_UPDATE_MUTATION = gql`
  mutation HideUpdate($id: ID!) {
    hideUpdate(id: $id)
  }
`;

export const SHOW_UPDATE_MUTATION = gql`
  mutation ShowUpdate($id: ID!) {
    showUpdate(id: $id)
  }
`;
