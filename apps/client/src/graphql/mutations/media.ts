/**
 * Media-related GraphQL mutations (photos, albums, videos)
 */

import { gql } from '@apollo/client';

// =============================================================================
// PHOTO FOLDER MUTATIONS
// =============================================================================

export const CREATE_PHOTO_FOLDER_MUTATION = gql`
  mutation CreatePhotoFolder($title: String!, $visibleToAll: Boolean) {
    createPhotoFolder(title: $title, visibleToAll: $visibleToAll) {
      id
      title
      visibleToAll
      createdAt
      updatedAt
      photoCount
      user {
        id
        name
      }
    }
  }
`;

export const UPDATE_PHOTO_FOLDER_MUTATION = gql`
  mutation UpdatePhotoFolder($id: ID!, $title: String, $visibleToAll: Boolean) {
    updatePhotoFolder(id: $id, title: $title, visibleToAll: $visibleToAll) {
      id
      title
      visibleToAll
      updatedAt
    }
  }
`;

export const DELETE_PHOTO_FOLDER_MUTATION = gql`
  mutation DeletePhotoFolder($id: ID!) {
    deletePhotoFolder(id: $id)
  }
`;

// =============================================================================
// PHOTO MUTATIONS
// =============================================================================

export const UPLOAD_PHOTO_MUTATION = gql`
  mutation UploadPhoto($folderId: ID!, $url: String!, $description: String) {
    uploadPhoto(folderId: $folderId, url: $url, description: $description) {
      id
      url
      description
      createdAt
      updatedAt
      commentCount
      user {
        id
        name
        profilePicture
      }
      folder {
        id
        title
        photoCount
      }
    }
  }
`;

export const UPDATE_PHOTO_MUTATION = gql`
  mutation UpdatePhoto($id: ID!, $description: String) {
    updatePhoto(id: $id, description: $description) {
      id
      description
      updatedAt
    }
  }
`;

export const DELETE_PHOTO_MUTATION = gql`
  mutation DeletePhoto($id: ID!) {
    deletePhoto(id: $id)
  }
`;

// =============================================================================
// PHOTO COMMENT MUTATIONS
// =============================================================================

export const CREATE_PHOTO_COMMENT_MUTATION = gql`
  mutation CreatePhotoComment($photoId: ID!, $body: String!) {
    createPhotoComment(photoId: $photoId, body: $body) {
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
      }
      photo {
        id
        commentCount
      }
    }
  }
`;

export const UPDATE_PHOTO_COMMENT_MUTATION = gql`
  mutation UpdatePhotoComment($id: ID!, $body: String!) {
    updatePhotoComment(id: $id, body: $body) {
      id
      body
      updatedAt
    }
  }
`;

export const DELETE_PHOTO_COMMENT_MUTATION = gql`
  mutation DeletePhotoComment($id: ID!) {
    deletePhotoComment(id: $id)
  }
`;

// =============================================================================
// VIDEO MUTATIONS
// =============================================================================

export const ADD_VIDEO_MUTATION = gql`
  mutation AddVideo($url: String!, $description: String) {
    addVideo(url: $url, description: $description) {
      id
      url
      description
      createdAt
      updatedAt
      user {
        id
        name
      }
    }
  }
`;

export const DELETE_VIDEO_MUTATION = gql`
  mutation DeleteVideo($id: ID!) {
    deleteVideo(id: $id)
  }
`;
