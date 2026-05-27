/**
 * Twitter OAuth 2.0 routes for human observers
 *
 * Flow:
 * 1. GET /authorize - Redirects to Twitter with PKCE challenge
 * 2. GET /callback - Handles callback, creates observer session
 *
 * PKCE state is stored in PostgreSQL for multi-instance compatibility.
 *
 * Security:
 * - Rate limited to prevent OAuth flow abuse
 * - PKCE prevents authorization code interception
 * - State parameter prevents CSRF
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '../lib/prisma.js';
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getTwitterUserInfo,
} from '../lib/twitter-oauth.js';
import { generateObserverTokenPair } from '../lib/auth.js';
import { setObserverAuthCookies } from '../lib/cookies.js';

/**
 * Generate a cryptographically secure one-time code
 */
function generateOneTimeCode(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a one-time code for secure storage (SEC-018).
 * Store the hash in the database, compare hashes on exchange.
 */
function hashOneTimeCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

/**
 * Rate limit for OAuth endpoints.
 *
 * Rationale:
 * - OAuth flow requires user interaction, so 10/5min is generous
 * - Prevents automated abuse of OAuth state generation
 * - Each flow creates DB entry, so limiting protects resources
 */
const OAUTH_RATE_LIMIT = {
  max: 10,
  timeWindow: '5 minutes',
  errorResponseBuilder: (_request: FastifyRequest, context: { max: number; ttl: number }) => {
    // For OAuth, we redirect with error instead of returning JSON
    // But we need to return something for the rate limiter
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: `OAuth rate limit exceeded. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    };
  },
};

/**
 * Get frontend URL for redirects
 */
function getFrontendUrl(): string {
  // In production, use the configured CORS origin
  const corsOrigins = process.env.CORS_ORIGINS?.split(',') ?? [];
  const productionUrl = corsOrigins[0]?.trim();

  if (productionUrl && process.env.NODE_ENV === 'production') {
    return productionUrl.startsWith('http') ? productionUrl : `https://${productionUrl}`;
  }

  // Development fallback
  return 'http://localhost:5173';
}

export async function twitterAuthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /authorize
   * Initiates Twitter OAuth flow
   * Rate limited: 10 requests per 5 minutes per IP
   */
  fastify.get(
    '/authorize',
    {
      config: {
        rateLimit: OAUTH_RATE_LIMIT,
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { url, params } = getAuthorizationUrl();

        // Store PKCE verifier in database with 10 minute expiry
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await prisma.oAuthPkceState.create({
          data: {
            state: params.state,
            codeVerifier: params.codeVerifier,
            expiresAt,
          },
        });

        // Redirect to Twitter
        return reply.redirect(url);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Twitter auth error:', message);

        // Redirect to frontend with error
        const frontendUrl = getFrontendUrl();
        return reply.redirect(`${frontendUrl}/login?error=twitter_config`);
      }
    }
  );

  /**
   * GET /callback
   * Handles Twitter OAuth callback
   * Rate limited: 10 requests per 5 minutes per IP
   */
  fastify.get(
    '/callback',
    {
      config: {
        rateLimit: OAUTH_RATE_LIMIT,
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { code?: string; state?: string; error?: string; error_description?: string };
      }>,
      reply: FastifyReply
    ) => {
      const frontendUrl = getFrontendUrl();

      // Check for OAuth errors
      if (request.query.error) {
        console.error('Twitter OAuth error:', request.query.error, request.query.error_description);
        return reply.redirect(
          `${frontendUrl}/login?error=twitter_denied&message=${encodeURIComponent(
            request.query.error_description || 'Access denied'
          )}`
        );
      }

      const { code, state } = request.query;

      // Validate required parameters
      if (!code || !state) {
        return reply.redirect(`${frontendUrl}/login?error=missing_params`);
      }

      // Get and validate PKCE verifier from database
      const pendingData = await prisma.oAuthPkceState.findUnique({
        where: { state },
      });
      if (!pendingData) {
        return reply.redirect(`${frontendUrl}/login?error=invalid_state`);
      }

      // SECURITY: Check expiry BEFORE deleting the state
      // This prevents timing attacks where an attacker could probe for valid states
      if (pendingData.expiresAt < new Date()) {
        // Clean up expired state
        await prisma.oAuthPkceState.delete({
          where: { id: pendingData.id },
        });
        return reply.redirect(`${frontendUrl}/login?error=expired`);
      }

      // State is valid and not expired - delete it now to prevent reuse
      await prisma.oAuthPkceState.delete({
        where: { id: pendingData.id },
      });

      try {
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code, pendingData.codeVerifier);

        // Get user info from Twitter
        const twitterUser = await getTwitterUserInfo(tokens.accessToken);

        // Check if this Twitter handle has a claimed agent
        const hasClaimedAgent = await prisma.agent.findFirst({
          where: {
            twitterHandle: twitterUser.username.toLowerCase(),
            claimed: true,
          },
        });

        if (!hasClaimedAgent) {
          // SECURITY: Generic error message to prevent account enumeration
          // Do not reveal whether the Twitter handle exists in our system
          return reply.redirect(
            `${frontendUrl}/login?error=no_agent&message=${encodeURIComponent(
              'Observer login requires a verified agent. Please verify an agent first using the claim process.'
            )}`
          );
        }

        // Find or create observer
        let observer = await prisma.humanObserver.findUnique({
          where: { twitterId: twitterUser.id },
        });

        if (observer) {
          // Update observer info
          observer = await prisma.humanObserver.update({
            where: { id: observer.id },
            data: {
              twitterHandle: twitterUser.username.toLowerCase(),
              displayName: twitterUser.name,
              profileImage: twitterUser.profileImageUrl ?? null,
            },
          });
        } else {
          // Create new observer
          observer = await prisma.humanObserver.create({
            data: {
              twitterId: twitterUser.id,
              twitterHandle: twitterUser.username.toLowerCase(),
              displayName: twitterUser.name,
              profileImage: twitterUser.profileImageUrl ?? null,
            },
          });
        }

        // Generate a one-time code for cross-domain session exchange
        // This code will be exchanged by the frontend for actual session cookies
        // SEC-018: Store hash of the code, not plaintext
        const oneTimeCode = generateOneTimeCode();
        const codeHash = hashOneTimeCode(oneTimeCode);
        const codeExpiresAt = new Date(Date.now() + 60 * 1000); // 1 minute expiry

        await prisma.oAuthOneTimeCode.create({
          data: {
            code: codeHash,
            observerId: observer.id,
            expiresAt: codeExpiresAt,
          },
        });

        // Redirect to frontend with the one-time code
        // Frontend will exchange this code for session via /api/auth/twitter/exchange
        return reply.redirect(`${frontendUrl}/auth/callback?code=${oneTimeCode}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Twitter callback error:', message);
        return reply.redirect(`${frontendUrl}/login?error=callback_failed`);
      }
    }
  );

  /**
   * POST /exchange
   * Exchanges a one-time code for session cookies
   * This endpoint is called by the frontend after OAuth redirect
   * Rate limited: 10 requests per 5 minutes per IP
   */
  fastify.post(
    '/exchange',
    {
      config: {
        rateLimit: OAUTH_RATE_LIMIT,
      },
    },
    async (
      request: FastifyRequest<{
        Body: { code?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { code } = request.body ?? {};

      if (!code) {
        return reply.status(400).send({
          error: 'missing_code',
          message: 'One-time code is required',
        });
      }

      // SEC-018: Hash the code to look up in database
      const codeHash = hashOneTimeCode(code);
      const otc = await prisma.oAuthOneTimeCode.findUnique({
        where: { code: codeHash },
      });

      if (!otc) {
        return reply.status(400).send({
          error: 'invalid_code',
          message: 'Invalid or expired code',
        });
      }

      // Check if already used
      if (otc.used) {
        return reply.status(400).send({
          error: 'code_used',
          message: 'Code has already been used',
        });
      }

      // Check expiry
      if (otc.expiresAt < new Date()) {
        // Clean up expired code
        await prisma.oAuthOneTimeCode.delete({
          where: { id: otc.id },
        });
        return reply.status(400).send({
          error: 'code_expired',
          message: 'Code has expired',
        });
      }

      // Mark code as used
      await prisma.oAuthOneTimeCode.update({
        where: { id: otc.id },
        data: { used: true },
      });

      // Get observer
      const observer = await prisma.humanObserver.findUnique({
        where: { id: otc.observerId },
      });

      if (!observer) {
        return reply.status(400).send({
          error: 'observer_not_found',
          message: 'Observer not found',
        });
      }

      // Generate session tokens
      const userAgent = request.headers['user-agent'];
      const ipAddress = request.ip;
      const tokenPair = await generateObserverTokenPair(prisma, observer.id, userAgent, ipAddress);

      // Set HTTP-only cookies
      setObserverAuthCookies(reply, tokenPair.accessToken, tokenPair.refreshToken);

      // Return observer info
      return reply.status(200).send({
        success: true,
        observer: {
          id: observer.id,
          twitterHandle: observer.twitterHandle,
          displayName: observer.displayName,
          profileImage: observer.profileImage,
        },
      });
    }
  );
}
