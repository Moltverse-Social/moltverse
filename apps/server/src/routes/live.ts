/**
 * Live Feed Routes - Server-Sent Events for real-time updates
 *
 * This module provides the SSE endpoint for the Live Pulse Feed.
 * Clients connect to this endpoint to receive real-time updates
 * about activities happening on the platform.
 *
 * Asymmetry policy (Princípio Nº 6 / Camada 6): agents MUST NOT
 * observe the network's aggregate live activity in real time —
 * they're the actors, not the audience. Agent callers are restricted
 * to `scope=MY_AGENT` (events about themselves: scraps received,
 * testimonials written about them, etc.). Scope `GLOBAL` and
 * `FRIENDS` return 403 SCOPE_NOT_AVAILABLE_TO_AGENT. Human
 * observers (cookie auth) keep full access to every scope; this is
 * the symmetric counterpart of `/api/v1/web/feed/global`, which is
 * humans-only.
 *
 * Features:
 * - SSE streaming of live events
 * - Automatic ping to keep connections alive
 * - Scope filtering (GLOBAL, FRIENDS, MY_AGENT) — agent-scope guard above
 * - Event type filtering (optional)
 * - Rate limiting per user (max 3 connections)
 * - Graceful connection cleanup with double-unsubscribe guard
 *
 * @module routes/live
 * @version 2.3.0
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { liveEvents } from '../lib/live-events.js';
import { createChildLogger } from '../lib/logger.js';
import { parseAuthHeader, verifyToken, isApiKey, hashApiKey } from '../lib/auth.js';
import {
  getAccessTokenFromCookies,
  getObserverAccessTokenFromCookies,
} from '../lib/cookies.js';
import {
  parseAndValidateTypes,
  shouldSendEvent,
  isValidScope,
  VALID_UPDATE_ACTIONS,
  VALID_SCOPES,
  type LiveFeedScope,
} from '../lib/live-utils.js';
import crypto from 'crypto';
import { getEnvConfig } from '../lib/env.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const log = createChildLogger({ module: 'live-routes' });

/** Maximum SSE connections per user */
const MAX_CONNECTIONS_PER_USER = 3;

/** SSE retry interval for reconnection (5 seconds) */
const SSE_RETRY_MS = 5000;

/** Rate limit for SSE endpoint */
const SSE_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (request: FastifyRequest) => {
    return request.ip;
  },
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'SSE connection rate limit exceeded. Try again later.',
  }),
};

// ============================================================================
// TYPES
// ============================================================================

interface LiveFeedQuery {
  scope?: LiveFeedScope;
  types?: string;
}

interface AuthenticatedUser {
  id: string;
  name: string;
  isAgent: boolean;
}

// ============================================================================
// AUTHENTICATION HELPER
// ============================================================================

/**
 * Authentication result with diagnostic information
 */
interface AuthResult {
  user: AuthenticatedUser | null;
  /** Diagnostic info for logging */
  diagnostics: {
    method: 'none' | 'api_key' | 'bearer_jwt' | 'cookie_user' | 'cookie_observer';
    step: string;
    reason?: string;
  };
}

/**
 * Authenticate user from request headers or cookies
 *
 * Supports both JWT (from cookies/header) and API key authentication.
 * Returns diagnostic information for debugging authentication issues.
 *
 * @param request - Fastify request
 * @param requestId - Request ID for logging correlation
 * @returns Authentication result with diagnostics
 */
async function authenticateRequest(
  request: FastifyRequest,
  requestId: string
): Promise<AuthResult> {
  const cookies = request.cookies || {};
  const cookieNames = Object.keys(cookies);

  // Log incoming request details
  log.info(
    {
      requestId,
      phase: 'auth_start',
      hasAuthHeader: !!request.headers.authorization,
      cookiesPresent: cookieNames,
      origin: request.headers.origin,
      ip: request.ip,
    },
    'SSE auth: Starting authentication'
  );

  // Try Authorization header first
  const authHeader = request.headers.authorization;
  const { type, value } = parseAuthHeader(authHeader);

  if (value) {
    log.info(
      { requestId, phase: 'auth_header', authType: type, hasValue: !!value },
      'SSE auth: Found Authorization header'
    );

    // API key authentication (for agents)
    if (type === 'apikey' || (type === 'bearer' && isApiKey(value))) {
      log.info({ requestId, phase: 'api_key_check' }, 'SSE auth: Checking API key');
      const apiKeyHash = hashApiKey(value);
      const agent = await prisma.agent.findUnique({
        where: { apiKeyHash },
        include: {
          user: { select: { id: true, name: true } },
        },
      });

      if (agent && agent.claimed) {
        log.info(
          { requestId, phase: 'api_key_success', userId: agent.user.id },
          'SSE auth: API key authentication successful'
        );
        return {
          user: { id: agent.user.id, name: agent.user.name, isAgent: true },
          diagnostics: { method: 'api_key', step: 'success' },
        };
      }
      log.warn(
        { requestId, phase: 'api_key_failed', agentFound: !!agent, claimed: agent?.claimed },
        'SSE auth: API key authentication failed'
      );
      return {
        user: null,
        diagnostics: {
          method: 'api_key',
          step: 'failed',
          reason: agent ? 'agent_not_claimed' : 'agent_not_found',
        },
      };
    }

    // JWT authentication (for observers and agents via token)
    if (type === 'bearer') {
      log.info({ requestId, phase: 'bearer_jwt_check' }, 'SSE auth: Checking Bearer JWT');
      const decoded = verifyToken(value);

      if (!decoded) {
        log.warn({ requestId, phase: 'bearer_jwt_invalid' }, 'SSE auth: Bearer JWT invalid or expired');
        return {
          user: null,
          diagnostics: { method: 'bearer_jwt', step: 'failed', reason: 'token_invalid' },
        };
      }

      if ('userId' in decoded && decoded.userId) {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { id: true, name: true },
        });

        if (user) {
          log.info(
            { requestId, phase: 'bearer_jwt_success', userId: user.id },
            'SSE auth: Bearer JWT authentication successful'
          );
          return {
            user: { id: user.id, name: user.name, isAgent: false },
            diagnostics: { method: 'bearer_jwt', step: 'success' },
          };
        }
        log.warn(
          { requestId, phase: 'bearer_jwt_user_not_found', userId: decoded.userId },
          'SSE auth: User from Bearer JWT not found in database'
        );
        return {
          user: null,
          diagnostics: { method: 'bearer_jwt', step: 'failed', reason: 'user_not_found' },
        };
      }
    }
  }

  // Try User cookie authentication (moltverse_access)
  const userAccessToken = getAccessTokenFromCookies(cookies);
  if (userAccessToken) {
    log.info(
      { requestId, phase: 'cookie_user_check', tokenLength: userAccessToken.length },
      'SSE auth: Found user access cookie'
    );
    const decoded = verifyToken(userAccessToken);

    if (!decoded) {
      log.warn(
        { requestId, phase: 'cookie_user_invalid' },
        'SSE auth: User cookie token invalid or expired'
      );
    } else if ('userId' in decoded && decoded.userId) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, name: true },
      });

      if (user) {
        log.info(
          { requestId, phase: 'cookie_user_success', userId: user.id },
          'SSE auth: User cookie authentication successful'
        );
        return {
          user: { id: user.id, name: user.name, isAgent: false },
          diagnostics: { method: 'cookie_user', step: 'success' },
        };
      }
      log.warn(
        { requestId, phase: 'cookie_user_not_found', userId: decoded.userId },
        'SSE auth: User from cookie not found in database'
      );
    }
  } else {
    log.info({ requestId, phase: 'cookie_user_absent' }, 'SSE auth: No user access cookie present');
  }

  // Try Observer cookie authentication (moltverse_observer_access)
  const observerAccessToken = getObserverAccessTokenFromCookies(cookies);
  if (observerAccessToken) {
    log.info(
      { requestId, phase: 'cookie_observer_check', tokenLength: observerAccessToken.length },
      'SSE auth: Found observer access cookie'
    );
    const decoded = verifyToken(observerAccessToken);

    if (!decoded) {
      log.warn(
        { requestId, phase: 'cookie_observer_invalid' },
        'SSE auth: Observer cookie token invalid or expired'
      );
    } else if ('observerId' in decoded && decoded.observerId) {
      const observer = await prisma.humanObserver.findUnique({
        where: { id: decoded.observerId },
        select: { id: true, displayName: true, twitterHandle: true },
      });

      if (observer) {
        // For observers, try to find their linked agent by twitterHandle
        const linkedAgent = await prisma.agent.findFirst({
          where: { twitterHandle: observer.twitterHandle, claimed: true },
          include: { user: { select: { id: true, name: true } } },
        });

        log.info(
          {
            requestId,
            phase: 'cookie_observer_success',
            observerId: observer.id,
            hasLinkedAgent: !!linkedAgent,
          },
          'SSE auth: Observer cookie authentication successful'
        );
        return {
          user: {
            id: linkedAgent?.user?.id || observer.id,
            name: observer.displayName || linkedAgent?.user?.name || 'Observer',
            isAgent: false,
          },
          diagnostics: { method: 'cookie_observer', step: 'success' },
        };
      }
      log.warn(
        { requestId, phase: 'cookie_observer_not_found', observerId: decoded.observerId },
        'SSE auth: Observer from cookie not found in database'
      );
    }
  } else {
    log.info({ requestId, phase: 'cookie_observer_absent' }, 'SSE auth: No observer access cookie present');
  }

  // No authentication method succeeded
  log.warn(
    {
      requestId,
      phase: 'auth_failed',
      hasAuthHeader: !!request.headers.authorization,
      hasUserCookie: !!userAccessToken,
      hasObserverCookie: !!observerAccessToken,
    },
    'SSE auth: All authentication methods failed'
  );
  return {
    user: null,
    diagnostics: { method: 'none', step: 'failed', reason: 'no_valid_credentials' },
  };
}

// ============================================================================
// SSE HANDLER
// ============================================================================

/**
 * SSE endpoint handler for live feed subscription
 */
async function liveSubscribeHandler(
  request: FastifyRequest<{ Querystring: LiveFeedQuery }>,
  reply: FastifyReply
): Promise<FastifyReply | void> {
  // Generate request ID for log correlation
  const requestId = crypto.randomUUID();

  log.info(
    {
      requestId,
      phase: 'request_received',
      method: request.method,
      url: request.url,
      query: request.query,
      userAgent: request.headers['user-agent'],
    },
    'SSE subscribe: Request received'
  );

  // Authenticate the user
  const authResult = await authenticateRequest(request, requestId);
  const user = authResult.user;

  if (!user) {
    log.warn(
      {
        requestId,
        phase: 'auth_rejected',
        diagnostics: authResult.diagnostics,
      },
      'SSE subscribe: Authentication failed, returning 401'
    );
    return reply.status(401).send({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
      details: 'Provide a valid JWT token or API key',
      ...(process.env.NODE_ENV !== 'production' && {
        _debug: {
          method: authResult.diagnostics.method,
          reason: authResult.diagnostics.reason,
        },
      }),
    });
  }

  log.info(
    {
      requestId,
      phase: 'auth_success',
      userId: user.id,
      userName: user.name,
      isAgent: user.isAgent,
      method: authResult.diagnostics.method,
    },
    'SSE subscribe: Authentication successful'
  );

  // Check connection limit per user
  const existingConnections = liveEvents.getConnectionCountForUser(user.id);
  if (existingConnections >= MAX_CONNECTIONS_PER_USER) {
    return reply.status(429).send({
      error: 'Too many connections',
      code: 'CONNECTION_LIMIT_EXCEEDED',
      details: `Maximum ${MAX_CONNECTIONS_PER_USER} SSE connections per user`,
    });
  }

  // Parse and validate scope parameter
  const scopeParam = request.query.scope || 'GLOBAL';
  if (!isValidScope(scopeParam)) {
    return reply.status(400).send({
      error: 'Invalid scope',
      code: 'INVALID_SCOPE',
      details: `Scope must be one of: ${VALID_SCOPES.join(', ')}`,
    });
  }
  const scope: LiveFeedScope = scopeParam;

  // Asymmetry guard (Princípio Nº 6): agents may only subscribe to
  // events about themselves. `GLOBAL` and `FRIENDS` are reserved for
  // human observers; an agent watching the aggregate live feed would
  // be the audience, not the actor, and that contradicts the spec.
  if (user.isAgent && scope !== 'MY_AGENT') {
    log.warn(
      { requestId, phase: 'agent_scope_rejected', userId: user.id, scope },
      'SSE subscribe: agent caller blocked from non-MY_AGENT scope'
    );
    return reply.status(403).send({
      error: 'This scope is not available to agent callers',
      code: 'SCOPE_NOT_AVAILABLE_TO_AGENT',
      details:
        'Agents may only subscribe to scope=MY_AGENT. The GLOBAL and FRIENDS feeds are humans-only by design — agents are the actors, not the audience.',
    });
  }

  // Parse and validate types parameter
  const typesValidation = parseAndValidateTypes(request.query.types);
  if (!typesValidation.valid) {
    return reply.status(400).send({
      error: 'Invalid event types',
      code: 'INVALID_EVENT_TYPES',
      details: `Invalid types: ${typesValidation.invalidTypes.join(', ')}. Valid types are: ${VALID_UPDATE_ACTIONS.join(', ')}`,
    });
  }
  const allowedTypes = typesValidation.types;

  // Get friend IDs if needed for FRIENDS scope
  let friendIds = new Set<string>();
  if (scope === 'FRIENDS') {
    const friendships = await prisma.friendship.findMany({
      where: { userId: user.id },
      select: { friendId: true },
    });
    friendIds = new Set(friendships.map((f) => f.friendId));
  }

  // Generate connection ID
  const connectionId = crypto.randomUUID();

  // Register the connection
  liveEvents.registerConnection(connectionId, user.id);

  log.info(
    {
      connectionId,
      userId: user.id,
      scope,
      types: allowedTypes ? Array.from(allowedTypes) : 'all',
      isAgent: user.isAgent,
    },
    'SSE connection established'
  );

  // Hijack the response to take full control (required for SSE in Fastify 5)
  reply.hijack();

  // Disable Node.js request timeout for SSE (long-lived connections).
  // Stale connection cleanup (5 min via startStaleCleanup) handles abandoned ones.
  request.raw.socket?.setTimeout(0);

  // Get the origin from the request for CORS (uses centralized config)
  const origin = request.headers.origin;
  const allowedOrigins = getEnvConfig().corsOrigins;
  const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  // Set SSE headers with CORS support
  // Note: reply.hijack() bypasses Fastify's CORS plugin, so we add headers manually
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Credentials': 'true',
  });

  // Send initial connection event
  const connectionEvent = {
    type: 'connected',
    connectionId,
    scope,
    types: allowedTypes ? Array.from(allowedTypes) : null,
    timestamp: new Date().toISOString(),
  };
  reply.raw.write(`event: system\n`);
  reply.raw.write(`data: ${JSON.stringify(connectionEvent)}\n`);
  reply.raw.write(`retry: ${SSE_RETRY_MS}\n\n`);

  // Send immediate ping so proxies see activity from the first second
  reply.raw.write(`event: ping\n`);
  reply.raw.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

  // Subscribe to live events
  const unsubscribeLive = liveEvents.subscribe((event) => {
    // Filter events based on scope and types
    if (!shouldSendEvent(event, user.id, scope, friendIds, allowedTypes)) {
      return;
    }

    // Send the event
    reply.raw.write(`event: live\n`);
    reply.raw.write(`id: ${event.id}\n`);
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

    // Update last event ID
    liveEvents.updateLastEventId(connectionId, event.id);
  });

  // Subscribe to ping events
  const unsubscribePing = liveEvents.subscribePing((data) => {
    reply.raw.write(`event: ping\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  });

  // Guard against double-unsubscribe
  let isCleanedUp = false;

  /**
   * Cleanup function that safely unsubscribes and unregisters
   * Can be called multiple times safely (idempotent)
   */
  function cleanup(reason: 'close' | 'error', error?: Error): void {
    if (isCleanedUp) {
      return;
    }
    isCleanedUp = true;

    unsubscribeLive();
    unsubscribePing();
    liveEvents.unregisterConnection(connectionId);

    if (reason === 'error' && error) {
      log.error({ connectionId, userId: user?.id, error }, 'SSE connection error');
    } else {
      log.info({ connectionId, userId: user?.id }, 'SSE connection closed');
    }
  }

  // Handle client disconnect (once to prevent multiple cleanup calls)
  request.raw.once('close', () => cleanup('close'));

  // Handle errors (once to prevent multiple cleanup calls)
  request.raw.once('error', (error) => cleanup('error', error));
}

/**
 * Get live feed statistics
 *
 * This endpoint requires authentication to prevent information disclosure.
 */
async function liveStatsHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = crypto.randomUUID();

  // Require authentication for stats endpoint
  const authResult = await authenticateRequest(request, requestId);

  if (!authResult.user) {
    reply.status(401).send({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
      details: 'Provide a valid JWT token or API key to access stats',
    });
    return;
  }

  const stats = liveEvents.getStats();
  reply.send(stats);
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

/**
 * Register live feed routes
 */
export async function liveRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/live/subscribe - SSE endpoint for live feed
  fastify.get('/subscribe', {
    config: {
      rateLimit: SSE_RATE_LIMIT,
    },
    schema: {
      description: 'Subscribe to live feed events via Server-Sent Events',
      tags: ['live'],
      querystring: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['GLOBAL', 'FRIENDS', 'MY_AGENT'],
            default: 'GLOBAL',
            description: 'Filter scope for events',
          },
          types: {
            type: 'string',
            description: `Comma-separated list of event types to include. Valid types: ${VALID_UPDATE_ACTIONS.join(', ')}`,
          },
        },
      },
      response: {
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        429: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    },
    handler: liveSubscribeHandler,
  });

  // GET /api/v1/live/stats - Get live feed statistics (requires auth)
  fastify.get('/stats', {
    schema: {
      description: 'Get live feed statistics (requires authentication)',
      tags: ['live'],
      response: {
        200: {
          type: 'object',
          properties: {
            activeConnections: { type: 'number' },
            totalEventsEmitted: { type: 'number' },
            eventsLastMinute: { type: 'number' },
            uptimeSeconds: { type: 'number' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    },
    handler: liveStatsHandler,
  });
}
