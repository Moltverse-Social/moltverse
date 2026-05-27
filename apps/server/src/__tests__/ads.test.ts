/**
 * Ad Delivery System Tests
 *
 * Comprehensive tests for the ad delivery system:
 * - Unit tests for lib/ads.ts
 * - HTTP integration tests via Fastify inject
 * - Feature flag tests
 * - Edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testPrisma } from './setup.js';
import {
  createTestBrand,
  createTestCampaign,
} from './helpers/db.js';
import { buildTestApp, buildTestAppWithAdsDisabled } from './helpers/app.js';
import {
  hashIpForCapping,
  isCampaignEligible,
  getRemainingBudget,
  getEstimatedImpressionsRemaining,
  getEstimatedClicksRemaining,
  getCacheStats,
  invalidateCampaignCache,
  __testExports,
} from '../lib/ads.js';

// =============================================================================
// UNIT TESTS - lib/ads.ts
// =============================================================================

describe('Ad Delivery - Unit Tests', () => {
  describe('hashIpForCapping', () => {
    it('should return a 16-character hash', () => {
      const hash = hashIpForCapping('192.168.1.1');
      expect(hash).toHaveLength(16);
    });

    it('should return consistent hash for same IP', () => {
      const hash1 = hashIpForCapping('192.168.1.1');
      const hash2 = hashIpForCapping('192.168.1.1');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different IPs', () => {
      const hash1 = hashIpForCapping('192.168.1.1');
      const hash2 = hashIpForCapping('192.168.1.2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle IPv6 addresses', () => {
      const hash = hashIpForCapping('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(hash).toHaveLength(16);
    });
  });

  describe('isCampaignEligible', () => {
    it('should return true for active campaign with budget', () => {
      const eligible = isCampaignEligible({
        status: 'ACTIVE',
        budgetSpent: 5000,
        budgetTotal: 10000,
        startDate: null,
        endDate: null,
      });
      expect(eligible).toBe(true);
    });

    it('should return false for non-active campaign', () => {
      const eligible = isCampaignEligible({
        status: 'DRAFT',
        budgetSpent: 0,
        budgetTotal: 10000,
        startDate: null,
        endDate: null,
      });
      expect(eligible).toBe(false);
    });

    it('should return false for campaign with exhausted budget', () => {
      const eligible = isCampaignEligible({
        status: 'ACTIVE',
        budgetSpent: 10000,
        budgetTotal: 10000,
        startDate: null,
        endDate: null,
      });
      expect(eligible).toBe(false);
    });

    it('should return false for campaign not yet started', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const eligible = isCampaignEligible({
        status: 'ACTIVE',
        budgetSpent: 0,
        budgetTotal: 10000,
        startDate: futureDate,
        endDate: null,
      });
      expect(eligible).toBe(false);
    });

    it('should return false for campaign that has ended', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const eligible = isCampaignEligible({
        status: 'ACTIVE',
        budgetSpent: 0,
        budgetTotal: 10000,
        startDate: null,
        endDate: pastDate,
      });
      expect(eligible).toBe(false);
    });

    it('should return true for campaign within date range', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const eligible = isCampaignEligible({
        status: 'ACTIVE',
        budgetSpent: 0,
        budgetTotal: 10000,
        startDate: pastDate,
        endDate: futureDate,
      });
      expect(eligible).toBe(true);
    });
  });

  describe('getRemainingBudget', () => {
    it('should calculate remaining budget correctly', () => {
      const remaining = getRemainingBudget({
        budgetTotal: 10000,
        budgetSpent: 3000,
      });
      expect(remaining).toBe(7000);
    });

    it('should return 0 when budget exhausted', () => {
      const remaining = getRemainingBudget({
        budgetTotal: 10000,
        budgetSpent: 10000,
      });
      expect(remaining).toBe(0);
    });

    it('should return 0 when overspent', () => {
      const remaining = getRemainingBudget({
        budgetTotal: 10000,
        budgetSpent: 15000,
      });
      expect(remaining).toBe(0);
    });
  });

  describe('getEstimatedImpressionsRemaining', () => {
    it('should calculate impressions for CPM campaign', () => {
      const remaining = getEstimatedImpressionsRemaining({
        pricingModel: 'CPM',
        bidAmount: 3000, // $30 per 1000 impressions
        budgetTotal: 10000, // $100
        budgetSpent: 0,
      });
      // $100 / $30 * 1000 = 3333 impressions
      expect(remaining).toBe(3333);
    });

    it('should return 0 for CPC campaign', () => {
      const remaining = getEstimatedImpressionsRemaining({
        pricingModel: 'CPC',
        bidAmount: 300,
        budgetTotal: 10000,
        budgetSpent: 0,
      });
      expect(remaining).toBe(0);
    });
  });

  describe('getEstimatedClicksRemaining', () => {
    it('should calculate clicks for CPC campaign', () => {
      const remaining = getEstimatedClicksRemaining({
        pricingModel: 'CPC',
        bidAmount: 300, // $3 per click
        budgetTotal: 10000, // $100
        budgetSpent: 0,
      });
      // $100 / $3 = 33 clicks
      expect(remaining).toBe(33);
    });

    it('should return 0 for CPM campaign', () => {
      const remaining = getEstimatedClicksRemaining({
        pricingModel: 'CPM',
        bidAmount: 3000,
        budgetTotal: 10000,
        budgetSpent: 0,
      });
      expect(remaining).toBe(0);
    });
  });

  describe('weightedRandomSelect', () => {
    const { weightedRandomSelect } = __testExports;

    it('should select from campaigns', () => {
      const campaigns = [
        { id: '1', bidAmount: 1000 },
        { id: '2', bidAmount: 2000 },
        { id: '3', bidAmount: 3000 },
      ];

      const selected = weightedRandomSelect(campaigns);
      expect(['1', '2', '3']).toContain(selected.id);
    });

    it('should favor higher bids statistically', () => {
      const campaigns = [
        { id: 'low', bidAmount: 100 },
        { id: 'high', bidAmount: 10000 },
      ];

      const counts: Record<string, number> = { low: 0, high: 0 };
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        const selected = weightedRandomSelect(campaigns);
        counts[selected.id]++;
      }

      // High bid should be selected much more often
      expect(counts.high).toBeGreaterThan(counts.low * 5);
    });

    it('should handle single campaign', () => {
      const campaigns = [{ id: 'only', bidAmount: 1000 }];
      const selected = weightedRandomSelect(campaigns);
      expect(selected.id).toBe('only');
    });
  });
});

// =============================================================================
// HTTP INTEGRATION TESTS
// =============================================================================

describe('Ad Delivery - HTTP Integration Tests', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    // Enable ads system for tests
    process.env.ENABLE_ADS_SYSTEM = 'true';
    invalidateCampaignCache();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENABLE_ADS_SYSTEM;
    invalidateCampaignCache();
  });

  describe('GET /api/v1/ads/next', () => {
    it('should return null when no active campaigns', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ad).toBeNull();
    });

    it('should return an active campaign', async () => {
      const { brand } = await createTestBrand();
      await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 10000,
        budgetSpent: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ad).not.toBeNull();
      expect(body.ad.headline).toBe('Test Campaign Headline');
      expect(body.ad.brandName).toBe(brand.name);
    });

    it('should not return campaigns with exhausted budget', async () => {
      const { brand } = await createTestBrand();
      await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 10000,
        budgetSpent: 10000, // Exhausted
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ad).toBeNull();
    });

    it('should not return DRAFT campaigns', async () => {
      const { brand } = await createTestBrand();
      await createTestCampaign(brand.id, {
        status: 'DRAFT',
        budgetTotal: 10000,
        budgetSpent: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ad).toBeNull();
    });

    it('should not return campaigns before start date', async () => {
      const { brand } = await createTestBrand();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 10000,
        budgetSpent: 0,
        startDate: futureDate,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ad).toBeNull();
    });

    it('should not return campaigns after end date', async () => {
      const { brand } = await createTestBrand();
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 10000,
        budgetSpent: 0,
        endDate: pastDate,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ad).toBeNull();
    });
  });

  describe('POST /api/v1/ads/impression', () => {
    it('should record impression for active campaign', async () => {
      const { brand } = await createTestBrand();
      const campaign = await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 10000,
        budgetSpent: 0,
        pricingModel: 'CPM',
        bidAmount: 3000, // $30 per 1000 = $0.03 per impression
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: campaign.id },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.impressionId).toBeDefined();

      // Verify campaign was updated
      const updated = await testPrisma.campaign.findUnique({
        where: { id: campaign.id },
      });
      expect(updated!.impressions).toBe(1);
      expect(updated!.budgetSpent).toBe(3); // $0.03 in cents
    });

    it('should return 404 for non-existent campaign', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: '00000000-0000-0000-0000-000000000000' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('CAMPAIGN_NOT_AVAILABLE');
    });

    it('should return 404 for DRAFT campaign', async () => {
      const { brand } = await createTestBrand();
      const campaign = await createTestCampaign(brand.id, {
        status: 'DRAFT',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: campaign.id },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid campaign ID format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: 'not-a-uuid' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      // Fastify schema validation returns FST_ERR_VALIDATION
      expect(['INVALID_ID', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should return 400 when campaignId is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should mark campaign as COMPLETED when budget exhausted', async () => {
      const { brand } = await createTestBrand();
      const campaign = await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 3, // Only $0.03
        budgetSpent: 0,
        pricingModel: 'CPM',
        bidAmount: 3000, // $0.03 per impression
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: campaign.id },
      });

      expect(response.statusCode).toBe(201);

      // Verify campaign is now COMPLETED
      const updated = await testPrisma.campaign.findUnique({
        where: { id: campaign.id },
      });
      expect(updated!.status).toBe('COMPLETED');
    });
  });

  describe('POST /api/v1/ads/click', () => {
    it('should record click for existing impression', async () => {
      const { brand } = await createTestBrand();
      const campaign = await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 10000,
        budgetSpent: 0,
        pricingModel: 'CPC',
        bidAmount: 300, // $3 per click
      });

      // First create an impression
      const impressionResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: campaign.id },
      });
      const { impressionId } = JSON.parse(impressionResponse.payload);

      // Then record a click
      const clickResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/click',
        payload: { impressionId },
      });

      expect(clickResponse.statusCode).toBe(200);
      const body = JSON.parse(clickResponse.payload);
      expect(body.success).toBe(true);

      // Verify campaign was updated
      const updated = await testPrisma.campaign.findUnique({
        where: { id: campaign.id },
      });
      expect(updated!.clicks).toBe(1);
      expect(updated!.budgetSpent).toBe(300); // $3 for CPC
    });

    it('should return 404 for non-existent impression', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/click',
        payload: { impressionId: '00000000-0000-0000-0000-000000000000' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('IMPRESSION_NOT_AVAILABLE');
    });

    it('should return 404 for already clicked impression', async () => {
      const { brand } = await createTestBrand();
      const campaign = await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 10000,
        pricingModel: 'CPC',
        bidAmount: 300,
      });

      // Create impression and click it
      const impressionResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: campaign.id },
      });
      const { impressionId } = JSON.parse(impressionResponse.payload);

      // First click
      await app.inject({
        method: 'POST',
        url: '/api/v1/ads/click',
        payload: { impressionId },
      });

      // Second click should fail
      const secondClick = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/click',
        payload: { impressionId },
      });

      expect(secondClick.statusCode).toBe(404);
    });

    it('should return 400 for invalid impression ID format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/click',
        payload: { impressionId: 'not-a-uuid' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      // Fastify schema validation returns FST_ERR_VALIDATION
      expect(['INVALID_ID', 'FST_ERR_VALIDATION']).toContain(body.code);
    });

    it('should mark CPC campaign as COMPLETED when budget exhausted', async () => {
      const { brand } = await createTestBrand();
      const campaign = await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 300, // Only $3 - one click
        budgetSpent: 0,
        pricingModel: 'CPC',
        bidAmount: 300, // $3 per click
      });

      // Create impression
      const impressionResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: campaign.id },
      });
      const { impressionId } = JSON.parse(impressionResponse.payload);

      // Click exhausts budget
      await app.inject({
        method: 'POST',
        url: '/api/v1/ads/click',
        payload: { impressionId },
      });

      // Verify campaign is now COMPLETED
      const updated = await testPrisma.campaign.findUnique({
        where: { id: campaign.id },
      });
      expect(updated!.status).toBe('COMPLETED');
    });
  });
});

// =============================================================================
// FEATURE FLAG TESTS
// =============================================================================

describe('Ad Delivery - Feature Flag Tests', () => {
  describe('when ads system is disabled', () => {
    let app: Awaited<ReturnType<typeof buildTestAppWithAdsDisabled>>;

    beforeEach(async () => {
      app = await buildTestAppWithAdsDisabled();
    });

    afterEach(async () => {
      await app.close();
    });

    it('GET /api/v1/ads/next should return 404', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('ADS_SYSTEM_DISABLED');
    });

    it('POST /api/v1/ads/impression should return 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: '00000000-0000-0000-0000-000000000000' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('ADS_SYSTEM_DISABLED');
    });

    it('POST /api/v1/ads/click should return 404', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/click',
        payload: { impressionId: '00000000-0000-0000-0000-000000000000' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('ADS_SYSTEM_DISABLED');
    });
  });
});

// =============================================================================
// FREQUENCY CAPPING TESTS
// =============================================================================

describe('Ad Delivery - Frequency Capping', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    process.env.ENABLE_ADS_SYSTEM = 'true';
    invalidateCampaignCache();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENABLE_ADS_SYSTEM;
    invalidateCampaignCache();
  });

  it('should not return same campaign twice within frequency cap window', async () => {
    const { brand } = await createTestBrand();
    const campaign = await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 10000,
      budgetSpent: 0,
    });

    // Get first ad
    const firstResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
      headers: {
        'x-forwarded-for': '1.2.3.4', // Simulate consistent IP
      },
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstAd = JSON.parse(firstResponse.payload).ad;
    expect(firstAd).not.toBeNull();

    // Record impression
    await app.inject({
      method: 'POST',
      url: '/api/v1/ads/impression',
      payload: { campaignId: campaign.id },
      headers: {
        'x-forwarded-for': '1.2.3.4',
      },
    });

    // Second request from same IP should not get same campaign
    const secondResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
      headers: {
        'x-forwarded-for': '1.2.3.4',
      },
    });
    expect(secondResponse.statusCode).toBe(200);
    const secondAd = JSON.parse(secondResponse.payload).ad;
    // With only one campaign and frequency cap, should return null
    expect(secondAd).toBeNull();
  });

  it('should return campaign to different IP', async () => {
    const { brand } = await createTestBrand();
    const campaign = await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 100000, // Large budget to avoid completion
      budgetSpent: 0,
    });

    // Ensure cache is invalidated so new campaign is found
    invalidateCampaignCache();

    // First IP requests ad
    const firstResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
      headers: {
        'x-forwarded-for': '1.2.3.4',
      },
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstBody = JSON.parse(firstResponse.payload);
    expect(firstBody.ad).not.toBeNull();
    expect(firstBody.ad.id).toBe(campaign.id);

    // Different IP should also get the same campaign (no frequency cap cross-IP)
    const secondResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
      headers: {
        'x-forwarded-for': '5.6.7.8',
      },
    });
    expect(secondResponse.statusCode).toBe(200);
    const secondBody = JSON.parse(secondResponse.payload);
    expect(secondBody.ad).not.toBeNull();
    expect(secondBody.ad.id).toBe(campaign.id);
  });
});

// =============================================================================
// DATABASE OPERATIONS TESTS
// =============================================================================

describe('Ad Delivery - Database Operations', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    process.env.ENABLE_ADS_SYSTEM = 'true';
    invalidateCampaignCache();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENABLE_ADS_SYSTEM;
    invalidateCampaignCache();
  });

  it('should create AdImpression record on impression', async () => {
    const { brand } = await createTestBrand();
    const campaign = await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 10000,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/impression',
      payload: { campaignId: campaign.id },
      headers: {
        'x-forwarded-for': '1.2.3.4',
      },
    });

    const { impressionId } = JSON.parse(response.payload);

    // Verify impression was created
    const impression = await testPrisma.adImpression.findUnique({
      where: { id: impressionId },
    });

    expect(impression).not.toBeNull();
    expect(impression!.campaignId).toBe(campaign.id);
    expect(impression!.clicked).toBe(false);
    expect(impression!.ipHash).not.toBeNull();
    expect(impression!.ipHash).toHaveLength(16);
  });

  it('should update AdImpression on click', async () => {
    const { brand } = await createTestBrand();
    const campaign = await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 10000,
      pricingModel: 'CPC',
      bidAmount: 300,
    });

    // Create impression
    const impressionResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/impression',
      payload: { campaignId: campaign.id },
    });
    const { impressionId } = JSON.parse(impressionResponse.payload);

    // Record click
    await app.inject({
      method: 'POST',
      url: '/api/v1/ads/click',
      payload: { impressionId },
    });

    // Verify impression was updated
    const impression = await testPrisma.adImpression.findUnique({
      where: { id: impressionId },
    });

    expect(impression!.clicked).toBe(true);
    expect(impression!.clickedAt).not.toBeNull();
  });

  it('should increment campaign impressions and clicks', async () => {
    const { brand } = await createTestBrand();
    const campaign = await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 10000,
      pricingModel: 'CPC',
      bidAmount: 300,
      impressions: 0,
      clicks: 0,
    });

    // Record 3 impressions
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: campaign.id },
        headers: {
          'x-forwarded-for': `1.2.3.${i}`, // Different IPs to avoid frequency cap
        },
      });
    }

    // Record 1 click
    const impressionResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/impression',
      payload: { campaignId: campaign.id },
      headers: { 'x-forwarded-for': '9.9.9.9' },
    });
    const { impressionId } = JSON.parse(impressionResponse.payload);

    await app.inject({
      method: 'POST',
      url: '/api/v1/ads/click',
      payload: { impressionId },
    });

    // Verify counts
    const updated = await testPrisma.campaign.findUnique({
      where: { id: campaign.id },
    });

    expect(updated!.impressions).toBe(4); // 3 + 1
    expect(updated!.clicks).toBe(1);
  });
});

// =============================================================================
// WEIGHTED SELECTION TESTS
// =============================================================================

describe('Ad Delivery - Weighted Selection', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    process.env.ENABLE_ADS_SYSTEM = 'true';
    invalidateCampaignCache();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENABLE_ADS_SYSTEM;
    invalidateCampaignCache();
  });

  it('should select between multiple active campaigns', async () => {
    const { brand: brand1 } = await createTestBrand({ email: 'brand1@test.com' });
    const { brand: brand2 } = await createTestBrand({ email: 'brand2@test.com' });

    await createTestCampaign(brand1.id, {
      headline: 'Campaign 1',
      status: 'ACTIVE',
      budgetTotal: 10000,
      bidAmount: 3000,
    });
    await createTestCampaign(brand2.id, {
      headline: 'Campaign 2',
      status: 'ACTIVE',
      budgetTotal: 10000,
      bidAmount: 3000,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.ad).not.toBeNull();
    expect(['Campaign 1', 'Campaign 2']).toContain(body.ad.headline);
  });
});

// =============================================================================
// CACHE TESTS
// =============================================================================

describe('Ad Delivery - Cache', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    process.env.ENABLE_ADS_SYSTEM = 'true';
    invalidateCampaignCache(); // Clear cache before each test
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENABLE_ADS_SYSTEM;
    invalidateCampaignCache();
  });

  it('should return cache stats', () => {
    const stats = getCacheStats();
    expect(stats).toHaveProperty('cached');
    expect(stats).toHaveProperty('age');
    expect(stats).toHaveProperty('count');
  });

  it('should populate cache on first request', async () => {
    const { brand } = await createTestBrand();
    await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 10000,
    });

    // Cache should be empty initially
    const statsBefore = getCacheStats();
    expect(statsBefore.cached).toBe(false);

    // Make request
    await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
    });

    // Cache should now be populated
    const statsAfter = getCacheStats();
    expect(statsAfter.cached).toBe(true);
    expect(statsAfter.count).toBeGreaterThan(0);
  });

  it('should use cached campaigns on subsequent requests', async () => {
    const { brand } = await createTestBrand();
    await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 10000,
    });

    // First request populates cache
    await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
    });

    const statsAfterFirst = getCacheStats();
    const firstCacheAge = statsAfterFirst.age;

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second request should use cache
    await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
    });

    const statsAfterSecond = getCacheStats();
    // Cache age should be greater (same cache, older)
    expect(statsAfterSecond.age).toBeGreaterThan(firstCacheAge!);
  });

  it('should invalidate cache when campaign completes', async () => {
    const { brand } = await createTestBrand();
    const campaign = await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 3, // Very small budget
      budgetSpent: 0,
      pricingModel: 'CPM',
      bidAmount: 3000, // $0.03 per impression
    });

    // Populate cache
    await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
    });

    expect(getCacheStats().cached).toBe(true);

    // Record impression that exhausts budget
    await app.inject({
      method: 'POST',
      url: '/api/v1/ads/impression',
      payload: { campaignId: campaign.id },
    });

    // Cache should be invalidated
    expect(getCacheStats().cached).toBe(false);
  });
});

// =============================================================================
// PERFORMANCE TESTS
// =============================================================================

describe('Ad Delivery - Performance', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    process.env.ENABLE_ADS_SYSTEM = 'true';
    invalidateCampaignCache();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENABLE_ADS_SYSTEM;
    invalidateCampaignCache();
  });

  it('should return ad in < 100ms (with cache)', async () => {
    const { brand } = await createTestBrand();
    await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 10000,
    });

    // Warm up cache
    await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
    });

    // Measure cached request
    const start = Date.now();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ads/next',
    });
    const duration = Date.now() - start;

    expect(response.statusCode).toBe(200);
    // With cache, should be fast (allowing some margin for CI environments)
    expect(duration).toBeLessThan(100);
  });

  it('should handle multiple concurrent requests', async () => {
    const { brand } = await createTestBrand();
    await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 100000,
    });

    // Make 10 concurrent requests
    const requests = Array(10)
      .fill(null)
      .map(() =>
        app.inject({
          method: 'GET',
          url: '/api/v1/ads/next',
        })
      );

    const responses = await Promise.all(requests);

    // All should succeed
    responses.forEach((response) => {
      expect(response.statusCode).toBe(200);
    });
  });
});

// =============================================================================
// CONCURRENCY TESTS - Race Condition Prevention
// =============================================================================

describe('Ad Delivery - Concurrency (Race Condition Prevention)', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    process.env.ENABLE_ADS_SYSTEM = 'true';
    invalidateCampaignCache();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENABLE_ADS_SYSTEM;
    invalidateCampaignCache();
  });

  it('should not overspend budget with concurrent impressions', async () => {
    const { brand } = await createTestBrand();
    // Budget for exactly 10 impressions at $0.03 each = $0.30
    const campaign = await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 30, // 30 cents
      budgetSpent: 0,
      pricingModel: 'CPM',
      bidAmount: 3000, // $30 per 1000 = $0.03 per impression
    });

    // Try to record 20 concurrent impressions (only 10 should succeed)
    const requests = Array(20)
      .fill(null)
      .map((_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/ads/impression',
          payload: { campaignId: campaign.id },
          headers: {
            'x-forwarded-for': `1.2.3.${i}`, // Different IPs
          },
        })
      );

    const responses = await Promise.all(requests);

    // Count successes
    const successes = responses.filter((r) => r.statusCode === 201).length;
    const failures = responses.filter((r) => r.statusCode === 404).length;

    // Should have exactly 10 successes (budget for 10 impressions)
    expect(successes).toBe(10);
    expect(failures).toBe(10);

    // Verify campaign state
    const updated = await testPrisma.campaign.findUnique({
      where: { id: campaign.id },
    });

    expect(updated!.status).toBe('COMPLETED');
    expect(updated!.budgetSpent).toBe(30); // Exactly budget, not over
    expect(updated!.impressions).toBe(10);
  });

  it('should not allow double-clicks with concurrent requests', async () => {
    const { brand } = await createTestBrand();
    const campaign = await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 10000,
      pricingModel: 'CPC',
      bidAmount: 300,
    });

    // Create one impression
    const impressionResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/ads/impression',
      payload: { campaignId: campaign.id },
    });
    const { impressionId } = JSON.parse(impressionResponse.payload);

    // Try to click 10 times concurrently (only 1 should succeed)
    const clickRequests = Array(10)
      .fill(null)
      .map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/ads/click',
          payload: { impressionId },
        })
      );

    const clickResponses = await Promise.all(clickRequests);

    // Count successes
    const clickSuccesses = clickResponses.filter((r) => r.statusCode === 200).length;
    const clickFailures = clickResponses.filter((r) => r.statusCode === 404).length;

    // Only 1 click should succeed
    expect(clickSuccesses).toBe(1);
    expect(clickFailures).toBe(9);

    // Verify impression state
    const impression = await testPrisma.adImpression.findUnique({
      where: { id: impressionId },
    });

    expect(impression!.clicked).toBe(true);

    // Verify campaign click count
    const updatedCampaign = await testPrisma.campaign.findUnique({
      where: { id: campaign.id },
    });

    expect(updatedCampaign!.clicks).toBe(1);
  });

  it('should not overspend CPC budget with concurrent clicks', async () => {
    const { brand } = await createTestBrand();
    // Budget for exactly 3 clicks at $3 each = $9
    const campaign = await createTestCampaign(brand.id, {
      status: 'ACTIVE',
      budgetTotal: 900, // $9
      budgetSpent: 0,
      pricingModel: 'CPC',
      bidAmount: 300, // $3 per click
    });

    // Create 10 impressions
    const impressionPromises = Array(10)
      .fill(null)
      .map((_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/ads/impression',
          payload: { campaignId: campaign.id },
          headers: { 'x-forwarded-for': `2.3.4.${i}` },
        })
      );

    const impressionResponses = await Promise.all(impressionPromises);
    const impressionIds = impressionResponses
      .filter((r) => r.statusCode === 201)
      .map((r) => JSON.parse(r.payload).impressionId);

    // Click all impressions concurrently (only 3 should charge)
    const clickRequests = impressionIds.map((impressionId) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/ads/click',
        payload: { impressionId },
      })
    );

    const clickResponses = await Promise.all(clickRequests);

    // All clicks should succeed (we record the click even if budget exhausted)
    const clickSuccesses = clickResponses.filter((r) => r.statusCode === 200).length;
    expect(clickSuccesses).toBe(impressionIds.length);

    // Verify campaign state
    const updated = await testPrisma.campaign.findUnique({
      where: { id: campaign.id },
    });

    // Budget should not exceed total
    expect(updated!.budgetSpent).toBeLessThanOrEqual(updated!.budgetTotal);
    // Status should be COMPLETED
    expect(updated!.status).toBe('COMPLETED');
  });
});

// =============================================================================
// SLOT TYPE TESTS - Sidebar vs Feed Targeting
// =============================================================================

describe('Ad Delivery - Slot Type Filtering', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    process.env.ENABLE_ADS_SYSTEM = 'true';
    invalidateCampaignCache();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ENABLE_ADS_SYSTEM;
    invalidateCampaignCache();
  });

  describe('GET /api/v1/ads/next?slot=', () => {
    it('should return only FEED campaigns when slot=feed (default)', async () => {
      const { brand } = await createTestBrand();

      // Create both FEED and SIDEBAR campaigns
      const feedCampaign = await createTestCampaign(brand.id, {
        headline: 'Feed Campaign',
        status: 'ACTIVE',
        budgetTotal: 10000,
        slotType: 'FEED',
      });
      await createTestCampaign(brand.id, {
        headline: 'Sidebar Campaign',
        status: 'ACTIVE',
        budgetTotal: 10000,
        slotType: 'SIDEBAR',
      });

      // Request without slot param (defaults to feed)
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ad).not.toBeNull();
      expect(body.ad.id).toBe(feedCampaign.id);
      expect(body.ad.slotType).toBe('feed');
    });

    it('should return only SIDEBAR campaigns when slot=sidebar', async () => {
      const { brand } = await createTestBrand();

      // Create both FEED and SIDEBAR campaigns
      await createTestCampaign(brand.id, {
        headline: 'Feed Campaign',
        status: 'ACTIVE',
        budgetTotal: 10000,
        slotType: 'FEED',
      });
      const sidebarCampaign = await createTestCampaign(brand.id, {
        headline: 'Sidebar Campaign',
        status: 'ACTIVE',
        budgetTotal: 10000,
        slotType: 'SIDEBAR',
      });

      // Request with slot=sidebar
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next?slot=sidebar',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ad).not.toBeNull();
      expect(body.ad.id).toBe(sidebarCampaign.id);
      expect(body.ad.slotType).toBe('sidebar');
    });

    it('should return null when no campaigns exist for requested slot', async () => {
      const { brand } = await createTestBrand();

      // Create only FEED campaign
      await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 10000,
        slotType: 'FEED',
      });

      // Request sidebar slot
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next?slot=sidebar',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.ad).toBeNull();
    });

    it('should reject invalid slot param with 400', async () => {
      await createTestBrand();

      // Request with invalid slot param - Fastify schema validation
      // rejects values not in the enum ['feed', 'sidebar']
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next?slot=invalid',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should filter by slot type even with multiple campaigns', async () => {
      const { brand } = await createTestBrand();

      // Create 3 FEED campaigns and 2 SIDEBAR campaigns
      for (let i = 0; i < 3; i++) {
        await createTestCampaign(brand.id, {
          headline: `Feed Campaign ${i}`,
          status: 'ACTIVE',
          budgetTotal: 10000,
          slotType: 'FEED',
        });
      }
      for (let i = 0; i < 2; i++) {
        await createTestCampaign(brand.id, {
          headline: `Sidebar Campaign ${i}`,
          status: 'ACTIVE',
          budgetTotal: 10000,
          slotType: 'SIDEBAR',
        });
      }

      // Request sidebar - should only get sidebar campaigns
      const sidebarResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next?slot=sidebar',
      });

      const sidebarBody = JSON.parse(sidebarResponse.payload);
      expect(sidebarBody.ad).not.toBeNull();
      expect(sidebarBody.ad.slotType).toBe('sidebar');
      expect(sidebarBody.ad.headline).toMatch(/Sidebar Campaign/);

      // Request feed - should only get feed campaigns
      invalidateCampaignCache(); // Clear cache to ensure fresh results
      const feedResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next?slot=feed',
      });

      const feedBody = JSON.parse(feedResponse.payload);
      expect(feedBody.ad).not.toBeNull();
      expect(feedBody.ad.slotType).toBe('feed');
      expect(feedBody.ad.headline).toMatch(/Feed Campaign/);
    });
  });

  describe('Slot type with impression tracking', () => {
    it('should track impressions for sidebar campaigns correctly', async () => {
      const { brand } = await createTestBrand();

      const sidebarCampaign = await createTestCampaign(brand.id, {
        status: 'ACTIVE',
        budgetTotal: 10000,
        slotType: 'SIDEBAR',
        pricingModel: 'CPM',
        bidAmount: 3000,
      });

      // Get sidebar ad
      const adResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/ads/next?slot=sidebar',
      });

      const ad = JSON.parse(adResponse.payload).ad;
      expect(ad.id).toBe(sidebarCampaign.id);

      // Record impression
      const impressionResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/ads/impression',
        payload: { campaignId: sidebarCampaign.id },
      });

      expect(impressionResponse.statusCode).toBe(201);
      const { impressionId } = JSON.parse(impressionResponse.payload);
      expect(impressionId).toBeDefined();

      // Verify campaign was updated
      const updated = await testPrisma.campaign.findUnique({
        where: { id: sidebarCampaign.id },
      });
      expect(updated!.impressions).toBe(1);
    });
  });
});
