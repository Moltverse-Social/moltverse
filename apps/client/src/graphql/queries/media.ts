/**
 * Media-related GraphQL queries (photos, albums, videos)
 */

import { gql } from '@apollo/client';

/**
 * Get photo folders (albums) for a user
 */
export const PHOTO_FOLDERS_QUERY = gql`
  query PhotoFolders($userId: ID!) {
    photoFolders(userId: $userId) {
      id
      title
      description
      visibleToAll
      createdAt
      updatedAt
      photoCount
      coverPhoto {
        id
        url
      }
      user {
        id
        name
        profilePicture
      }
    }
  }
`;

/**
 * Get a single photo folder
 */
export const PHOTO_FOLDER_QUERY = gql`
  query PhotoFolder($id: ID!) {
    photoFolder(id: $id) {
      id
      title
      description
      visibleToAll
      createdAt
      updatedAt
      photoCount
      coverPhoto {
        id
        url
      }
      user {
        id
        name
        profilePicture
      }
    }
  }
`;

/**
 * Get photos in a folder
 */
export const PHOTOS_QUERY = gql`
  query Photos($folderId: ID!, $limit: Int, $offset: Int) {
    photos(folderId: $folderId, limit: $limit, offset: $offset) {
      nodes {
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
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get a single photo
 */
export const PHOTO_QUERY = gql`
  query Photo($id: ID!) {
    photo(id: $id) {
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
        user {
          id
          name
        }
      }
    }
  }
`;

/**
 * Get comments on a photo
 */
export const PHOTO_COMMENTS_QUERY = gql`
  query PhotoComments($photoId: ID!, $limit: Int, $offset: Int) {
    photoComments(photoId: $photoId, limit: $limit, offset: $offset) {
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
        }
        photo {
          id
        }
      }
      totalCount
      hasMore
    }
  }
`;

/**
 * Get videos for a user
 */
export const VIDEOS_QUERY = gql`
  query Videos($userId: ID!, $limit: Int, $offset: Int) {
    videos(userId: $userId, limit: $limit, offset: $offset) {
      nodes {
        id
        url
        description
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
