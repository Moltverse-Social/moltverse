/**
 * Campaign Integration Tests
 *
 * Comprehensive tests covering:
 * - Validation logic
 * - Database operations
 * - HTTP handlers (via Fastify inject)
 * - Authentication (401 for unauthenticated)
 * - Authorization (403 for non-owner, personal account)
 * - Feature flag (404 when disabled)
 * - Status transitions
 * - Stats calculation
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { testPrisma } from './setup.js';
import { createTestBusinessUser, createTestAgent, createTestCampaign, buildTestApp } from './helpers/index.js';
import {
  validateCampaignCreate,
  validateCampaignUpdate,
  isValidStatusTransition,
  getAllowedTransitions,
  VALID_STATUS_TRANSITIONS,
} from '../lib/campaign-validation.js';
import { PRICING, CAMPAIGN_LIMITS } from '../lib/ads-constants.js';

// =============================================================================
// SETUP
// =============================================================================

let app: FastifyInstance;
const originalEnv = process.env.ENABLE_ADS_SYSTEM;

beforeAll(async () => {
  // Enable ads system for tests
  process.env.ENABLE_ADS_SYSTEM = 'true';
  app = await buildTestApp();
});

afterAll(async () => {
  await app.close();
  // Restore original env
  if (originalEnv !== undefined) {
    process.env.ENABLE_ADS_SYSTEM = originalEnv;
  } else {
    delete process.env.ENABLE_ADS_SYSTEM;
  }
});

beforeEach(async () => {
  // Clean up in correct order (foreign key constraints)
  await testPrisma.campaign.deleteMany();
  await testPrisma.agent.deleteMany();
  await testPrisma.user.deleteMany();
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a BUSINESS user with a claimed agent for testing
 * Returns the user, agent, and apiKey for authentication
 */
async function createBusinessAccountWithAgent() {
  const { user } = await createTestBusinessUser();
  const { agent, apiKey } = await createTestAgent(user.id, { claimed: true });
  return { user, agent, apiKey };
}

// =============================================================================
// VALIDATION TESTS
// =============================================================================

describe('Campaign Validation', () => {
  describe('validateCampaignCreate', () => {
    it('should accept valid campaign data', () => {
      const result = validateCampaignCreate({
        headline: 'Test Campaign',
        description: 'This is a valid test campaign description.',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'https://example.com/landing',
        bidAmount: 3000,
        budgetTotal: 10000,
      });

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.headline).toBe('Test Campaign');
        expect(result.data.imageUrl).toBe('https://example.com/image.png');
        expect(result.data.pricingModel).toBe('CPM');
        expect(result.data.paymentToken).toBe('USDC');
      }
    });

    it('should reject missing imageUrl', () => {
      const result = validateCampaignCreate({
        headline: 'Test Campaign',
        description: 'This is a valid test campaign description.',
        linkUrl: 'https://example.com/landing',
        bidAmount: 3000,
        budgetTotal: 10000,
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.field).toBe('imageUrl');
        expect(result.error).toContain('required');
      }
    });

    it('should reject empty body', () => {
      const result = validateCampaignCreate(null);
      expect(result.valid).toBe(false);
    });

    it('should reject headline too short', () => {
      const result = validateCampaignCreate({
        headline: 'AB',
        description: 'This is a valid description.',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'https://example.com',
        bidAmount: 3000,
        budgetTotal: 10000,
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.field).toBe('headline');
      }
    });

    it('should reject invalid linkUrl (not HTTPS)', () => {
      const result = validateCampaignCreate({
        headline: 'Valid Headline',
        description: 'This is a valid description.',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'http://example.com',
        bidAmount: 3000,
        budgetTotal: 10000,
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.field).toBe('linkUrl');
      }
    });

    it('should reject CPM bid below minimum', () => {
      const result = validateCampaignCreate({
        headline: 'Valid Headline',
        description: 'This is a valid description.',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'https://example.com',
        pricingModel: 'CPM',
        bidAmount: PRICING.MIN_CPM_BID - 1,
        budgetTotal: 10000,
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.field).toBe('bidAmount');
      }
    });

    it('should reject budget below minimum', () => {
      const result = validateCampaignCreate({
        headline: 'Valid Headline',
        description: 'This is a valid description.',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'https://example.com',
        bidAmount: 3000,
        budgetTotal: PRICING.MIN_BUDGET - 1,
      });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.field).toBe('budgetTotal');
      }
    });
  });

  describe('validateCampaignUpdate', () => {
    it('should accept partial update', () => {
      const result = validateCampaignUpdate(
        { headline: 'Updated Headline' },
        'CPM'
      );

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.headline).toBe('Updated Headline');
      }
    });

    it('should reject empty update', () => {
      const result = validateCampaignUpdate({}, 'CPM');
      expect(result.valid).toBe(false);
    });
  });
});

// =============================================================================
// STATUS TRANSITION TESTS
// =============================================================================

describe('Status Transitions', () => {
  it('should allow DRAFT -> PENDING_REVIEW', () => {
    expect(isValidStatusTransition('DRAFT', 'PENDING_REVIEW')).toBe(true);
  });

  it('should allow ACTIVE -> PAUSED', () => {
    expect(isValidStatusTransition('ACTIVE', 'PAUSED')).toBe(true);
  });

  it('should allow PAUSED -> ACTIVE', () => {
    expect(isValidStatusTransition('PAUSED', 'ACTIVE')).toBe(true);
  });

  it('should not allow DRAFT -> ACTIVE (skip review)', () => {
    expect(isValidStatusTransition('DRAFT', 'ACTIVE')).toBe(false);
  });

  it('should not allow COMPLETED -> any', () => {
    expect(isValidStatusTransition('COMPLETED', 'ACTIVE')).toBe(false);
  });
});

// =============================================================================
// HTTP HANDLER TESTS - AUTHENTICATION
// =============================================================================

describe('Campaign Endpoints - Authentication', () => {
  it('should return 401 when no API key provided (POST /)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      payload: {
        headline: 'Test',
        description: 'Test description here.',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'https://example.com',
        bidAmount: 3000,
        budgetTotal: 10000,
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('UNAUTHENTICATED');
  });

  it('should return 401 when no API key provided (GET /)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 401 when invalid API key provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: {
        authorization: 'Bearer invalid-api-key-here',
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('INVALID_AUTH_METHOD');
  });

  it('should return 403 when agent not claimed', async () => {
    // Create a BUSINESS user with an UNCLAIMED agent
    const { user } = await createTestBusinessUser();
    const { apiKey } = await createTestAgent(user.id, { claimed: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('AGENT_NOT_CLAIMED');
  });

  it('should return 403 when account is PERSONAL (not BUSINESS)', async () => {
    // Create a PERSONAL user with a claimed agent
    const personalUser = await testPrisma.user.create({
      data: {
        email: `personal-${Date.now()}@test.com`,
        name: 'Personal User',
        password: 'test123',
        accountType: 'PERSONAL',
        createdAt: new Date(),
      },
    });
    const { apiKey } = await createTestAgent(personalUser.id, { claimed: true });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('BUSINESS_ACCOUNT_REQUIRED');
  });
});

// =============================================================================
// HTTP HANDLER TESTS - CRUD
// =============================================================================

describe('Campaign Endpoints - CRUD', () => {
  it('should create campaign (POST /)', async () => {
    const { apiKey } = await createBusinessAccountWithAgent();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      payload: {
        headline: 'Test Campaign',
        description: 'This is a test campaign description.',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'https://example.com/landing',
        bidAmount: 3000,
        budgetTotal: 10000,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.campaign).toBeDefined();
    expect(body.campaign.headline).toBe('Test Campaign');
    expect(body.campaign.imageUrl).toBe('https://example.com/image.png');
    expect(body.campaign.status).toBe('DRAFT');
  });

  it('should list campaigns (GET /)', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();

    await createTestCampaign(user.id, { headline: 'Campaign 1' });
    await createTestCampaign(user.id, { headline: 'Campaign 2' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.campaigns).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it('should filter campaigns by status (GET /?status=DRAFT)', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();

    await createTestCampaign(user.id, { status: 'DRAFT' });
    await createTestCampaign(user.id, { status: 'DRAFT' });
    await createTestCampaign(user.id, { status: 'ACTIVE' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns?status=DRAFT',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.campaigns).toHaveLength(2);
    expect(body.campaigns.every((c: any) => c.status === 'DRAFT')).toBe(true);
  });

  it('should get campaign by ID (GET /:id)', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaign.id}`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.campaign.id).toBe(campaign.id);
  });

  it('should return 404 for non-existent campaign', async () => {
    const { apiKey } = await createBusinessAccountWithAgent();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns/00000000-0000-0000-0000-000000000000',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(404);
  });

  it('should update campaign (PATCH /:id)', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'DRAFT' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaign.id}`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      payload: {
        headline: 'Updated Headline',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.campaign.headline).toBe('Updated Headline');
  });

  it('should reject update for non-DRAFT campaign', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'ACTIVE' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaign.id}`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      payload: {
        headline: 'Updated Headline',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('INVALID_STATUS');
  });

  it('should delete campaign (DELETE /:id)', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'DRAFT' });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${campaign.id}`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);

    // Verify deleted
    const deleted = await testPrisma.campaign.findUnique({
      where: { id: campaign.id },
    });
    expect(deleted).toBeNull();
  });

  it('should reject delete for non-DRAFT campaign', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'ACTIVE' });

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${campaign.id}`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('INVALID_STATUS');
  });
});

// =============================================================================
// HTTP HANDLER TESTS - AUTHORIZATION (403)
// =============================================================================

describe('Campaign Endpoints - Authorization', () => {
  it('should return 403 when accessing another advertiser\'s campaign', async () => {
    const { user: user1 } = await createBusinessAccountWithAgent();
    const { apiKey: apiKey2 } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user1.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaign.id}`,
      headers: {
        authorization: `Bearer ${apiKey2}`,
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('FORBIDDEN');
  });

  it('should return 403 when updating another advertiser\'s campaign', async () => {
    const { user: user1 } = await createBusinessAccountWithAgent();
    const { apiKey: apiKey2 } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user1.id);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaign.id}`,
      headers: {
        authorization: `Bearer ${apiKey2}`,
      },
      payload: {
        headline: 'Hacked Headline',
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should return 403 when deleting another advertiser\'s campaign', async () => {
    const { user: user1 } = await createBusinessAccountWithAgent();
    const { apiKey: apiKey2 } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user1.id);

    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${campaign.id}`,
      headers: {
        authorization: `Bearer ${apiKey2}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it('should not list other advertiser\'s campaigns', async () => {
    const { user: user1 } = await createBusinessAccountWithAgent();
    const { apiKey: apiKey2 } = await createBusinessAccountWithAgent();

    await createTestCampaign(user1.id, { headline: 'User 1 Campaign' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns',
      headers: {
        authorization: `Bearer ${apiKey2}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.campaigns).toHaveLength(0);
    expect(body.total).toBe(0);
  });
});

// =============================================================================
// HTTP HANDLER TESTS - STATUS TRANSITIONS
// =============================================================================

describe('Campaign Endpoints - Status Transitions', () => {
  it('should submit campaign for review (POST /:id/submit)', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'DRAFT' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaign.id}/submit`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.campaign.status).toBe('PENDING_REVIEW');
  });

  it('should reject submit for non-DRAFT campaign', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'ACTIVE' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaign.id}/submit`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('INVALID_TRANSITION');
  });

  it('should pause campaign (POST /:id/pause)', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'ACTIVE' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaign.id}/pause`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.campaign.status).toBe('PAUSED');
  });

  it('should reject pause for non-ACTIVE campaign', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'DRAFT' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaign.id}/pause`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('INVALID_TRANSITION');
  });

  it('should resume campaign (POST /:id/resume)', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'PAUSED' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaign.id}/resume`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.campaign.status).toBe('ACTIVE');
  });

  it('should reject resume for non-PAUSED campaign', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, { status: 'DRAFT' });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaign.id}/resume`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.code).toBe('INVALID_TRANSITION');
  });
});

// =============================================================================
// HTTP HANDLER TESTS - STATS
// =============================================================================

describe('Campaign Endpoints - Stats', () => {
  it('should return campaign stats (GET /:id/stats)', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, {
      impressions: 10000,
      clicks: 250,
      budgetTotal: 100000,
      budgetSpent: 25000,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaign.id}/stats`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.impressions).toBe(10000);
    expect(body.clicks).toBe(250);
    expect(body.ctr).toBe(2.5);
    expect(body.budgetTotal).toBe(100000);
    expect(body.budgetSpent).toBe(25000);
    expect(body.budgetRemaining).toBe(75000);
    expect(body.budgetUtilization).toBe(25);
  });

  it('should handle zero impressions in CTR calculation', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id, {
      impressions: 0,
      clicks: 0,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaign.id}/stats`,
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ctr).toBe(0);
  });

  it('should return 403 for stats of another advertiser\'s campaign', async () => {
    const { user: user1 } = await createBusinessAccountWithAgent();
    const { apiKey: apiKey2 } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user1.id);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaign.id}/stats`,
      headers: {
        authorization: `Bearer ${apiKey2}`,
      },
    });

    expect(response.statusCode).toBe(403);
  });
});

// =============================================================================
// HTTP HANDLER TESTS - VALIDATION ERRORS
// =============================================================================

describe('Campaign Endpoints - Validation Errors', () => {
  it('should return 400 for invalid campaign data', async () => {
    const { apiKey } = await createBusinessAccountWithAgent();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      payload: {
        headline: 'AB', // Too short
        description: 'Valid description here.',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'https://example.com',
        bidAmount: 3000,
        budgetTotal: 10000,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    // Fastify schema validation returns FST_ERR_VALIDATION
    expect(['VALIDATION_ERROR', 'FST_ERR_VALIDATION']).toContain(body.code);
  });

  it('should return 400 for invalid UUID', async () => {
    const { apiKey } = await createBusinessAccountWithAgent();

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns/not-a-uuid',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    // Fastify schema validation returns FST_ERR_VALIDATION
    expect(['INVALID_ID', 'FST_ERR_VALIDATION']).toContain(body.code);
  });
});

// =============================================================================
// FEATURE FLAG TESTS
// =============================================================================

describe('Feature Flag', () => {
  it('should return 404 when ads system is disabled', async () => {
    // Create a separate app with ads disabled
    const originalValue = process.env.ENABLE_ADS_SYSTEM;
    process.env.ENABLE_ADS_SYSTEM = 'false';

    const disabledApp = await buildTestApp();

    try {
      const response = await disabledApp.inject({
        method: 'GET',
        url: '/api/v1/campaigns',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('ADS_SYSTEM_DISABLED');
    } finally {
      await disabledApp.close();
      // Restore
      if (originalValue !== undefined) {
        process.env.ENABLE_ADS_SYSTEM = originalValue;
      } else {
        delete process.env.ENABLE_ADS_SYSTEM;
      }
    }
  });
});

// =============================================================================
// DATABASE INTEGRATION TESTS
// =============================================================================

describe('Campaign Database Operations', () => {
  it('should create campaign in database', async () => {
    const { user } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id);

    expect(campaign.id).toBeDefined();
    expect(campaign.advertiserId).toBe(user.id);
    expect(campaign.status).toBe('DRAFT');
  });

  it('should cascade delete campaigns when user is deleted', async () => {
    const { user } = await createBusinessAccountWithAgent();
    const campaign = await createTestCampaign(user.id);

    // Need to delete agent first due to foreign key constraint
    await testPrisma.agent.deleteMany({ where: { userId: user.id } });
    await testPrisma.user.delete({
      where: { id: user.id },
    });

    const found = await testPrisma.campaign.findUnique({
      where: { id: campaign.id },
    });

    expect(found).toBeNull();
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('Edge Cases', () => {
  it('should handle all payment tokens', async () => {
    const { apiKey } = await createBusinessAccountWithAgent();

    const tokens = ['MOLTVERSE', 'PUMP', 'SOL', 'USDC'];

    for (const paymentToken of tokens) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
        payload: {
          headline: `Campaign with ${paymentToken}`,
          description: 'Valid description for this campaign.',
          imageUrl: 'https://example.com/image.png',
          linkUrl: 'https://example.com',
          bidAmount: 3000,
          budgetTotal: 10000,
          paymentToken,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.campaign.paymentToken).toBe(paymentToken);
    }
  });

  it('should handle pagination', async () => {
    const { user, apiKey } = await createBusinessAccountWithAgent();

    // Create 5 campaigns
    for (let i = 0; i < 5; i++) {
      await createTestCampaign(user.id, { headline: `Campaign ${i}` });
    }

    // Request with limit
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/campaigns?limit=2&offset=0',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.campaigns).toHaveLength(2);
    expect(body.total).toBe(5);
  });

  it('should trim whitespace from fields', async () => {
    const { apiKey } = await createBusinessAccountWithAgent();

    // Note: linkUrl and imageUrl cannot have whitespace as they're validated as URLs
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      payload: {
        headline: '  Trimmed Headline  ',
        description: '  Trimmed description here.  ',
        imageUrl: 'https://example.com/image.png',
        linkUrl: 'https://example.com',
        bidAmount: 3000,
        budgetTotal: 10000,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.campaign.headline).toBe('Trimmed Headline');
    expect(body.campaign.description).toBe('Trimmed description here.');
    expect(body.campaign.imageUrl).toBe('https://example.com/image.png');
    expect(body.campaign.linkUrl).toBe('https://example.com');
  });
});
