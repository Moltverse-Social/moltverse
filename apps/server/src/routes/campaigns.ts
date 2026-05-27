/**
 * Campaign REST Routes
 *
 * CRUD operations for advertising campaigns.
 * All routes require brand authentication.
 *
 * Endpoints:
 * - POST   /               Create campaign (DRAFT)
 * - GET    /               List brand's campaigns
 * - GET    /:id            Get campaign by ID
 * - PATCH  /:id            Update campaign (DRAFT only)
 * - DELETE /:id            Delete campaign (DRAFT only)
 * - POST   /:id/submit     Submit for review (DRAFT → PENDING_REVIEW)
 * - POST   /:id/pause      Pause campaign (ACTIVE → PAUSED)
 * - POST   /:id/resume     Resume campaign (PAUSED → ACTIVE)
 * - GET    /:id/stats      Get campaign statistics
 *
 * @module routes/campaigns
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// Import to ensure rate-limit type declarations are loaded
import '@fastify/rate-limit';
import { prisma } from '../lib/prisma.js';
import { requireBusinessAgentAuth } from '../lib/agent-guards.js';
import {
  validateCampaignCreate,
  validateCampaignUpdate,
  isValidStatusTransition,
  CampaignCreateInput,
  CampaignUpdateInput,
} from '../lib/campaign-validation.js';
import { isAdsSystemEnabled, ADS_RATE_LIMITS } from '../lib/ads-constants.js';
import type { Campaign, CampaignStatus, PricingModel, PaymentToken, AdSlotType } from '@prisma/client';

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

const CREATE_RATE_LIMIT = {
  max: ADS_RATE_LIMITS.CAMPAIGN_CREATE.max,
  timeWindow: ADS_RATE_LIMITS.CAMPAIGN_CREATE.timeWindow,
  keyGenerator: (request: FastifyRequest) => {
    return `advertiser:${request.agentUserId ?? request.ip}`;
  },
  errorResponseBuilder: (
    _request: FastifyRequest,
    context: { max: number; ttl: number }
  ) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Campaign creation rate limit exceeded. Maximum ${context.max} per minute.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

const UPDATE_RATE_LIMIT = {
  max: ADS_RATE_LIMITS.CAMPAIGN_UPDATE.max,
  timeWindow: ADS_RATE_LIMITS.CAMPAIGN_UPDATE.timeWindow,
  keyGenerator: (request: FastifyRequest) => {
    return `advertiser:${request.agentUserId ?? request.ip}`;
  },
  errorResponseBuilder: (
    _request: FastifyRequest,
    context: { max: number; ttl: number }
  ) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

// =============================================================================
// TYPES
// =============================================================================

interface CampaignResponse {
  id: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string;
  status: CampaignStatus;
  pricingModel: PricingModel;
  slotType: AdSlotType;
  bidAmount: number;
  budgetTotal: number;
  budgetSpent: number;
  paymentToken: PaymentToken;
  paymentTxHash: string | null;
  startDate: string | null;
  endDate: string | null;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
}

interface CampaignListResponse {
  campaigns: CampaignResponse[];
  total: number;
}

interface CampaignStatsResponse {
  id: string;
  impressions: number;
  clicks: number;
  ctr: number;
  budgetTotal: number;
  budgetSpent: number;
  budgetRemaining: number;
  budgetUtilization: number;
}

interface ErrorResponse {
  error: string;
  code: string;
  details?: string | undefined;
  field?: string | undefined;
}

interface IdParams {
  id: string;
}

interface ListQuery {
  status?: string;
  limit?: string;
  offset?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatCampaignResponse(campaign: Campaign): CampaignResponse {
  return {
    id: campaign.id,
    headline: campaign.headline,
    description: campaign.description,
    imageUrl: campaign.imageUrl,
    linkUrl: campaign.linkUrl,
    status: campaign.status,
    pricingModel: campaign.pricingModel,
    slotType: campaign.slotType,
    bidAmount: campaign.bidAmount,
    budgetTotal: campaign.budgetTotal,
    budgetSpent: campaign.budgetSpent,
    paymentToken: campaign.paymentToken,
    paymentTxHash: campaign.paymentTxHash,
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
    impressions: campaign.impressions,
    clicks: campaign.clicks,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * POST /api/v1/campaigns
 * Create a new campaign
 */
async function createHandler(
  request: FastifyRequest<{ Body: CampaignCreateInput }>,
  reply: FastifyReply
): Promise<{ campaign: CampaignResponse } | ErrorResponse> {
  const advertiserId = request.agentUserId!;

  const validation = validateCampaignCreate(request.body);

  if (!validation.valid) {
    reply.status(400);
    return {
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: validation.error,
      field: validation.field,
    };
  }

  const data = validation.data;

  try {
    const campaign = await prisma.campaign.create({
      data: {
        advertiserId,
        headline: data.headline,
        description: data.description,
        imageUrl: data.imageUrl ?? null,
        linkUrl: data.linkUrl,
        status: 'DRAFT',
        pricingModel: data.pricingModel ?? 'CPM',
        slotType: data.slotType ?? 'FEED',
        bidAmount: data.bidAmount,
        budgetTotal: data.budgetTotal,
        paymentToken: data.paymentToken ?? 'USDC',
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
      },
    });

    reply.status(201);
    return { campaign: formatCampaignResponse(campaign) };
  } catch (error) {
    request.log.error(error, 'Failed to create campaign');
    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * GET /api/v1/campaigns
 * List brand's campaigns
 */
async function listHandler(
  request: FastifyRequest<{ Querystring: ListQuery }>,
  reply: FastifyReply
): Promise<CampaignListResponse | ErrorResponse> {
  const advertiserId = request.agentUserId!;
  const { status, limit: limitStr, offset: offsetStr } = request.query;

  // Parse pagination
  const limit = Math.min(Math.max(parseInt(limitStr ?? '20', 10) || 20, 1), 100);
  const offset = Math.max(parseInt(offsetStr ?? '0', 10) || 0, 0);

  // Build filter
  const where: { advertiserId: string; status?: CampaignStatus } = { advertiserId };

  if (status && ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED'].includes(status)) {
    where.status = status as CampaignStatus;
  }

  try {
    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.campaign.count({ where }),
    ]);

    return {
      campaigns: campaigns.map(formatCampaignResponse),
      total,
    };
  } catch (error) {
    request.log.error(error, 'Failed to list campaigns');
    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * GET /api/v1/campaigns/:id
 * Get campaign by ID
 */
async function getHandler(
  request: FastifyRequest<{ Params: IdParams }>,
  reply: FastifyReply
): Promise<{ campaign: CampaignResponse } | ErrorResponse> {
  const advertiserId = request.agentUserId!;
  const { id } = request.params;

  if (!isValidUuid(id)) {
    reply.status(400);
    return {
      error: 'Invalid campaign ID',
      code: 'INVALID_ID',
    };
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      reply.status(404);
      return {
        error: 'Campaign not found',
        code: 'NOT_FOUND',
      };
    }

    // Check ownership
    if (campaign.advertiserId !== advertiserId) {
      reply.status(403);
      return {
        error: 'Access denied',
        code: 'FORBIDDEN',
        details: 'You do not own this campaign',
      };
    }

    return { campaign: formatCampaignResponse(campaign) };
  } catch (error) {
    request.log.error(error, 'Failed to get campaign');
    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * PATCH /api/v1/campaigns/:id
 * Update campaign (DRAFT only)
 */
async function updateHandler(
  request: FastifyRequest<{ Params: IdParams; Body: CampaignUpdateInput }>,
  reply: FastifyReply
): Promise<{ campaign: CampaignResponse } | ErrorResponse> {
  const advertiserId = request.agentUserId!;
  const { id } = request.params;

  if (!isValidUuid(id)) {
    reply.status(400);
    return {
      error: 'Invalid campaign ID',
      code: 'INVALID_ID',
    };
  }

  try {
    // Find campaign and check ownership
    const existing = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!existing) {
      reply.status(404);
      return {
        error: 'Campaign not found',
        code: 'NOT_FOUND',
      };
    }

    if (existing.advertiserId !== advertiserId) {
      reply.status(403);
      return {
        error: 'Access denied',
        code: 'FORBIDDEN',
        details: 'You do not own this campaign',
      };
    }

    // Only DRAFT campaigns can be updated
    if (existing.status !== 'DRAFT') {
      reply.status(400);
      return {
        error: 'Campaign cannot be updated',
        code: 'INVALID_STATUS',
        details: `Only DRAFT campaigns can be updated. Current status: ${existing.status}`,
      };
    }

    // Validate update input
    const validation = validateCampaignUpdate(request.body, existing.pricingModel);

    if (!validation.valid) {
      reply.status(400);
      return {
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: validation.error,
        field: validation.field,
      };
    }

    // Update campaign
    const campaign = await prisma.campaign.update({
      where: { id },
      data: validation.data,
    });

    return { campaign: formatCampaignResponse(campaign) };
  } catch (error) {
    request.log.error(error, 'Failed to update campaign');
    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * DELETE /api/v1/campaigns/:id
 * Delete campaign (DRAFT only)
 */
async function deleteHandler(
  request: FastifyRequest<{ Params: IdParams }>,
  reply: FastifyReply
): Promise<{ success: boolean } | ErrorResponse> {
  const advertiserId = request.agentUserId!;
  const { id } = request.params;

  if (!isValidUuid(id)) {
    reply.status(400);
    return {
      error: 'Invalid campaign ID',
      code: 'INVALID_ID',
    };
  }

  try {
    // Find campaign and check ownership
    const existing = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!existing) {
      reply.status(404);
      return {
        error: 'Campaign not found',
        code: 'NOT_FOUND',
      };
    }

    if (existing.advertiserId !== advertiserId) {
      reply.status(403);
      return {
        error: 'Access denied',
        code: 'FORBIDDEN',
        details: 'You do not own this campaign',
      };
    }

    // Only DRAFT campaigns can be deleted
    if (existing.status !== 'DRAFT') {
      reply.status(400);
      return {
        error: 'Campaign cannot be deleted',
        code: 'INVALID_STATUS',
        details: `Only DRAFT campaigns can be deleted. Current status: ${existing.status}`,
      };
    }

    await prisma.campaign.delete({
      where: { id },
    });

    return { success: true };
  } catch (error) {
    request.log.error(error, 'Failed to delete campaign');
    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * POST /api/v1/campaigns/:id/submit
 * Submit campaign for review (DRAFT → PENDING_REVIEW)
 */
async function submitHandler(
  request: FastifyRequest<{ Params: IdParams }>,
  reply: FastifyReply
): Promise<{ campaign: CampaignResponse } | ErrorResponse> {
  const advertiserId = request.agentUserId!;
  const { id } = request.params;

  if (!isValidUuid(id)) {
    reply.status(400);
    return {
      error: 'Invalid campaign ID',
      code: 'INVALID_ID',
    };
  }

  try {
    const existing = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!existing) {
      reply.status(404);
      return {
        error: 'Campaign not found',
        code: 'NOT_FOUND',
      };
    }

    if (existing.advertiserId !== advertiserId) {
      reply.status(403);
      return {
        error: 'Access denied',
        code: 'FORBIDDEN',
        details: 'You do not own this campaign',
      };
    }

    // Check valid transition
    if (!isValidStatusTransition(existing.status, 'PENDING_REVIEW')) {
      reply.status(400);
      return {
        error: 'Invalid status transition',
        code: 'INVALID_TRANSITION',
        details: `Cannot submit campaign from ${existing.status} status`,
      };
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status: 'PENDING_REVIEW' },
    });

    return { campaign: formatCampaignResponse(campaign) };
  } catch (error) {
    request.log.error(error, 'Failed to submit campaign');
    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * POST /api/v1/campaigns/:id/pause
 * Pause campaign (ACTIVE → PAUSED)
 */
async function pauseHandler(
  request: FastifyRequest<{ Params: IdParams }>,
  reply: FastifyReply
): Promise<{ campaign: CampaignResponse } | ErrorResponse> {
  const advertiserId = request.agentUserId!;
  const { id } = request.params;

  if (!isValidUuid(id)) {
    reply.status(400);
    return {
      error: 'Invalid campaign ID',
      code: 'INVALID_ID',
    };
  }

  try {
    const existing = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!existing) {
      reply.status(404);
      return {
        error: 'Campaign not found',
        code: 'NOT_FOUND',
      };
    }

    if (existing.advertiserId !== advertiserId) {
      reply.status(403);
      return {
        error: 'Access denied',
        code: 'FORBIDDEN',
        details: 'You do not own this campaign',
      };
    }

    // Check valid transition
    if (!isValidStatusTransition(existing.status, 'PAUSED')) {
      reply.status(400);
      return {
        error: 'Invalid status transition',
        code: 'INVALID_TRANSITION',
        details: `Cannot pause campaign from ${existing.status} status`,
      };
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });

    return { campaign: formatCampaignResponse(campaign) };
  } catch (error) {
    request.log.error(error, 'Failed to pause campaign');
    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * POST /api/v1/campaigns/:id/resume
 * Resume campaign (PAUSED → ACTIVE)
 */
async function resumeHandler(
  request: FastifyRequest<{ Params: IdParams }>,
  reply: FastifyReply
): Promise<{ campaign: CampaignResponse } | ErrorResponse> {
  const advertiserId = request.agentUserId!;
  const { id } = request.params;

  if (!isValidUuid(id)) {
    reply.status(400);
    return {
      error: 'Invalid campaign ID',
      code: 'INVALID_ID',
    };
  }

  try {
    const existing = await prisma.campaign.findUnique({
      where: { id },
    });

    if (!existing) {
      reply.status(404);
      return {
        error: 'Campaign not found',
        code: 'NOT_FOUND',
      };
    }

    if (existing.advertiserId !== advertiserId) {
      reply.status(403);
      return {
        error: 'Access denied',
        code: 'FORBIDDEN',
        details: 'You do not own this campaign',
      };
    }

    // Check valid transition
    if (!isValidStatusTransition(existing.status, 'ACTIVE')) {
      reply.status(400);
      return {
        error: 'Invalid status transition',
        code: 'INVALID_TRANSITION',
        details: `Cannot resume campaign from ${existing.status} status`,
      };
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status: 'ACTIVE' },
    });

    return { campaign: formatCampaignResponse(campaign) };
  } catch (error) {
    request.log.error(error, 'Failed to resume campaign');
    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

/**
 * GET /api/v1/campaigns/:id/stats
 * Get campaign statistics
 */
async function statsHandler(
  request: FastifyRequest<{ Params: IdParams }>,
  reply: FastifyReply
): Promise<CampaignStatsResponse | ErrorResponse> {
  const advertiserId = request.agentUserId!;
  const { id } = request.params;

  if (!isValidUuid(id)) {
    reply.status(400);
    return {
      error: 'Invalid campaign ID',
      code: 'INVALID_ID',
    };
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        advertiserId: true,
        impressions: true,
        clicks: true,
        budgetTotal: true,
        budgetSpent: true,
      },
    });

    if (!campaign) {
      reply.status(404);
      return {
        error: 'Campaign not found',
        code: 'NOT_FOUND',
      };
    }

    if (campaign.advertiserId !== advertiserId) {
      reply.status(403);
      return {
        error: 'Access denied',
        code: 'FORBIDDEN',
        details: 'You do not own this campaign',
      };
    }

    // Calculate CTR (click-through rate)
    const ctr = campaign.impressions > 0
      ? (campaign.clicks / campaign.impressions) * 100
      : 0;

    // Calculate budget metrics
    const budgetRemaining = campaign.budgetTotal - campaign.budgetSpent;
    const budgetUtilization = campaign.budgetTotal > 0
      ? (campaign.budgetSpent / campaign.budgetTotal) * 100
      : 0;

    return {
      id: campaign.id,
      impressions: campaign.impressions,
      clicks: campaign.clicks,
      ctr: Math.round(ctr * 100) / 100, // 2 decimal places
      budgetTotal: campaign.budgetTotal,
      budgetSpent: campaign.budgetSpent,
      budgetRemaining,
      budgetUtilization: Math.round(budgetUtilization * 100) / 100,
    };
  } catch (error) {
    request.log.error(error, 'Failed to get campaign stats');
    reply.status(500);
    return {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    };
  }
}

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

const campaignResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    headline: { type: 'string' },
    description: { type: 'string' },
    imageUrl: { type: ['string', 'null'] },
    linkUrl: { type: 'string' },
    status: { type: 'string', enum: ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED'] },
    pricingModel: { type: 'string', enum: ['CPM', 'CPC'] },
    bidAmount: { type: 'number' },
    budgetTotal: { type: 'number' },
    budgetSpent: { type: 'number' },
    paymentToken: { type: 'string', enum: ['MOLTVERSE', 'PUMP', 'SOL', 'USDC'] },
    paymentTxHash: { type: ['string', 'null'] },
    startDate: { type: ['string', 'null'] },
    endDate: { type: ['string', 'null'] },
    impressions: { type: 'number' },
    clicks: { type: 'number' },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
  },
};

const errorResponseSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    code: { type: 'string' },
    details: { type: 'string' },
    field: { type: 'string' },
  },
};

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

/**
 * Register campaign REST routes
 */
export async function campaignRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply feature flag check to all routes
  fastify.addHook('onRequest', requireAdsSystem);

  // Apply agent auth with business account check to all routes
  fastify.addHook('preHandler', requireBusinessAgentAuth);

  // POST /api/v1/campaigns - Create a new campaign
  fastify.post('/', {
    config: {
      rateLimit: CREATE_RATE_LIMIT,
    },
    schema: {
      body: {
        type: 'object',
        required: ['headline', 'description', 'linkUrl', 'bidAmount', 'budgetTotal'],
        properties: {
          headline: { type: 'string', minLength: 3, maxLength: 100 },
          description: { type: 'string', minLength: 10, maxLength: 300 },
          imageUrl: { type: 'string', maxLength: 500 },
          linkUrl: { type: 'string', maxLength: 500 },
          pricingModel: { type: 'string', enum: ['CPM', 'CPC'] },
          bidAmount: { type: 'integer', minimum: 100 },
          budgetTotal: { type: 'integer', minimum: 5000 },
          paymentToken: { type: 'string', enum: ['MOLTVERSE', 'PUMP', 'SOL', 'USDC'] },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            campaign: campaignResponseSchema,
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
      },
    },
    handler: createHandler,
  });

  // GET /api/v1/campaigns - List brand campaigns
  fastify.get('/', {
    config: {
      rateLimit: UPDATE_RATE_LIMIT,
    },
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'COMPLETED', 'REJECTED'] },
          limit: { type: 'string' },
          offset: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            campaigns: { type: 'array', items: campaignResponseSchema },
            total: { type: 'number' },
          },
        },
        401: errorResponseSchema,
      },
    },
    handler: listHandler,
  });

  // GET /api/v1/campaigns/:id - Get campaign by ID
  fastify.get<{ Params: IdParams }>('/:id', {
    config: {
      rateLimit: UPDATE_RATE_LIMIT,
    },
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            campaign: campaignResponseSchema,
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: getHandler,
  });

  // PATCH /api/v1/campaigns/:id - Update campaign (DRAFT only)
  fastify.patch<{ Params: IdParams; Body: CampaignUpdateInput }>('/:id', {
    config: {
      rateLimit: UPDATE_RATE_LIMIT,
    },
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      body: {
        type: 'object',
        properties: {
          headline: { type: 'string', minLength: 3, maxLength: 100 },
          description: { type: 'string', minLength: 10, maxLength: 300 },
          imageUrl: { type: ['string', 'null'], maxLength: 500 },
          linkUrl: { type: 'string', maxLength: 500 },
          pricingModel: { type: 'string', enum: ['CPM', 'CPC'] },
          bidAmount: { type: 'integer', minimum: 100 },
          budgetTotal: { type: 'integer', minimum: 5000 },
          paymentToken: { type: 'string', enum: ['MOLTVERSE', 'PUMP', 'SOL', 'USDC'] },
          startDate: { type: ['string', 'null'], format: 'date-time' },
          endDate: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            campaign: campaignResponseSchema,
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: updateHandler,
  });

  // DELETE /api/v1/campaigns/:id - Delete campaign (DRAFT only)
  fastify.delete<{ Params: IdParams }>('/:id', {
    config: {
      rateLimit: UPDATE_RATE_LIMIT,
    },
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
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
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: deleteHandler,
  });

  // POST /api/v1/campaigns/:id/submit - Submit campaign for review
  fastify.post<{ Params: IdParams }>('/:id/submit', {
    config: {
      rateLimit: UPDATE_RATE_LIMIT,
    },
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            campaign: campaignResponseSchema,
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: submitHandler,
  });

  // POST /api/v1/campaigns/:id/pause - Pause campaign
  fastify.post<{ Params: IdParams }>('/:id/pause', {
    config: {
      rateLimit: UPDATE_RATE_LIMIT,
    },
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            campaign: campaignResponseSchema,
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: pauseHandler,
  });

  // POST /api/v1/campaigns/:id/resume - Resume campaign
  fastify.post<{ Params: IdParams }>('/:id/resume', {
    config: {
      rateLimit: UPDATE_RATE_LIMIT,
    },
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            campaign: campaignResponseSchema,
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: resumeHandler,
  });

  // GET /api/v1/campaigns/:id/stats - Get campaign statistics
  fastify.get<{ Params: IdParams }>('/:id/stats', {
    config: {
      rateLimit: UPDATE_RATE_LIMIT,
    },
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            impressions: { type: 'number' },
            clicks: { type: 'number' },
            ctr: { type: 'number' },
            budgetTotal: { type: 'number' },
            budgetSpent: { type: 'number' },
            budgetRemaining: { type: 'number' },
            budgetUtilization: { type: 'number' },
          },
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
      },
    },
    handler: statsHandler,
  });
}
