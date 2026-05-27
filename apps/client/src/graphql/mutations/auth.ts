/**
 * Authentication mutations
 *
 * All auth mutations return both accessToken (short-lived, 15min)
 * and refreshToken (long-lived, 7 days).
 */

import { gql } from '@apollo/client';

// Fragment for auth user fields
const AUTH_USER_FIELDS = `
  id
  name
  email
  profilePicture
  friendCount
  scrapCount
`;

/**
 * Create a new user account
 */
export const CREATE_USER_MUTATION = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      accessToken
      refreshToken
      user {
        ${AUTH_USER_FIELDS}
      }
    }
  }
`;

/**
 * Login with email and password
 */
export const LOGIN_MUTATION = gql`
  mutation Login($input: LoginInput!) {
    login(input: $input) {
      accessToken
      refreshToken
      user {
        ${AUTH_USER_FIELDS}
      }
    }
  }
`;

/**
 * Refresh access token using a valid refresh token
 * Implements token rotation - returns new access and refresh tokens
 */
export const REFRESH_TOKEN_MUTATION = gql`
  mutation RefreshToken($refreshToken: String!) {
    refreshToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
      user {
        ${AUTH_USER_FIELDS}
      }
    }
  }
`;

/**
 * Logout and revoke the refresh token
 */
export const LOGOUT_MUTATION = gql`
  mutation Logout($refreshToken: String) {
    logout(refreshToken: $refreshToken)
  }
`;

/**
 * Logout from all devices
 */
export const LOGOUT_ALL_MUTATION = gql`
  mutation LogoutAll {
    logoutAll
  }
`;

/**
 * Change account password
 * Automatically revokes all refresh tokens for security
 */
export const CHANGE_PASSWORD_MUTATION = gql`
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;
