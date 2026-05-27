/**
 * Ad system configuration
 *
 * Centralizes ad-related configuration and feature flags.
 * This module can be mocked in tests to control behavior.
 *
 * @module lib/ad-config
 */

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Whether the ads system is enabled.
 * Controlled by VITE_ENABLE_ADS environment variable.
 */
export const ADS_ENABLED = import.meta.env.VITE_ENABLE_ADS === 'true';

// =============================================================================
// API CONFIGURATION
// =============================================================================

/**
 * Base URL for API calls.
 */
export const API_URL = import.meta.env.VITE_API_URL || '';

// =============================================================================
// FEED CONFIGURATION
// =============================================================================

/**
 * Minimum number of feed items required to show an ad.
 */
export const MIN_ITEMS_FOR_AD = 5;

/**
 * Minimum position for ad insertion (0-indexed).
 */
export const AD_POSITION_MIN = 4;

/**
 * Maximum position for ad insertion (0-indexed).
 */
export const AD_POSITION_MAX = 6;

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

/**
 * Maximum number of retry attempts for failed requests.
 */
export const MAX_RETRIES = 3;

/**
 * Initial delay in milliseconds before first retry.
 * Subsequent retries use exponential backoff (1s, 2s, 4s).
 */
export const INITIAL_RETRY_DELAY_MS = 1000;

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

/**
 * Time-to-live for ad cache in milliseconds.
 * Matches backend cache TTL (60 seconds).
 */
export const CACHE_TTL_MS = 60 * 1000;

// =============================================================================
// IMPRESSION TRACKING CONFIGURATION
// =============================================================================

/**
 * Time in milliseconds that an ad must be visible before counting as impression.
 */
export const IMPRESSION_DELAY_MS = 1000;

/**
 * Minimum visibility ratio (0-1) for IntersectionObserver.
 * 0.5 = 50% of the ad must be visible.
 */
export const VISIBILITY_THRESHOLD = 0.5;
