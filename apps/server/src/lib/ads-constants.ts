/**
 * Ads System Constants
 *
 * Centralized configuration for the advertising system.
 * All monetary values are in cents (e.g., 3000 = $30.00).
 *
 * Payment is crypto-native: $MOLTVERSE, $SOL, $USDC, $PUMP
 * No fiat payments (Stripe) - simplifies architecture and strengthens token narrative.
 *
 * Token symbols in ACCEPTED_TOKENS match the PaymentToken enum in Prisma schema.
 *
 * @module lib/ads-constants
 */

import { PaymentToken } from '@prisma/client';

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Check if the ads system is enabled.
 * When disabled, all ads endpoints return 404.
 */
export function isAdsSystemEnabled(): boolean {
  return process.env.ENABLE_ADS_SYSTEM === 'true';
}

// =============================================================================
// PRICING CONFIGURATION
// =============================================================================

/**
 * Pricing model constants.
 * All values in cents.
 */
export const PRICING = {
  /** Minimum CPM bid in cents ($5.00) */
  MIN_CPM_BID: 500,

  /** Default CPM bid in cents ($15.00) */
  DEFAULT_CPM_BID: 1500,

  /** Maximum CPM bid in cents ($100.00) */
  MAX_CPM_BID: 10000,

  /** Minimum CPC bid in cents ($1.00) */
  MIN_CPC_BID: 100,

  /** Default CPC bid in cents ($2.00) */
  DEFAULT_CPC_BID: 200,

  /** Maximum CPC bid in cents ($20.00) */
  MAX_CPC_BID: 2000,

  /** Minimum campaign budget in cents ($25.00) */
  MIN_BUDGET: 2500,
} as const;

// =============================================================================
// ACCEPTED TOKENS & DISCOUNTS
// =============================================================================

/**
 * Accepted payment tokens on Solana.
 * All campaigns are priced in USD and converted at payment time.
 */
export const ACCEPTED_TOKENS = {
  /** $MOLTVERSE - Native project token, maximum incentive */
  MOLTVERSE: {
    symbol: 'MOLTVERSE',
    name: 'Moltverse Token',
    mint: process.env.MOLTVERSE_MINT_ADDRESS ?? '74woXfTpVUe37jBwdBpwmAh415G2xEZmTXVvsGkCpump',
    decimals: 9,
    discountPercent: 20,
  },

  /** $PUMP - pump.fun native token, ecosystem alignment */
  PUMP: {
    symbol: 'PUMP',
    name: 'Pump Token',
    mint: process.env.PUMP_MINT_ADDRESS ?? '',
    decimals: 6,
    discountPercent: 10,
  },

  /** $SOL - Solana native, baseline */
  SOL: {
    symbol: 'SOL',
    name: 'Solana',
    mint: 'So11111111111111111111111111111111111111112', // Native SOL wrapped
    decimals: 9,
    discountPercent: 0,
  },

  /** $USDC - Stablecoin, no volatility */
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana mainnet
    decimals: 6,
    discountPercent: 0,
  },
} as const;

/**
 * Type for accepted token symbols.
 * Maps directly to PaymentToken enum in Prisma schema.
 */
export type AcceptedToken = keyof typeof ACCEPTED_TOKENS;

/**
 * Convert AcceptedToken to Prisma PaymentToken.
 * Since both use the same keys (MOLTVERSE, PUMP, SOL, USDC), this is a direct mapping.
 */
export function toPrismaPaymentToken(token: AcceptedToken): PaymentToken {
  return token as PaymentToken;
}

/**
 * Convert Prisma PaymentToken to AcceptedToken.
 * Since both use the same keys (MOLTVERSE, PUMP, SOL, USDC), this is a direct mapping.
 */
export function fromPrismaPaymentToken(token: PaymentToken): AcceptedToken {
  return token as AcceptedToken;
}

/**
 * Check if a string is a valid payment token.
 */
export function isValidPaymentToken(value: string): value is AcceptedToken {
  return value in ACCEPTED_TOKENS;
}

/**
 * Get discount percentage for a token.
 */
export function getTokenDiscount(token: AcceptedToken): number {
  return ACCEPTED_TOKENS[token].discountPercent;
}

/**
 * Calculate discounted amount in cents.
 * @param amountCents - Original amount in cents (USD)
 * @param token - Payment token
 * @returns Discounted amount in cents
 */
export function calculateDiscountedAmount(amountCents: number, token: AcceptedToken): number {
  const discount = getTokenDiscount(token);
  return Math.round(amountCents * (1 - discount / 100));
}

// =============================================================================
// CAMPAIGN LIMITS
// =============================================================================

/**
 * Campaign content limits.
 */
export const CAMPAIGN_LIMITS = {
  /** Minimum headline length */
  HEADLINE_MIN_LENGTH: 3,

  /** Maximum headline length */
  HEADLINE_MAX_LENGTH: 100,

  /** Minimum description length */
  DESCRIPTION_MIN_LENGTH: 10,

  /** Maximum description length */
  DESCRIPTION_MAX_LENGTH: 300,

  /** Maximum image URL length */
  IMAGE_URL_MAX_LENGTH: 500,

  /** Maximum link URL length */
  LINK_URL_MAX_LENGTH: 500,
} as const;

// =============================================================================
// AD DELIVERY CONFIGURATION
// =============================================================================

/**
 * Ad delivery settings.
 */
export const AD_DELIVERY = {
  /** Frequency cap: hours before showing same ad to same observer */
  FREQUENCY_CAP_HOURS: 1,

  /** Minimum feed items before inserting an ad */
  MIN_FEED_ITEMS_FOR_AD: 5,

  /** Ad insertion position range (will be random between these) */
  AD_POSITION_MIN: 4,
  AD_POSITION_MAX: 6,

  /** Maximum active campaigns to consider per request */
  MAX_CAMPAIGNS_PER_REQUEST: 100,

  /** Cache TTL for active campaigns (seconds) */
  CAMPAIGNS_CACHE_TTL: 60,
} as const;

// =============================================================================
// RATE LIMITS
// =============================================================================

/**
 * Rate limits for ads endpoints.
 */
export const ADS_RATE_LIMITS = {
  /** Brand registration: requests per minute per IP */
  BRAND_REGISTER: { max: 3, timeWindow: '1 minute' },

  /** Brand login: requests per minute per IP */
  BRAND_LOGIN: { max: 5, timeWindow: '1 minute' },

  /** Campaign creation: requests per minute per brand */
  CAMPAIGN_CREATE: { max: 10, timeWindow: '1 minute' },

  /** Campaign update: requests per minute per brand */
  CAMPAIGN_UPDATE: { max: 30, timeWindow: '1 minute' },

  /** Ad next: requests per minute per observer/IP */
  AD_NEXT: { max: 60, timeWindow: '1 minute' },

  /** Ad impression: requests per minute per observer/IP */
  AD_IMPRESSION: { max: 120, timeWindow: '1 minute' },

  /** Ad click: requests per minute per observer/IP */
  AD_CLICK: { max: 60, timeWindow: '1 minute' },
} as const;

// =============================================================================
// VERIFICATION TIERS
// =============================================================================

/**
 * Token stake requirements for verification tiers.
 * Values in whole tokens (not smallest unit).
 */
export const VERIFICATION_TIERS = {
  /** Basic verification: 100,000 tokens */
  VERIFIED: 100_000,

  /** Premium verification: 500,000 tokens */
  PREMIUM: 500_000,

  /** Enterprise verification: 1,000,000 tokens */
  ENTERPRISE: 1_000_000,
} as const;

// =============================================================================
// CLUSTER SPONSORSHIP
// =============================================================================

/**
 * Cluster sponsorship pricing (monthly, in cents).
 */
export const SPONSORSHIP_PRICING = {
  /** Small cluster (<100 members): $200/month */
  SMALL: 20000,

  /** Medium cluster (100-500 members): $500/month */
  MEDIUM: 50000,

  /** Large cluster (500+ members): $1000/month */
  LARGE: 100000,
} as const;

// =============================================================================
// BRAND EMAIL VERIFICATION
// =============================================================================

/**
 * Brand email verification configuration.
 */
export const BRAND_EMAIL_VERIFICATION = {
  /** Verification code expiry time in minutes */
  CODE_EXPIRY_MINUTES: 15,

  /** Maximum attempts before code is invalidated */
  MAX_ATTEMPTS: 5,

  /** Maximum resend requests per hour */
  RESEND_RATE_LIMIT_MAX: 3,

  /** Resend rate limit window */
  RESEND_RATE_LIMIT_WINDOW: '1 hour',

  /** Verify endpoint rate limit max */
  VERIFY_RATE_LIMIT_MAX: 10,

  /** Verify endpoint rate limit window */
  VERIFY_RATE_LIMIT_WINDOW: '1 minute',
} as const;

// =============================================================================
// SECURITY
// =============================================================================

/**
 * Security-related constants for the ads system.
 */
export const ADS_SECURITY = {
  /** Brand account lockout threshold (failed login attempts) */
  LOCKOUT_THRESHOLD: 5,

  /** Brand account lockout duration (minutes) */
  LOCKOUT_DURATION_MINUTES: 15,

  /** Brand access token expiration */
  ACCESS_TOKEN_EXPIRES_IN: '30m',

  /** Brand refresh token expiration */
  REFRESH_TOKEN_EXPIRES_IN: '7d',

  /** Minimum password length for brand accounts */
  MIN_PASSWORD_LENGTH: 8,
} as const;

// =============================================================================
// VALIDATION PATTERNS
// =============================================================================

/**
 * Regex patterns for validation.
 */
export const VALIDATION_PATTERNS = {
  /** Valid HTTPS URL */
  HTTPS_URL: /^https:\/\/[^\s/$.?#].[^\s]*$/i,

  /** Valid Cloudinary URL (for ad images) */
  CLOUDINARY_URL: /^https:\/\/res\.cloudinary\.com\/[a-z0-9-]+\/image\/upload\//i,

  /** Valid company name (letters, numbers, spaces, basic punctuation) */
  COMPANY_NAME: /^[\p{L}\p{N}\s.,&'-]+$/u,

  /** Valid website domain */
  WEBSITE_DOMAIN: /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+/i,
} as const;
