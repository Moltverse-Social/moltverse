/**
 * Ad Delivery REST Routes
 *
 * Public endpoints for serving and tracking ads.
 * Authentication is optional - anonymous users are tracked by IP hash.
 *
 * Endpoints:
 * - GET  /next       Get next ad to display
 * - POST /impression Record an ad impression
 * - POST /click      Record an ad click
 *
 * @module routes/ads
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// Import to ensure rate-limit type declarations are loaded
import '@fastify/rate-limit';
import {
  getNextAd,
  recordImpression,
  recordClick,
  getCacheStats,
  AdCandidate,
  AdSelectionContext,
  AdSlotType,
} from '../lib/ads.js';
import { isAdsSystemEnabled, ADS_RATE_LIMITS } from '../lib/ads-constants.js';
import { getObserverAccessTokenFromCookies } from '../lib/cookies.js';
import { verifyToken, ObserverJWTPayload } from '../lib/auth.js';

// =============================================================================
// FEATURE FLAG GUARD
// =============================================================================

/**
 * Middleware to check if ads system is enabled
 */
function requireAdsSystem(
  _request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): void {
  if (!isAdsSystemEnabled()) {
    reply.status(404).send({
      error: 'Not Found',
      code: 'ADS_SYSTEM_DISABLED',
      message: 'Ads system is not enabled',
    });
    return;
  }
  done();
}

// =============================================================================
// RATE LIMIT CONFIGURATION
// =============================================================================

const AD_NEXT_RATE_LIMIT = {
  max: ADS_RATE_LIMITS.AD_NEXT.max,
  timeWindow: ADS_RATE_LIMITS.AD_NEXT.timeWindow,
  keyGenerator: (request: FastifyRequest) => {
    // Use observer ID if authenticated, otherwise IP
    const observerId = getObserverIdFromRequest(request);
    return observerId ?? request.ip;
  },
  errorResponseBuilder: (
    _request: FastifyRequest,
    context: { max: number; ttl: number }
  ) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded. Maximum ${context.max} per minute.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

const AD_IMPRESSION_RATE_LIMIT = {
  max: ADS_RATE_LIMITS.AD_IMPRESSION.max,
  timeWindow: ADS_RATE_LIMITS.AD_IMPRESSION.timeWindow,
  keyGenerator: (request: FastifyRequest) => {
    const observerId = getObserverIdFromRequest(request);
    return observerId ?? request.ip;
  },
  errorResponseBuilder: (
    _request: FastifyRequest,
    context: { max: number; ttl: number }
  ) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded. Maximum ${context.max} per minute.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

const AD_CLICK_RATE_LIMIT = {
  max: ADS_RATE_LIMITS.AD_CLICK.max,
  timeWindow: ADS_RATE_LIMITS.AD_CLICK.timeWindow,
  keyGenerator: (request: FastifyRequest) => {
    const observerId = getObserverIdFromRequest(request);
    return observerId ?? request.ip;
  },
  errorResponseBuilder: (
    _request: FastifyRequest,
    context: { max: number; ttl: number }
  ) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded. Maximum ${context.max} per minute.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

// =============================================================================
// TYPES
// =============================================================================

interface NextQuerystring {
  slot?: string;
}

interface AdResponse {
  ad: AdCandidate | null;
}

interface ImpressionBody {
  campaignId: string;
}

interface ImpressionResponse {
  impressionId: string;
}

interface ClickBody {
  impressionId: string;
}

interface ClickResponse {
  success: boolean;
}

interface ErrorResponse {
  error: string;
  code: string;
  details?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract observer ID from request cookies if authenticated
 */
function getObserverIdFromRequest(request: FastifyRequest): string | undefined {
  try {
    const cookies = request.cookies ?? {};
    const token = getObserverAccessTokenFromCookies(cookies);

    if (!token) {
      return undefined;
    }

    const decoded = verifyToken(token);

    if (decoded && 'observerId' in decoded) {
      return (decoded as ObserverJWTPayload).observerId;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validate slot type parameter
 */
function isValidSlotType(slot: string | undefined): slot is AdSlotType {
  return slot === 'feed' || slot === 'sidebar';
}

/**
 * Build ad selection context from request
 */
function buildSelectionContext(
  request: FastifyRequest,
  slotType?: AdSlotType
): AdSelectionContext {
  return {
    observerId: getObserverIdFromRequest(request),
    ipAddress: request.ip,
    slotType,
  };
}

/**
 * Validate UUID format
 */
function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * GET /api/v1/ads/next
 * Get the next ad to display
 *
 * Query params:
 * - slot: 'feed' | 'sidebar' (default: 'feed')
 */
async function nextHandler(
  request: FastifyRequest<{ Querystring: NextQuerystring }>,
  _reply: FastifyReply
): Promise<AdResponse> {
  const startTime = Date.now();

  // Parse and validate slot type
  const slotParam = request.query.slot;
  const slotType: AdSlotType = isValidSlotType(slotParam) ? slotParam : 'feed';

  const context = buildSelectionContext(request, slotType);
  const cacheStats = getCacheStats();

  const ad = await getNextAd(context);

  const duration = Date.now() - startTime;

  // Structured logging for monitoring
  request.log.info({
    event: 'ad_next',
    duration,
    slotType,
    cacheHit: cacheStats.cached && cacheStats.age !== null && cacheStats.age < 60000,
    cacheAge: cacheStats.age,
    campaignsInCache: cacheStats.count,
    hasAd: ad !== null,
    adId: ad?.id ?? null,
    observerId: context.observerId ?? null,
    anonymous: !context.observerId,
  });

  return { ad };
}

/**
 * POST /api/v1/ads/impression
 * Record an ad impression
 */
async function impressionHandler(
  request: FastifyRequest<{ Body: ImpressionBody }>,
  reply: FastifyReply
): Promise<ImpressionResponse | ErrorResponse> {
  const startTime = Date.now();
  const { campaignId } = request.body;

  if (!campaignId || typeof campaignId !== 'string') {
    reply.status(400);
    return {
      error: 'Invalid request',
      code: 'INVALID_BODY',
      details: 'campaignId is required',
    };
  }

  if (!isValidUuid(campaignId)) {
    reply.status(400);
    return {
      error: 'Invalid campaign ID',
      code: 'INVALID_ID',
      details: 'campaignId must be a valid UUID',
    };
  }

  const context = buildSelectionContext(request, undefined);
  const result = await recordImpression(campaignId, context);

  const duration = Date.now() - startTime;

  if (!result) {
    request.log.warn({
      event: 'ad_impression_failed',
      duration,
      campaignId,
      reason: 'campaign_unavailable',
      observerId: context.observerId ?? null,
    });

    reply.status(404);
    return {
      error: 'Campaign not found or not active',
      code: 'CAMPAIGN_NOT_AVAILABLE',
    };
  }

  request.log.info({
    event: 'ad_impression',
    duration,
    campaignId,
    impressionId: result.impressionId,
    observerId: context.observerId ?? null,
    anonymous: !context.observerId,
  });

  reply.status(201);
  return { impressionId: result.impressionId };
}

/**
 * POST /api/v1/ads/click
 * Record an ad click
 */
async function clickHandler(
  request: FastifyRequest<{ Body: ClickBody }>,
  reply: FastifyReply
): Promise<ClickResponse | ErrorResponse> {
  const startTime = Date.now();
  const { impressionId } = request.body;
  const context = buildSelectionContext(request, undefined);

  if (!impressionId || typeof impressionId !== 'string') {
    reply.status(400);
    return {
      error: 'Invalid request',
      code: 'INVALID_BODY',
      details: 'impressionId is required',
    };
  }

  if (!isValidUuid(impressionId)) {
    reply.status(400);
    return {
      error: 'Invalid impression ID',
      code: 'INVALID_ID',
      details: 'impressionId must be a valid UUID',
    };
  }

  const success = await recordClick(impressionId);

  const duration = Date.now() - startTime;

  if (!success) {
    request.log.warn({
      event: 'ad_click_failed',
      duration,
      impressionId,
      reason: 'impression_unavailable',
      observerId: context.observerId ?? null,
    });

    reply.status(404);
    return {
      error: 'Impression not found or already clicked',
      code: 'IMPRESSION_NOT_AVAILABLE',
    };
  }

  request.log.info({
    event: 'ad_click',
    duration,
    impressionId,
    observerId: context.observerId ?? null,
    anonymous: !context.observerId,
  });

  return { success: true };
}

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

const adSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string', format: 'uuid' },
    headline: { type: 'string' },
    description: { type: 'string' },
    imageUrl: { type: ['string', 'null'] },
    linkUrl: { type: 'string' },
    brandName: { type: 'string' },
    brandCompany: { type: 'string' },
    slotType: { type: 'string', enum: ['feed', 'sidebar'] },
  },
};

const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
    details: { type: 'string' },
  },
};

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

/**
 * Register ad delivery REST routes
 */
export async function adRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply feature flag check to all routes
  fastify.addHook('onRequest', requireAdsSystem);

  // GET /api/v1/ads/next - Get next ad to display
  fastify.get<{ Querystring: NextQuerystring }>('/next', {
    config: {
      rateLimit: AD_NEXT_RATE_LIMIT,
    },
    schema: {
      querystring: {
        type: 'object',
        properties: {
          slot: { type: 'string', enum: ['feed', 'sidebar'], default: 'feed' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ad: adSchema,
          },
        },
      },
    },
    handler: nextHandler,
  });

  // POST /api/v1/ads/impression - Record an ad impression
  fastify.post<{ Body: ImpressionBody }>('/impression', {
    config: {
      rateLimit: AD_IMPRESSION_RATE_LIMIT,
    },
    schema: {
      body: {
        type: 'object',
        required: ['campaignId'],
        properties: {
          campaignId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            impressionId: { type: 'string', format: 'uuid' },
          },
        },
        400: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: impressionHandler,
  });

  // POST /api/v1/ads/click - Record an ad click
  fastify.post<{ Body: ClickBody }>('/click', {
    config: {
      rateLimit: AD_CLICK_RATE_LIMIT,
    },
    schema: {
      body: {
        type: 'object',
        required: ['impressionId'],
        properties: {
          impressionId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
        400: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: clickHandler,
  });
}
