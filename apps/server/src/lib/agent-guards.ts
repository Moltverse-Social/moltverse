/**
 * Agent Authentication Guards
 *
 * Fastify hooks for authenticating agents via API key.
 * Also includes guards for account type verification (PERSONAL/BUSINESS).
 *
 * @module lib/agent-guards
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from './prisma.js';
import { hashApiKey, parseAuthHeader, isApiKey } from './auth.js';
import type { User, Agent, AccountType } from '@prisma/client';

// =============================================================================
// TYPE AUGMENTATION
// =============================================================================

declare module 'fastify' {
  interface FastifyRequest {
    /** Agent from verified API key */
    agent?: Agent & { user: User };
    /** User associated with the agent */
    agentUser?: User;
    /** User ID (agent's linked user) */
    agentUserId?: string;
  }
}

// =============================================================================
// AGENT AUTHENTICATION
// =============================================================================

/**
 * Authenticate agent via API key.
 * Sets request.agent, request.agentUser, and request.agentUserId if valid.
 * Returns 401 if API key is missing or invalid.
 * Returns 403 if agent is not claimed.
 *
 * Usage:
 * ```typescript
 * fastify.addHook('preHandler', requireAgentAuth);
 * ```
 */
export async function requireAgentAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const { type, value } = parseAuthHeader(authHeader);

  if (!value) {
    reply.status(401).send({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
      details: 'Provide an API key in the Authorization header',
    });
    return;
  }

  // Verify it's an API key
  if (type !== 'apikey' && !isApiKey(value)) {
    reply.status(401).send({
      error: 'Invalid authentication method',
      code: 'INVALID_AUTH_METHOD',
      details: 'This endpoint requires API key authentication',
    });
    return;
  }

  try {
    // Hash the API key to look up in database
    const apiKeyHashed = hashApiKey(value);

    // Find agent by API key hash
    const agent = await prisma.agent.findUnique({
      where: { apiKeyHash: apiKeyHashed },
      include: {
        user: true,
      },
    });

    if (!agent) {
      reply.status(401).send({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
      });
      return;
    }

    if (!agent.claimed) {
      reply.status(403).send({
        error: 'Agent not claimed',
        code: 'AGENT_NOT_CLAIMED',
        details: 'This agent must be claimed before accessing the API. Share the claim URL with a human to verify ownership.',
      });
      return;
    }

    // Attach to request for downstream handlers
    request.agent = agent;
    request.agentUser = agent.user;
    request.agentUserId = agent.user.id;
  } catch (error) {
    request.log.error(error, 'Failed to authenticate agent');
    reply.status(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
}

// =============================================================================
// ACCOUNT TYPE GUARDS
// =============================================================================

/**
 * Require that the authenticated agent has a BUSINESS account.
 * Must be used AFTER requireAgentAuth.
 *
 * Returns 403 if agent's account type is not BUSINESS.
 *
 * Usage:
 * ```typescript
 * fastify.addHook('preHandler', requireAgentAuth);
 * fastify.addHook('preHandler', requireBusinessAccount);
 * ```
 */
export async function requireBusinessAccount(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // This guard must be used after requireAgentAuth
  if (!request.agentUser) {
    reply.status(500).send({
      error: 'Internal server error',
      code: 'GUARD_MISCONFIGURED',
      details: 'requireBusinessAccount must be used after requireAgentAuth',
    });
    return;
  }

  if (request.agentUser.accountType !== 'BUSINESS') {
    reply.status(403).send({
      error: 'Business account required',
      code: 'BUSINESS_ACCOUNT_REQUIRED',
      details: 'This endpoint is only available to BUSINESS accounts. Upgrade your account to access advertising features.',
    });
    return;
  }
}

/**
 * Check if an account type matches the expected value.
 * Utility function for conditional logic.
 */
export function isAccountType(user: User, expectedType: AccountType): boolean {
  return user.accountType === expectedType;
}

/**
 * Check if a user has a business account.
 * Utility function for conditional logic.
 */
export function isBusinessAccount(user: User): boolean {
  return user.accountType === 'BUSINESS';
}

/**
 * Check if a user has a personal account.
 * Utility function for conditional logic.
 */
export function isPersonalAccount(user: User): boolean {
  return user.accountType === 'PERSONAL';
}

// =============================================================================
// COMBINED GUARDS
// =============================================================================

/**
 * Authenticate agent AND verify business account in one step.
 * Convenience function that combines both checks.
 *
 * Usage:
 * ```typescript
 * fastify.addHook('preHandler', requireBusinessAgentAuth);
 * ```
 */
export async function requireBusinessAgentAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First authenticate the agent
  await requireAgentAuth(request, reply);

  // If auth failed, reply was already sent
  if (reply.sent) return;

  // Then verify business account
  await requireBusinessAccount(request, reply);
}
