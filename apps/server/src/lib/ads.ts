/**
 * Ad Delivery System
 *
 * Core logic for serving and tracking ads:
 * - Weighted random selection by bid amount
 * - Frequency capping (1 impression/hour/observer)
 * - Atomic budget updates with race condition protection
 * - Impression and click tracking
 * - In-memory cache for active campaigns
 *
 * Performance target: < 50ms for getNextAd()
 *
 * @module lib/ads
 */

import { prisma } from './prisma.js';
import { AD_DELIVERY } from './ads-constants.js';
import type { Campaign, PricingModel, User } from '@prisma/client';
import crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Ad slot types for targeting
 */
export type AdSlotType = 'feed' | 'sidebar';

/**
 * Ad candidate returned by getNextAd
 */
export interface AdCandidate {
  id: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string;
  brandName: string;
  brandCompany: string;
  slotType: AdSlotType;
}

/**
 * Context for ad selection (observer/IP info, slot type)
 */
export interface AdSelectionContext {
  observerId?: string | undefined;
  ipAddress?: string | undefined;
  slotType?: AdSlotType | undefined;
}

/**
 * Result of recording an impression
 */
export interface ImpressionResult {
  impressionId: string;
  campaignId: string;
}

/**
 * Campaign fields needed for ad delivery (excludes payment fields)
 */
interface CampaignForDelivery {
  id: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  linkUrl: string;
  status: Campaign['status'];
  pricingModel: Campaign['pricingModel'];
  slotType: AdSlotType;
  bidAmount: number;
  budgetTotal: number;
  budgetSpent: number;
  paymentToken: Campaign['paymentToken'];
  paymentTxHash: string | null;
  startDate: Date | null;
  endDate: Date | null;
  impressions: number;
  clicks: number;
  createdAt: Date;
  updatedAt: Date;
  advertiserId: string;
  advertiser: Pick<User, 'name' | 'company'>;
}

// =============================================================================
// CACHE
// =============================================================================

/**
 * In-memory cache for active campaigns.
 * TTL defined in AD_DELIVERY.CAMPAIGNS_CACHE_TTL (60 seconds).
 */
interface CampaignCache {
  campaigns: CampaignForDelivery[];
  timestamp: number;
}

let campaignCache: CampaignCache | null = null;

/**
 * Get cached campaigns or fetch from database if cache is stale/empty.
 */
async function getCachedCampaigns(): Promise<CampaignForDelivery[]> {
  const now = Date.now();
  const ttlMs = AD_DELIVERY.CAMPAIGNS_CACHE_TTL * 1000;

  // Return cached if valid
  if (campaignCache && (now - campaignCache.timestamp) < ttlMs) {
    return campaignCache.campaigns;
  }

  // Fetch from database using raw query for efficiency
  // This query filters budget_spent < budget_total directly in SQL
  const campaigns = await fetchActiveCampaigns();

  // Update cache
  campaignCache = {
    campaigns,
    timestamp: now,
  };

  return campaigns;
}

/**
 * Invalidate the campaign cache.
 * Called when a campaign status changes (e.g., becomes COMPLETED).
 */
export function invalidateCampaignCache(): void {
  campaignCache = null;
}

/**
 * Fetch active campaigns with efficient SQL query.
 * Filters in database: status = ACTIVE, budget_spent < budget_total, date range.
 */
async function fetchActiveCampaigns(): Promise<CampaignForDelivery[]> {
  const now = new Date();

  // Use Prisma with raw filter for budget comparison
  // We use $queryRaw for the budget comparison
  const campaigns = await prisma.$queryRaw<
    Array<{
      id: string;
      headline: string;
      description: string;
      image_url: string | null;
      link_url: string;
      status: string;
      pricing_model: string;
      slot_type: string;
      bid_amount: number;
      budget_total: number;
      budget_spent: number;
      payment_token: string;
      payment_tx_hash: string | null;
      start_date: Date | null;
      end_date: Date | null;
      impressions: number;
      clicks: number;
      created_at: Date;
      updated_at: Date;
      advertiser_id: string;
      advertiser_name: string;
      advertiser_company: string | null;
    }>
  >`
    SELECT
      c.id,
      c.headline,
      c.description,
      c.image_url,
      c.link_url,
      c.status,
      c.pricing_model,
      c.slot_type,
      c.bid_amount,
      c.budget_total,
      c.budget_spent,
      c.payment_token,
      c.payment_tx_hash,
      c.start_date,
      c.end_date,
      c.impressions,
      c.clicks,
      c.created_at,
      c.updated_at,
      c.advertiser_id,
      u.name as advertiser_name,
      u.company as advertiser_company
    FROM campaigns c
    JOIN users u ON c.advertiser_id = u.id
    WHERE c.status = 'active'
      AND c.budget_spent < c.budget_total
      AND (c.start_date IS NULL OR c.start_date <= ${now})
      AND (c.end_date IS NULL OR c.end_date >= ${now})
    ORDER BY c.bid_amount DESC
    LIMIT ${AD_DELIVERY.MAX_CAMPAIGNS_PER_REQUEST}
  `;

  // Map to CampaignForDelivery format
  return campaigns.map((c) => ({
    id: c.id,
    headline: c.headline,
    description: c.description,
    imageUrl: c.image_url,
    linkUrl: c.link_url,
    status: c.status as Campaign['status'],
    pricingModel: c.pricing_model as Campaign['pricingModel'],
    slotType: c.slot_type as AdSlotType,
    bidAmount: c.bid_amount,
    budgetTotal: c.budget_total,
    budgetSpent: c.budget_spent,
    paymentToken: c.payment_token as Campaign['paymentToken'],
    paymentTxHash: c.payment_tx_hash,
    startDate: c.start_date,
    endDate: c.end_date,
    impressions: c.impressions,
    clicks: c.clicks,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    advertiserId: c.advertiser_id,
    advertiser: {
      name: c.advertiser_name,
      company: c.advertiser_company,
    },
  }));
}

// =============================================================================
// IP HASHING
// =============================================================================

/**
 * Hash IP address for frequency capping anonymous users.
 * Uses SHA256 truncated to 16 chars for privacy while maintaining uniqueness.
 */
export function hashIpForCapping(ip: string): string {
  return crypto
    .createHash('sha256')
    .update(ip)
    .digest('hex')
    .substring(0, 16);
}

// =============================================================================
// AD SELECTION
// =============================================================================

/**
 * Get the next ad to show.
 *
 * Algorithm:
 * 1. Get active campaigns from cache (or fetch if stale)
 * 2. Filter by frequency cap (1 impression per hour per observer/IP)
 * 3. Select using weighted random by bid amount
 *
 * Performance: Uses cache to minimize database queries.
 *
 * @param context - Observer ID or IP for frequency capping
 * @returns Ad candidate or null if no eligible ads
 */
export async function getNextAd(context: AdSelectionContext): Promise<AdCandidate | null> {
  // Step 1: Get campaigns from cache
  const allCampaigns = await getCachedCampaigns();

  if (allCampaigns.length === 0) {
    return null;
  }

  // Step 1.5: Filter by slot type (default to 'feed' for backward compatibility)
  const targetSlot = context.slotType ?? 'feed';
  const campaigns = allCampaigns.filter((c) => c.slotType === targetSlot);

  if (campaigns.length === 0) {
    return null;
  }

  // Step 2: Filter by frequency cap
  let eligibleCampaigns = campaigns;

  if (context.observerId || context.ipAddress) {
    const frequencyCapWindow = new Date(
      Date.now() - AD_DELIVERY.FREQUENCY_CAP_HOURS * 60 * 60 * 1000
    );
    const ipHash = context.ipAddress ? hashIpForCapping(context.ipAddress) : null;

    // Efficient query: only get campaign IDs for frequency cap check
    const recentImpressions = await prisma.adImpression.findMany({
      where: {
        createdAt: { gte: frequencyCapWindow },
        OR: [
          ...(context.observerId ? [{ observerId: context.observerId }] : []),
          ...(ipHash ? [{ ipHash }] : []),
        ],
      },
      select: {
        campaignId: true,
      },
      distinct: ['campaignId'],
    });

    const recentCampaignIds = new Set(recentImpressions.map((i) => i.campaignId));
    eligibleCampaigns = campaigns.filter((c) => !recentCampaignIds.has(c.id));
  }

  if (eligibleCampaigns.length === 0) {
    return null;
  }

  // Step 3: Weighted random selection by bid amount
  const selected = weightedRandomSelect(eligibleCampaigns);

  return {
    id: selected.id,
    headline: selected.headline,
    description: selected.description,
    imageUrl: selected.imageUrl,
    linkUrl: selected.linkUrl,
    brandName: selected.advertiser.name,
    brandCompany: selected.advertiser.company ?? '',
    slotType: selected.slotType,
  };
}

/**
 * Select a campaign using weighted random by bid amount.
 * Higher bids have higher probability of selection.
 */
function weightedRandomSelect<T extends { bidAmount: number }>(campaigns: T[]): T {
  const totalBid = campaigns.reduce((sum, c) => sum + c.bidAmount, 0);
  let random = Math.random() * totalBid;

  for (const campaign of campaigns) {
    random -= campaign.bidAmount;
    if (random <= 0) {
      return campaign;
    }
  }

  // Fallback (should not reach here - array is guaranteed non-empty by caller)
  return campaigns[0]!;
}

// =============================================================================
// IMPRESSION TRACKING
// =============================================================================

/**
 * Record an ad impression with race condition protection.
 *
 * Uses conditional update to prevent budget overflow:
 * - Only updates if budget_spent + cost <= budget_total
 * - Creates impression only if update succeeds
 * - Atomic transaction ensures consistency
 *
 * @param campaignId - Campaign that was shown
 * @param context - Observer ID or IP
 * @returns Impression ID and campaign ID, or null if campaign unavailable
 */
export async function recordImpression(
  campaignId: string,
  context: AdSelectionContext
): Promise<ImpressionResult | null> {
  const ipHash = context.ipAddress ? hashIpForCapping(context.ipAddress) : null;

  // Get campaign info for cost calculation
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      status: true,
      pricingModel: true,
      bidAmount: true,
      budgetTotal: true,
      budgetSpent: true,
    },
  });

  if (!campaign || campaign.status !== 'ACTIVE') {
    return null;
  }

  // Calculate cost for CPM (cost per 1000 impressions)
  const impressionCost = campaign.pricingModel === 'CPM'
    ? Math.round(campaign.bidAmount / 1000)
    : 0;

  // Use transaction with conditional update to prevent race conditions
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Conditional update: only succeeds if budget allows
      // Uses raw query for atomic check-and-update
      const updateResult = await tx.$executeRaw`
        UPDATE campaigns
        SET
          impressions = impressions + 1,
          budget_spent = budget_spent + ${impressionCost},
          status = CASE
            WHEN budget_spent + ${impressionCost} >= budget_total THEN 'completed'::enum_campaign_status
            ELSE status
          END,
          updated_at = NOW()
        WHERE id = ${campaignId}::uuid
          AND status = 'active'
          AND budget_spent + ${impressionCost} <= budget_total
      `;

      // If no rows updated, budget was exhausted or status changed
      if (updateResult === 0) {
        throw new Error('CAMPAIGN_UNAVAILABLE');
      }

      // Check if campaign was just completed
      const updated = await tx.campaign.findUnique({
        where: { id: campaignId },
        select: { status: true },
      });

      if (updated?.status === 'COMPLETED') {
        // Invalidate cache since a campaign just completed
        invalidateCampaignCache();
      }

      // Create impression record
      const impression = await tx.adImpression.create({
        data: {
          campaignId,
          observerId: context.observerId ?? null,
          ipHash,
        },
      });

      return impression;
    });

    return {
      impressionId: result.id,
      campaignId,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'CAMPAIGN_UNAVAILABLE') {
      return null;
    }
    throw error;
  }
}

// =============================================================================
// CLICK TRACKING
// =============================================================================

/**
 * Record an ad click with race condition protection.
 *
 * Uses conditional update to:
 * - Prevent double-clicking
 * - Prevent CPC budget overflow
 * - Atomic transaction ensures consistency
 *
 * @param impressionId - Impression that was clicked
 * @returns true if click was recorded, false if impression not found or already clicked
 */
export async function recordClick(impressionId: string): Promise<boolean> {
  // Find impression with campaign info
  const impression = await prisma.adImpression.findUnique({
    where: { id: impressionId },
    select: {
      id: true,
      clicked: true,
      campaign: {
        select: {
          id: true,
          status: true,
          pricingModel: true,
          bidAmount: true,
          budgetTotal: true,
          budgetSpent: true,
        },
      },
    },
  });

  if (!impression || impression.clicked) {
    return false;
  }

  const { campaign } = impression;

  // Campaign must still be active (or just completed but allowing final click)
  if (campaign.status !== 'ACTIVE' && campaign.status !== 'COMPLETED') {
    return false;
  }

  // Calculate cost for CPC
  const clickCost = campaign.pricingModel === 'CPC' ? campaign.bidAmount : 0;

  try {
    await prisma.$transaction(async (tx) => {
      // Conditional update for impression: only if not already clicked
      const impressionUpdate = await tx.$executeRaw`
        UPDATE ad_impressions
        SET clicked = true, clicked_at = NOW()
        WHERE id = ${impressionId}::uuid
          AND clicked = false
      `;

      if (impressionUpdate === 0) {
        throw new Error('ALREADY_CLICKED');
      }

      // For CPC, update campaign budget with conditional check
      if (clickCost > 0) {
        const campaignUpdate = await tx.$executeRaw`
          UPDATE campaigns
          SET
            clicks = clicks + 1,
            budget_spent = budget_spent + ${clickCost},
            status = CASE
              WHEN budget_spent + ${clickCost} >= budget_total THEN 'completed'::enum_campaign_status
              ELSE status
            END,
            updated_at = NOW()
          WHERE id = ${campaign.id}::uuid
            AND (status = 'active' OR status = 'completed')
            AND budget_spent + ${clickCost} <= budget_total
        `;

        // If CPC update failed, budget was exhausted - but we still count the click
        // The impression click is already recorded, just don't charge
        if (campaignUpdate === 0) {
          // Just increment click counter without charging
          await tx.campaign.update({
            where: { id: campaign.id },
            data: { clicks: { increment: 1 } },
          });
        }
      } else {
        // CPM: just increment click counter
        await tx.campaign.update({
          where: { id: campaign.id },
          data: { clicks: { increment: 1 } },
        });
      }

      // Check if campaign was just completed
      const updated = await tx.campaign.findUnique({
        where: { id: campaign.id },
        select: { status: true },
      });

      if (updated?.status === 'COMPLETED') {
        invalidateCampaignCache();
      }
    });

    return true;
  } catch (error) {
    if (error instanceof Error && error.message === 'ALREADY_CLICKED') {
      return false;
    }
    throw error;
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a campaign is eligible for serving ads.
 */
export function isCampaignEligible(campaign: {
  status: string;
  budgetSpent: number;
  budgetTotal: number;
  startDate: Date | null;
  endDate: Date | null;
}): boolean {
  const now = new Date();

  // Must be active
  if (campaign.status !== 'ACTIVE') {
    return false;
  }

  // Must have budget
  if (campaign.budgetSpent >= campaign.budgetTotal) {
    return false;
  }

  // Check date range
  if (campaign.startDate && campaign.startDate > now) {
    return false;
  }

  if (campaign.endDate && campaign.endDate < now) {
    return false;
  }

  return true;
}

/**
 * Calculate remaining budget for a campaign.
 */
export function getRemainingBudget(campaign: {
  budgetTotal: number;
  budgetSpent: number;
}): number {
  return Math.max(0, campaign.budgetTotal - campaign.budgetSpent);
}

/**
 * Calculate estimated impressions remaining for a CPM campaign.
 */
export function getEstimatedImpressionsRemaining(campaign: {
  pricingModel: PricingModel;
  bidAmount: number;
  budgetTotal: number;
  budgetSpent: number;
}): number {
  if (campaign.pricingModel !== 'CPM') {
    return 0;
  }

  const remaining = getRemainingBudget(campaign);
  const costPer1000 = campaign.bidAmount;

  return Math.floor((remaining / costPer1000) * 1000);
}

/**
 * Calculate estimated clicks remaining for a CPC campaign.
 */
export function getEstimatedClicksRemaining(campaign: {
  pricingModel: PricingModel;
  bidAmount: number;
  budgetTotal: number;
  budgetSpent: number;
}): number {
  if (campaign.pricingModel !== 'CPC') {
    return 0;
  }

  const remaining = getRemainingBudget(campaign);
  const costPerClick = campaign.bidAmount;

  return Math.floor(remaining / costPerClick);
}

/**
 * Get cache statistics for monitoring.
 */
export function getCacheStats(): { cached: boolean; age: number | null; count: number } {
  if (!campaignCache) {
    return { cached: false, age: null, count: 0 };
  }

  return {
    cached: true,
    age: Date.now() - campaignCache.timestamp,
    count: campaignCache.campaigns.length,
  };
}

// =============================================================================
// EXPORTS FOR TESTING
// =============================================================================

export const __testExports = {
  weightedRandomSelect,
  getCachedCampaigns,
  invalidateCampaignCache,
  fetchActiveCampaigns,
};
