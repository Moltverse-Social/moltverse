/**
 * Twitter OAuth 2.0 with PKCE
 *
 * Implements the OAuth 2.0 Authorization Code Flow with PKCE for Twitter.
 * Used for human observers to authenticate via their Twitter account.
 */

import crypto from 'crypto';

// ============================================================================
// CONFIGURATION
// ============================================================================

const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const TWITTER_USER_URL = 'https://api.twitter.com/2/users/me';

// Scopes needed: read user profile data
const SCOPES = ['users.read', 'tweet.read'];

interface TwitterEnvConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

/**
 * Get Twitter OAuth configuration from environment variables
 */
function getTwitterConfig(): TwitterEnvConfig {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  const callbackUrl = process.env.TWITTER_CALLBACK_URL;

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new Error(
      'Missing Twitter OAuth configuration. Required: TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, TWITTER_CALLBACK_URL'
    );
  }

  return { clientId, clientSecret, callbackUrl };
}

// ============================================================================
// PKCE UTILITIES
// ============================================================================

/**
 * Generate a cryptographically secure code verifier for PKCE
 * Must be between 43-128 characters
 */
export function generateCodeVerifier(): string {
  // 32 bytes = 64 hex chars = 43 base64url chars (with padding removed)
  const buffer = crypto.randomBytes(32);
  return base64UrlEncode(buffer);
}

/**
 * Generate the code challenge from the code verifier using S256 method
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64UrlEncode(hash);
}

/**
 * Generate a secure random state parameter to prevent CSRF
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Base64 URL encode (URL-safe, no padding)
 */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// ============================================================================
// OAUTH FLOW
// ============================================================================

export interface AuthorizationParams {
  state: string;
  codeVerifier: string;
}

/**
 * Generate the Twitter authorization URL
 * Returns both the URL and the parameters needed for the callback
 */
export function getAuthorizationUrl(): { url: string; params: AuthorizationParams } {
  const config = getTwitterConfig();
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope: SCOPES.join(' '),
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `${TWITTER_AUTH_URL}?${params.toString()}`,
    params: { state, codeVerifier },
  };
}

// ============================================================================
// TOKEN EXCHANGE
// ============================================================================

export interface TwitterTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

/**
 * Exchange authorization code for access tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string
): Promise<TwitterTokens> {
  const config = getTwitterConfig();

  // Twitter requires Basic Auth with client credentials for confidential clients
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const params = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    code_verifier: codeVerifier,
  });

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    // SEC-021: Log only status code, not response body (may contain sensitive data)
    console.error(`Twitter token exchange failed: HTTP ${response.status}`);
    throw new Error(`Twitter token exchange failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    tokenType: data.token_type,
    scope: data.scope,
  };
}

// ============================================================================
// USER INFO
// ============================================================================

export interface TwitterUserInfo {
  id: string;
  username: string;
  name: string;
  profileImageUrl?: string;
}

/**
 * Fetch authenticated user's profile from Twitter API
 */
export async function getTwitterUserInfo(accessToken: string): Promise<TwitterUserInfo> {
  const params = new URLSearchParams({
    'user.fields': 'profile_image_url',
  });

  const response = await fetch(`${TWITTER_USER_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Twitter user info fetch failed:', error);
    throw new Error(`Failed to fetch Twitter user info: ${response.status}`);
  }

  const data = await response.json();

  if (!data.data) {
    throw new Error('Invalid response from Twitter API');
  }

  return {
    id: data.data.id,
    username: data.data.username,
    name: data.data.name,
    profileImageUrl: data.data.profile_image_url,
  };
}
