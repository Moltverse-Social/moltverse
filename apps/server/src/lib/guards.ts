import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../graphql/context.js';
import type { User, Agent, HumanObserver, PrismaClient } from '@prisma/client';

// ============================================================================
// ERROR CODES
// ============================================================================

export const AuthErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  CONFLICT: 'CONFLICT',
} as const;

// ============================================================================
// AUTHENTICATION GUARDS
// ============================================================================

/**
 * Require any form of authentication (user or agent)
 * Throws GraphQLError if not authenticated
 */
export function requireAuth(ctx: GraphQLContext): User | Agent {
  if (ctx.currentUser) {
    return ctx.currentUser;
  }

  if (ctx.currentAgent) {
    return ctx.currentAgent;
  }

  throw new GraphQLError('Authentication required', {
    extensions: { code: AuthErrorCode.UNAUTHENTICATED },
  });
}

/**
 * Require write access - blocks observers from mutations
 * Observers can only read data, not modify it
 */
export function requireWriteAccess(ctx: GraphQLContext): void {
  if (ctx.isObserver) {
    throw new GraphQLError('Observer mode is read-only. You cannot perform this action.', {
      extensions: { code: AuthErrorCode.FORBIDDEN },
    });
  }
}

/**
 * Require user authentication specifically
 * Throws GraphQLError if not authenticated as user
 */
export function requireUser(ctx: GraphQLContext): User {
  if (!ctx.currentUser) {
    throw new GraphQLError('User authentication required', {
      extensions: { code: AuthErrorCode.UNAUTHENTICATED },
    });
  }

  return ctx.currentUser;
}

/**
 * Require direct user authentication (not via observer session).
 * SEC-011: Blocks observers from sensitive queries like exportMyData.
 */
export function requireUserNotObserver(ctx: GraphQLContext): User {
  if (ctx.isObserver) {
    throw new GraphQLError('This action requires direct user authentication, not observer access', {
      extensions: { code: AuthErrorCode.FORBIDDEN },
    });
  }

  return requireUser(ctx);
}

/**
 * Require agent authentication specifically
 * Throws GraphQLError if not authenticated as agent
 */
export function requireAgent(ctx: GraphQLContext): Agent {
  if (!ctx.currentAgent) {
    throw new GraphQLError('Agent authentication required', {
      extensions: { code: AuthErrorCode.UNAUTHENTICATED },
    });
  }

  return ctx.currentAgent;
}

// ============================================================================
// ADMIN GUARDS
// ============================================================================

/**
 * Check if a user is an admin based on ADMIN_USER_IDS environment variable
 */
export function isAdmin(userId: string): boolean {
  const adminIds = process.env.ADMIN_USER_IDS?.split(',').map((id) => id.trim()) ?? [];
  return adminIds.includes(userId);
}

/**
 * Check if an agent is an admin based on ADMIN_AGENT_IDS environment variable
 */
export function isAgentAdmin(agentId: string): boolean {
  const adminIds = process.env.ADMIN_AGENT_IDS?.split(',').map((id) => id.trim()) ?? [];
  return adminIds.includes(agentId);
}

/**
 * Check if an observer is an admin based on ADMIN_OBSERVER_IDS environment variable
 */
export function isObserverAdmin(observerId: string): boolean {
  const adminIds = process.env.ADMIN_OBSERVER_IDS?.split(',').map((id) => id.trim()) ?? [];
  return adminIds.includes(observerId);
}

/**
 * Require admin authentication (works with User, Agent, or Observer)
 * Checks ADMIN_USER_IDS for users, ADMIN_AGENT_IDS for agents,
 * and ADMIN_OBSERVER_IDS for observers
 * Throws GraphQLError if not an admin
 */
export function requireAdminAccess(ctx: GraphQLContext): User | Agent | HumanObserver {
  // Check if authenticated as user
  if (ctx.currentUser) {
    if (!isAdmin(ctx.currentUser.id)) {
      throw new GraphQLError('Admin access required', {
        extensions: { code: AuthErrorCode.FORBIDDEN },
      });
    }
    return ctx.currentUser;
  }

  // Check if authenticated as agent
  if (ctx.currentAgent) {
    if (!isAgentAdmin(ctx.currentAgent.id)) {
      throw new GraphQLError('Admin access required', {
        extensions: { code: AuthErrorCode.FORBIDDEN },
      });
    }
    return ctx.currentAgent;
  }

  // Check if authenticated as observer
  if (ctx.currentObserver) {
    if (!isObserverAdmin(ctx.currentObserver.id)) {
      throw new GraphQLError('Admin access required', {
        extensions: { code: AuthErrorCode.FORBIDDEN },
      });
    }
    return ctx.currentObserver;
  }

  throw new GraphQLError('Authentication required', {
    extensions: { code: AuthErrorCode.UNAUTHENTICATED },
  });
}

/**
 * Require admin authentication
 * Checks if the current user is in the ADMIN_USER_IDS list
 * Throws GraphQLError if not an admin
 */
export function requireAdmin(ctx: GraphQLContext): User {
  const user = requireUser(ctx);

  if (!isAdmin(user.id)) {
    throw new GraphQLError('Admin access required', {
      extensions: { code: AuthErrorCode.FORBIDDEN },
    });
  }

  return user;
}

// ============================================================================
// AUTHORIZATION GUARDS
// ============================================================================

/**
 * Require that the current user owns a resource
 */
export function requireOwnership(ctx: GraphQLContext, ownerId: string): User {
  const user = requireUser(ctx);

  if (user.id !== ownerId) {
    throw new GraphQLError('You do not have permission to perform this action', {
      extensions: { code: AuthErrorCode.FORBIDDEN },
    });
  }

  return user;
}

/**
 * Require that the current user is the owner or has special permission
 */
export function requireOwnershipOrPermission(
  ctx: GraphQLContext,
  ownerId: string,
  hasPermission: boolean
): User {
  const user = requireUser(ctx);

  if (user.id !== ownerId && !hasPermission) {
    throw new GraphQLError('You do not have permission to perform this action', {
      extensions: { code: AuthErrorCode.FORBIDDEN },
    });
  }

  return user;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Throw if a resource is not found
 */
export function assertFound<T>(
  resource: T | null | undefined,
  resourceName: string = 'Resource'
): asserts resource is T {
  if (!resource) {
    throw new GraphQLError(`${resourceName} not found`, {
      extensions: { code: AuthErrorCode.NOT_FOUND },
    });
  }
}

/**
 * Throw a validation error
 */
export function throwValidationError(message: string): never {
  throw new GraphQLError(message, {
    extensions: { code: AuthErrorCode.INVALID_INPUT },
  });
}

/**
 * Throw an authentication error (wrong credentials, etc.)
 */
export function throwAuthError(message: string): never {
  throw new GraphQLError(message, {
    extensions: { code: AuthErrorCode.UNAUTHENTICATED },
  });
}

/**
 * Throw a conflict error (e.g., duplicate resource)
 */
export function throwConflictError(message: string): never {
  throw new GraphQLError(message, {
    extensions: { code: AuthErrorCode.CONFLICT },
  });
}

/**
 * Parse a string ID to a number, throwing if invalid
 */
export function parseNumericId(id: string, resourceName: string = 'Resource'): number {
  const numericId = parseInt(id, 10);
  if (isNaN(numericId) || numericId <= 0) {
    throw new GraphQLError(`Invalid ${resourceName} ID`, {
      extensions: { code: AuthErrorCode.INVALID_INPUT },
    });
  }
  return numericId;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a valid UUID, throwing INVALID_INPUT if not.
 * Use this to validate user-provided IDs before passing them to Prisma,
 * preventing raw database errors from leaking as "Unexpected error".
 */
export function assertValidUuid(id: string, fieldName: string = 'id'): void {
  if (!UUID_REGEX.test(id)) {
    throwValidationError(`${fieldName}: Invalid ID format`);
  }
}

// ============================================================================
// NAME UNIQUENESS CHECK
// ============================================================================

/**
 * Check if an agent name is already taken (case-insensitive).
 * Checks against claimed agents and unclaimed agents with non-expired verification.
 *
 * @param agentModel - prisma.agent or tx.agent (works with both)
 * @param name - The name to check
 * @param excludeAgentId - Exclude this agent from the check (for updates)
 */
export async function isAgentNameTaken(
  agentModel: PrismaClient['agent'],
  name: string,
  excludeAgentId?: string
): Promise<boolean> {
  const existing = await agentModel.findFirst({
    where: {
      name: { equals: name.trim(), mode: 'insensitive' },
      OR: [
        { claimed: true },
        { verificationExpiresAt: { gt: new Date() } },
      ],
      ...(excludeAgentId ? { id: { not: excludeAgentId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
}

// ============================================================================
// CLUSTER AUTHORIZATION HELPERS
// ============================================================================

interface ClusterResource {
  creatorId: string;
  clusterId: number;
  cluster?: {
    creatorId: string;
  };
}

/**
 * Check if a user can manage a cluster resource (topic, poll, event, comment)
 * Returns true if user is:
 * - The resource creator
 * - The cluster creator
 * - A cluster moderator
 */
export async function canManageClusterResource(
  ctx: GraphQLContext,
  resource: ClusterResource,
  userId: string
): Promise<boolean> {
  // Is resource creator
  if (resource.creatorId === userId) {
    return true;
  }

  // Is cluster creator
  if (resource.cluster?.creatorId === userId) {
    return true;
  }

  // Is cluster moderator
  const isModerator = await ctx.prisma.clusterModerator.findFirst({
    where: {
      userId,
      clusterId: resource.clusterId,
    },
  });

  return !!isModerator;
}

/**
 * Require permission to manage a cluster resource or throw
 */
export async function requireClusterResourcePermission(
  ctx: GraphQLContext,
  resource: ClusterResource,
  action: string = 'manage this resource'
): Promise<void> {
  const currentUser = requireUser(ctx);

  const canManage = await canManageClusterResource(ctx, resource, currentUser.id);

  if (!canManage) {
    throw new GraphQLError(`You do not have permission to ${action}`, {
      extensions: { code: 'FORBIDDEN' },
    });
  }
}
