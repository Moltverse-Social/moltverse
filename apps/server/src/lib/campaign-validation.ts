/**
 * Campaign Validation Utilities
 *
 * Validates campaign creation and update payloads.
 * Uses constants from ads-constants.ts for consistent limits.
 *
 * @module lib/campaign-validation
 */

import { PricingModel, PaymentToken, CampaignStatus, AdSlotType } from '@prisma/client';
import {
  PRICING,
  CAMPAIGN_LIMITS,
  VALIDATION_PATTERNS,
  isValidPaymentToken,
} from './ads-constants.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CampaignCreateInput {
  headline: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
  pricingModel?: PricingModel;
  slotType?: AdSlotType;
  bidAmount: number;
  budgetTotal: number;
  paymentToken?: PaymentToken;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface CampaignUpdateInput {
  headline?: string;
  description?: string;
  imageUrl?: string;
  linkUrl?: string;
  pricingModel?: PricingModel;
  slotType?: AdSlotType;
  bidAmount?: number;
  budgetTotal?: number;
  paymentToken?: PaymentToken;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface ValidationResult<T> {
  valid: true;
  data: T;
}

export interface ValidationError {
  valid: false;
  error: string;
  field?: string;
}

// =============================================================================
// FIELD VALIDATORS
// =============================================================================

/**
 * Validate headline field
 */
function validateHeadline(value: unknown): string | null {
  if (typeof value !== 'string') {
    return 'headline must be a string';
  }

  const trimmed = value.trim();

  if (trimmed.length < CAMPAIGN_LIMITS.HEADLINE_MIN_LENGTH) {
    return `headline must be at least ${CAMPAIGN_LIMITS.HEADLINE_MIN_LENGTH} characters`;
  }

  if (trimmed.length > CAMPAIGN_LIMITS.HEADLINE_MAX_LENGTH) {
    return `headline must not exceed ${CAMPAIGN_LIMITS.HEADLINE_MAX_LENGTH} characters`;
  }

  return null;
}

/**
 * Validate description field
 */
function validateDescription(value: unknown): string | null {
  if (typeof value !== 'string') {
    return 'description must be a string';
  }

  const trimmed = value.trim();

  if (trimmed.length < CAMPAIGN_LIMITS.DESCRIPTION_MIN_LENGTH) {
    return `description must be at least ${CAMPAIGN_LIMITS.DESCRIPTION_MIN_LENGTH} characters`;
  }

  if (trimmed.length > CAMPAIGN_LIMITS.DESCRIPTION_MAX_LENGTH) {
    return `description must not exceed ${CAMPAIGN_LIMITS.DESCRIPTION_MAX_LENGTH} characters`;
  }

  return null;
}

/**
 * Validate imageUrl field (required for creation)
 */
function validateImageUrlRequired(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return 'imageUrl is required';
  }

  if (typeof value !== 'string') {
    return 'imageUrl must be a string';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 'imageUrl is required';
  }

  if (trimmed.length > CAMPAIGN_LIMITS.IMAGE_URL_MAX_LENGTH) {
    return `imageUrl must not exceed ${CAMPAIGN_LIMITS.IMAGE_URL_MAX_LENGTH} characters`;
  }

  if (!VALIDATION_PATTERNS.HTTPS_URL.test(trimmed)) {
    return 'imageUrl must be a valid HTTPS URL';
  }

  return null;
}

/**
 * Validate imageUrl field (optional for updates)
 */
function validateImageUrlOptional(value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return null; // Optional field
  }

  if (typeof value !== 'string') {
    return 'imageUrl must be a string';
  }

  if (value.length > CAMPAIGN_LIMITS.IMAGE_URL_MAX_LENGTH) {
    return `imageUrl must not exceed ${CAMPAIGN_LIMITS.IMAGE_URL_MAX_LENGTH} characters`;
  }

  if (!VALIDATION_PATTERNS.HTTPS_URL.test(value)) {
    return 'imageUrl must be a valid HTTPS URL';
  }

  return null;
}

/**
 * Validate linkUrl field (required)
 */
function validateLinkUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return 'linkUrl is required';
  }

  if (value.length > CAMPAIGN_LIMITS.LINK_URL_MAX_LENGTH) {
    return `linkUrl must not exceed ${CAMPAIGN_LIMITS.LINK_URL_MAX_LENGTH} characters`;
  }

  if (!VALIDATION_PATTERNS.HTTPS_URL.test(value)) {
    return 'linkUrl must be a valid HTTPS URL';
  }

  return null;
}

/**
 * Validate pricingModel field
 */
function validatePricingModel(value: unknown): string | null {
  if (value === undefined) {
    return null; // Will use default (CPM)
  }

  if (value !== 'CPM' && value !== 'CPC') {
    return 'pricingModel must be CPM or CPC';
  }

  return null;
}

/**
 * Validate slotType field
 */
function validateSlotType(value: unknown): string | null {
  if (value === undefined) {
    return null; // Will use default (FEED)
  }

  if (value !== 'FEED' && value !== 'SIDEBAR') {
    return 'slotType must be FEED or SIDEBAR';
  }

  return null;
}

/**
 * Validate bidAmount field based on pricing model
 */
function validateBidAmount(value: unknown, pricingModel: PricingModel): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return 'bidAmount must be an integer (cents)';
  }

  if (value < 0) {
    return 'bidAmount must be positive';
  }

  if (pricingModel === 'CPM') {
    if (value < PRICING.MIN_CPM_BID) {
      return `CPM bid must be at least ${PRICING.MIN_CPM_BID} cents ($${(PRICING.MIN_CPM_BID / 100).toFixed(2)})`;
    }
    if (value > PRICING.MAX_CPM_BID) {
      return `CPM bid must not exceed ${PRICING.MAX_CPM_BID} cents ($${(PRICING.MAX_CPM_BID / 100).toFixed(2)})`;
    }
  } else {
    // CPC
    if (value < PRICING.MIN_CPC_BID) {
      return `CPC bid must be at least ${PRICING.MIN_CPC_BID} cents ($${(PRICING.MIN_CPC_BID / 100).toFixed(2)})`;
    }
    if (value > PRICING.MAX_CPC_BID) {
      return `CPC bid must not exceed ${PRICING.MAX_CPC_BID} cents ($${(PRICING.MAX_CPC_BID / 100).toFixed(2)})`;
    }
  }

  return null;
}

/**
 * Validate budgetTotal field
 */
function validateBudgetTotal(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return 'budgetTotal must be an integer (cents)';
  }

  if (value < PRICING.MIN_BUDGET) {
    return `budgetTotal must be at least ${PRICING.MIN_BUDGET} cents ($${(PRICING.MIN_BUDGET / 100).toFixed(2)})`;
  }

  return null;
}

/**
 * Validate paymentToken field
 */
function validatePaymentToken(value: unknown): string | null {
  if (value === undefined) {
    return null; // Will use default (USDC)
  }

  if (typeof value !== 'string') {
    return 'paymentToken must be a string';
  }

  if (!isValidPaymentToken(value)) {
    return 'paymentToken must be MOLTVERSE, PUMP, SOL, or USDC';
  }

  return null;
}

/**
 * Validate startDate field
 */
function validateStartDate(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null; // Optional field
  }

  // Allow ISO string or Date object
  let date: Date;
  if (typeof value === 'string') {
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  } else {
    return 'startDate must be a valid date string or Date object';
  }

  if (isNaN(date.getTime())) {
    return 'startDate must be a valid date';
  }

  // Start date should be in the future (or today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date < today) {
    return 'startDate cannot be in the past';
  }

  return null;
}

/**
 * Validate endDate field
 */
function validateEndDate(value: unknown, startDate: Date | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null; // Optional field
  }

  // Allow ISO string or Date object
  let date: Date;
  if (typeof value === 'string') {
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  } else {
    return 'endDate must be a valid date string or Date object';
  }

  if (isNaN(date.getTime())) {
    return 'endDate must be a valid date';
  }

  // End date should be in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date < today) {
    return 'endDate cannot be in the past';
  }

  // End date should be after start date
  if (startDate) {
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    if (date <= start) {
      return 'endDate must be after startDate';
    }
  }

  return null;
}

// =============================================================================
// DATE PARSING HELPER
// =============================================================================

/**
 * Parse date from input (string or Date)
 */
function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
}

// =============================================================================
// MAIN VALIDATORS
// =============================================================================

/**
 * Validate campaign creation input
 */
export function validateCampaignCreate(
  body: unknown
): ValidationResult<CampaignCreateInput> | ValidationError {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const input = body as Record<string, unknown>;

  // Required fields
  const headlineError = validateHeadline(input.headline);
  if (headlineError) {
    return { valid: false, error: headlineError, field: 'headline' };
  }

  const descriptionError = validateDescription(input.description);
  if (descriptionError) {
    return { valid: false, error: descriptionError, field: 'description' };
  }

  const linkUrlError = validateLinkUrl(input.linkUrl);
  if (linkUrlError) {
    return { valid: false, error: linkUrlError, field: 'linkUrl' };
  }

  const imageUrlError = validateImageUrlRequired(input.imageUrl);
  if (imageUrlError) {
    return { valid: false, error: imageUrlError, field: 'imageUrl' };
  }

  const pricingModelError = validatePricingModel(input.pricingModel);
  if (pricingModelError) {
    return { valid: false, error: pricingModelError, field: 'pricingModel' };
  }

  const slotTypeError = validateSlotType(input.slotType);
  if (slotTypeError) {
    return { valid: false, error: slotTypeError, field: 'slotType' };
  }

  const pricingModel: PricingModel =
    input.pricingModel === 'CPC' ? 'CPC' : 'CPM';

  const slotType: AdSlotType =
    input.slotType === 'SIDEBAR' ? 'SIDEBAR' : 'FEED';

  const bidAmountError = validateBidAmount(input.bidAmount, pricingModel);
  if (bidAmountError) {
    return { valid: false, error: bidAmountError, field: 'bidAmount' };
  }

  const budgetTotalError = validateBudgetTotal(input.budgetTotal);
  if (budgetTotalError) {
    return { valid: false, error: budgetTotalError, field: 'budgetTotal' };
  }

  const paymentTokenError = validatePaymentToken(input.paymentToken);
  if (paymentTokenError) {
    return { valid: false, error: paymentTokenError, field: 'paymentToken' };
  }

  const startDate = parseDate(input.startDate);
  const startDateError = validateStartDate(input.startDate);
  if (startDateError) {
    return { valid: false, error: startDateError, field: 'startDate' };
  }

  const endDateError = validateEndDate(input.endDate, startDate);
  if (endDateError) {
    return { valid: false, error: endDateError, field: 'endDate' };
  }

  return {
    valid: true,
    data: {
      headline: (input.headline as string).trim(),
      description: (input.description as string).trim(),
      imageUrl: (input.imageUrl as string).trim(),
      linkUrl: (input.linkUrl as string).trim(),
      pricingModel,
      slotType,
      bidAmount: input.bidAmount as number,
      budgetTotal: input.budgetTotal as number,
      paymentToken: (input.paymentToken as PaymentToken) ?? 'USDC',
      startDate,
      endDate: parseDate(input.endDate),
    },
  };
}

/**
 * Validate campaign update input
 * Only validates fields that are present
 */
export function validateCampaignUpdate(
  body: unknown,
  currentPricingModel: PricingModel
): ValidationResult<CampaignUpdateInput> | ValidationError {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const input = body as Record<string, unknown>;
  const result: CampaignUpdateInput = {};

  // Validate headline if provided
  if (input.headline !== undefined) {
    const error = validateHeadline(input.headline);
    if (error) {
      return { valid: false, error, field: 'headline' };
    }
    result.headline = (input.headline as string).trim();
  }

  // Validate description if provided
  if (input.description !== undefined) {
    const error = validateDescription(input.description);
    if (error) {
      return { valid: false, error, field: 'description' };
    }
    result.description = (input.description as string).trim();
  }

  // Validate imageUrl if provided (required field, cannot be removed)
  if (input.imageUrl !== undefined) {
    if (input.imageUrl === null || input.imageUrl === '') {
      return { valid: false, error: 'imageUrl cannot be removed (required field)', field: 'imageUrl' };
    }
    const error = validateImageUrlOptional(input.imageUrl);
    if (error) {
      return { valid: false, error, field: 'imageUrl' };
    }
    result.imageUrl = (input.imageUrl as string).trim();
  }

  // Validate linkUrl if provided
  if (input.linkUrl !== undefined) {
    const error = validateLinkUrl(input.linkUrl);
    if (error) {
      return { valid: false, error, field: 'linkUrl' };
    }
    result.linkUrl = (input.linkUrl as string).trim();
  }

  // Validate pricingModel if provided
  if (input.pricingModel !== undefined) {
    const error = validatePricingModel(input.pricingModel);
    if (error) {
      return { valid: false, error, field: 'pricingModel' };
    }
    result.pricingModel = input.pricingModel as PricingModel;
  }

  // Validate slotType if provided
  if (input.slotType !== undefined) {
    const error = validateSlotType(input.slotType);
    if (error) {
      return { valid: false, error, field: 'slotType' };
    }
    result.slotType = input.slotType as AdSlotType;
  }

  // Determine which pricing model to use for bid validation
  const effectivePricingModel = result.pricingModel ?? currentPricingModel;

  // Validate bidAmount if provided
  if (input.bidAmount !== undefined) {
    const error = validateBidAmount(input.bidAmount, effectivePricingModel);
    if (error) {
      return { valid: false, error, field: 'bidAmount' };
    }
    result.bidAmount = input.bidAmount as number;
  }

  // Validate budgetTotal if provided
  if (input.budgetTotal !== undefined) {
    const error = validateBudgetTotal(input.budgetTotal);
    if (error) {
      return { valid: false, error, field: 'budgetTotal' };
    }
    result.budgetTotal = input.budgetTotal as number;
  }

  // Validate paymentToken if provided
  if (input.paymentToken !== undefined) {
    const error = validatePaymentToken(input.paymentToken);
    if (error) {
      return { valid: false, error, field: 'paymentToken' };
    }
    result.paymentToken = input.paymentToken as PaymentToken;
  }

  // Validate startDate if provided (can be null to remove)
  if (input.startDate !== undefined) {
    if (input.startDate === null) {
      result.startDate = null;
    } else {
      const error = validateStartDate(input.startDate);
      if (error) {
        return { valid: false, error, field: 'startDate' };
      }
      result.startDate = parseDate(input.startDate);
    }
  }

  // Validate endDate if provided (can be null to remove)
  if (input.endDate !== undefined) {
    if (input.endDate === null) {
      result.endDate = null;
    } else {
      // For end date validation, we need the effective start date
      const effectiveStartDate = result.startDate !== undefined
        ? result.startDate
        : undefined;

      const error = validateEndDate(input.endDate, effectiveStartDate);
      if (error) {
        return { valid: false, error, field: 'endDate' };
      }
      result.endDate = parseDate(input.endDate);
    }
  }

  // Check that at least one field was provided
  if (Object.keys(result).length === 0) {
    return { valid: false, error: 'At least one field must be provided for update' };
  }

  return { valid: true, data: result };
}

// =============================================================================
// STATUS TRANSITION VALIDATION
// =============================================================================

/**
 * Valid status transitions for campaigns
 */
export const VALID_STATUS_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['PENDING_REVIEW'],
  PENDING_REVIEW: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['PAUSED', 'COMPLETED'],
  PAUSED: ['ACTIVE', 'COMPLETED'],
  COMPLETED: [],
  REJECTED: ['DRAFT'],
};

/**
 * Check if a status transition is valid
 */
export function isValidStatusTransition(
  from: CampaignStatus,
  to: CampaignStatus
): boolean {
  return VALID_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Get allowed transitions from a status
 */
export function getAllowedTransitions(status: CampaignStatus): CampaignStatus[] {
  return VALID_STATUS_TRANSITIONS[status];
}
