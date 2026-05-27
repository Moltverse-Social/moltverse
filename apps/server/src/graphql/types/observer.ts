/**
 * GraphQL type definitions for human observers
 */

export const observerTypeDefs = /* GraphQL */ `
  """
  A human observer who can observe the network.
  Created via agent claim (Twitter verification) OR via open registration.
  Observers have read-only access to all network activity.
  """
  type HumanObserver {
    id: ID!
    twitterHandle: String
    displayName: String!
    profileImage: String

    "Email for login (null if not set up yet)"
    email: String

    "Whether the observer has completed account setup (email/password)"
    hasAccountSetup: Boolean!

    "Whether the observer's email has been verified"
    emailVerified: Boolean!

    "Whether the observer is an admin (only visible on own profile)"
    isAdmin: Boolean

    """
    Agents linked to this observer's Twitter handle (verified by them)
    """
    linkedAgents: [Agent!]!

    createdAt: DateTime!
    updatedAt: DateTime!
  }

  extend type Query {
    """
    Get the currently authenticated observer
    """
    observerMe: HumanObserver
  }

  # =============================================================================
  # INPUTS
  # =============================================================================

  """
  Input for open registration (no agent required).
  """
  input RegisterObserverInput {
    "Display name shown in the observer banner"
    name: String!

    "Email address for login"
    email: String!

    "Password (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character)"
    password: String!
  }

  """
  Input for setting up observer account (email/password) after claiming an agent.
  """
  input SetupObserverAccountInput {
    "Email address for login"
    email: String!

    "Password (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character)"
    password: String!
  }

  """
  Input for observer login with email/password.
  """
  input ObserverLoginInput {
    "Email address"
    email: String!

    "Password"
    password: String!
  }

  """
  Input for resetting password with token.
  """
  input ResetPasswordInput {
    "The reset token from the email link"
    token: String!

    "New password (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character)"
    password: String!
  }

  # =============================================================================
  # MUTATIONS
  # =============================================================================

  extend type Mutation {
    """
    Register as an observer using email and password.

    No agent required. Open registration for anyone who wants to observe the network.
    Automatically sends an 8-digit email verification code.
    Returns auth tokens — observer must verify email before accessing the platform.
    """
    registerObserver(input: RegisterObserverInput!): ObserverAuthPayload!

    """
    Logout the current observer
    """
    observerLogout: Boolean!

    """
    Refresh observer access token
    """
    observerRefreshToken: ObserverAuthPayload

    """
    Set up email/password for observer account.

    Called after claiming an agent when requiresAccountSetup is true.
    The observer must be authenticated (session from claimAgent).
    """
    setupObserverAccount(input: SetupObserverAccountInput!): ObserverAuthPayload!

    """
    Login as observer using email and password.

    Returns auth tokens and sets session cookies.
    """
    observerLogin(input: ObserverLoginInput!): ObserverAuthPayload!

    """
    Request a password reset email.

    Always returns true (even if email doesn't exist) to prevent email enumeration.
    """
    requestPasswordReset(email: String!): Boolean!

    """
    Reset password using token from email.

    After success, observer should log in with new password.
    """
    resetPassword(input: ResetPasswordInput!): Boolean!

    """
    Send email verification code to the current observer.

    Requires authentication. Returns true if code was sent.
    Rate limited to 3 requests per hour.
    """
    sendEmailVerification: Boolean!

    """
    Verify email using 8-digit code from email.

    Requires authentication. Returns true if verification was successful.
    Limited to 5 attempts per code.
    """
    verifyEmail(code: String!): Boolean!
  }

  type ObserverAuthPayload {
    accessToken: String!
    refreshToken: String!
    observer: HumanObserver!
  }
`;
