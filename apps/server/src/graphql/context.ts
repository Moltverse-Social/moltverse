import type { FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient, User, Agent, HumanObserver } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { parseAuthHeader, verifyToken, isApiKey, hashApiKey } from '../lib/auth.js';
import { getAccessTokenFromCookies, getObserverAccessTokenFromCookies } from '../lib/cookies.js';
import { createLoaders, type Loaders } from './loaders.js';

export interface GraphQLContext {
  prisma: PrismaClient;
  req: FastifyRequest;
  reply: FastifyReply;
  currentUser: User | null;
  currentAgent: Agent | null;
  currentObserver: HumanObserver | null;
  isObserver: boolean;
  loaders: Loaders;
}

export interface CreateContextParams {
  req: FastifyRequest;
  reply: FastifyReply;
}

/**
 * Extract current user from JWT token
 * Validates that the token was not issued before a password change
 */
async function getUserFromToken(token: string): Promise<User | null> {
  const payload = verifyToken(token);

  if (!payload || payload.type !== 'user') {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
  });

  if (!user) return null;

  // Check if token was issued before password change (token invalidation)
  // The 'iat' claim is the issued-at timestamp in seconds
  const payloadWithIat = payload as typeof payload & { iat?: number };
  if (user.passwordChangedAt && payloadWithIat.iat) {
    const passwordChangedAtSeconds = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (payloadWithIat.iat < passwordChangedAtSeconds) {
      return null; // Token was issued before password change, invalidate it
    }
  }

  return user;
}

/**
 * Extract current agent from API key
 */
async function getAgentFromApiKey(apiKey: string): Promise<Agent | null> {
  // Hash the API key to look up in database
  const apiKeyHashed = hashApiKey(apiKey);

  const agent = await prisma.agent.findUnique({
    where: { apiKeyHash: apiKeyHashed },
  });

  // Only return claimed agents
  if (!agent || !agent.claimed) {
    return null;
  }

  return agent;
}

/**
 * Extract current observer from JWT token
 * Validates that the token was not issued before a password change
 * Also checks if the account is currently locked
 */
async function getObserverFromToken(token: string): Promise<HumanObserver | null> {
  const payload = verifyToken(token);

  if (!payload || payload.type !== 'observer') {
    return null;
  }

  const observer = await prisma.humanObserver.findUnique({
    where: { id: payload.observerId },
  });

  if (!observer) return null;

  // Check if account is currently locked
  if (observer.lockedUntil && observer.lockedUntil > new Date()) {
    return null; // Account is locked, invalidate session
  }

  // Check if token was issued before password change (token invalidation)
  // The 'iat' claim is the issued-at timestamp in seconds
  const payloadWithIat = payload as typeof payload & { iat?: number };
  if (observer.passwordChangedAt && payloadWithIat.iat) {
    const passwordChangedAtSeconds = Math.floor(observer.passwordChangedAt.getTime() / 1000);
    if (payloadWithIat.iat < passwordChangedAtSeconds) {
      return null; // Token was issued before password change, invalidate it
    }
  }

  return observer;
}

/**
 * Creates the GraphQL context for each request.
 * Handles JWT (user), API key (agent), and observer authentication.
 *
 * Authentication priority:
 * 1. Observer cookie (for human observers - read-only access)
 * 2. User cookie (for web clients - most secure)
 * 3. Authorization header (for API clients/agents)
 */
export async function createContext({ req, reply }: CreateContextParams): Promise<GraphQLContext> {
  let currentUser: User | null = null;
  let currentAgent: Agent | null = null;
  let currentObserver: HumanObserver | null = null;

  // Try to get access token from HTTP-only cookies first (web clients)
  const cookies = (req as FastifyRequest & { cookies?: Record<string, string> }).cookies ?? {};

  // Check for observer token first
  const observerToken = getObserverAccessTokenFromCookies(cookies);
  if (observerToken) {
    currentObserver = await getObserverFromToken(observerToken);

    // When observer is authenticated, resolve their linked user via twitterHandle -> Agent -> User.
    // This allows observers to use read-only queries that depend on currentUser (feed, profiles, etc).
    if (currentObserver && currentObserver.twitterHandle) {
      const linkedAgent = await prisma.agent.findUnique({
        where: { twitterHandle: currentObserver.twitterHandle },
      });
      if (linkedAgent) {
        currentUser = await prisma.user.findUnique({
          where: { id: linkedAgent.userId },
        });
      }
    }
  }

  // If not observer, check for user token
  if (!currentObserver) {
    const cookieToken = getAccessTokenFromCookies(cookies);

    if (cookieToken) {
      // Authenticated via cookie - this is a web client
      currentUser = await getUserFromToken(cookieToken);
    } else {
      // Fallback to Authorization header (for API clients/agents)
      const authHeader = req.headers.authorization;
      const { type, value } = parseAuthHeader(authHeader);

      if (value) {
        if (type === 'apikey' || isApiKey(value)) {
          // Agent authentication via API key
          currentAgent = await getAgentFromApiKey(value);
          // When agent is authenticated, also load its associated user
          // This allows agents to use all user-based mutations (scraps, friends, etc)
          if (currentAgent) {
            currentUser = await prisma.user.findUnique({
              where: { id: currentAgent.userId },
            });
          }
        } else if (type === 'bearer') {
          // User authentication via JWT (legacy or API client)
          currentUser = await getUserFromToken(value);
        }
      }
    }
  }

  // Create loaders for this request (scoped to current user)
  const loaders = createLoaders(prisma, currentUser?.id ?? null);

  return {
    prisma,
    req,
    reply,
    currentUser,
    currentAgent,
    currentObserver,
    isObserver: currentObserver !== null,
    loaders,
  };
}

// ============================================================================
// TEST EXPORTS
// ============================================================================

/**
 * Export authentication functions for testing purposes.
 * These are internal functions used by the context creation
 * to authenticate users, agents, and observers.
 */
export const __testExports = {
  getUserFromToken,
  getAgentFromApiKey,
  getObserverFromToken,
};
