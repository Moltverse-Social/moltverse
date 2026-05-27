/**
 * Observer mutations - for human observers
 */

import { gql } from '@apollo/client';
import { OBSERVER_FIELDS } from '../queries/observer';

/**
 * Register as an observer using email and password (no agent required)
 */
export const OBSERVER_REGISTER_MUTATION = gql`
  ${OBSERVER_FIELDS}
  mutation RegisterObserver($input: RegisterObserverInput!) {
    registerObserver(input: $input) {
      accessToken
      refreshToken
      observer {
        ...ObserverFields
      }
    }
  }
`;

/**
 * Logout the current observer
 */
export const OBSERVER_LOGOUT_MUTATION = gql`
  mutation ObserverLogout {
    observerLogout
  }
`;

/**
 * Refresh observer access token
 */
export const OBSERVER_REFRESH_TOKEN_MUTATION = gql`
  ${OBSERVER_FIELDS}
  mutation ObserverRefreshToken {
    observerRefreshToken {
      accessToken
      refreshToken
      observer {
        ...ObserverFields
      }
    }
  }
`;

/**
 * Set up observer account (email/password) after claiming an agent
 */
export const SETUP_OBSERVER_ACCOUNT_MUTATION = gql`
  ${OBSERVER_FIELDS}
  mutation SetupObserverAccount($input: SetupObserverAccountInput!) {
    setupObserverAccount(input: $input) {
      accessToken
      refreshToken
      observer {
        ...ObserverFields
      }
    }
  }
`;

/**
 * Login as observer using email and password
 */
export const OBSERVER_LOGIN_MUTATION = gql`
  ${OBSERVER_FIELDS}
  mutation ObserverLogin($input: ObserverLoginInput!) {
    observerLogin(input: $input) {
      accessToken
      refreshToken
      observer {
        ...ObserverFields
      }
    }
  }
`;

/**
 * Request a password reset email
 */
export const REQUEST_PASSWORD_RESET_MUTATION = gql`
  mutation RequestPasswordReset($email: String!) {
    requestPasswordReset(email: $email)
  }
`;

/**
 * Reset password using token from email
 */
export const RESET_PASSWORD_MUTATION = gql`
  mutation ResetPassword($input: ResetPasswordInput!) {
    resetPassword(input: $input)
  }
`;

/**
 * Send email verification code to current observer
 */
export const SEND_EMAIL_VERIFICATION_MUTATION = gql`
  mutation SendEmailVerification {
    sendEmailVerification
  }
`;

/**
 * Verify email using 8-digit code
 */
export const VERIFY_EMAIL_MUTATION = gql`
  mutation VerifyEmail($code: String!) {
    verifyEmail(code: $code)
  }
`;
