/**
 * Hook to intercalate ads in feed items
 *
 * Features:
 * - Fetches next ad from API with retry logic (exponential backoff)
 * - Session-level cache to prevent redundant API calls
 * - Stable ad position (doesn't jump when feed updates)
 * - Respects VITE_ENABLE_ADS feature flag
 * - Returns unchanged items if ads disabled or no ad available
 *
 * @module hooks/useFeedWithAds
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { AdCandidate, AdNextResponse, FeedItem, LiveEvent } from '../types';
import { adLogger } from '../lib/ad-logger';
import {
  ADS_ENABLED,
  API_URL,
  MIN_ITEMS_FOR_AD,
  AD_POSITION_MIN,
  AD_POSITION_MAX,
  MAX_RETRIES,
  INITIAL_RETRY_DELAY_MS,
  CACHE_TTL_MS,
} from '../lib/ad-config';

// =============================================================================
// SESSION CACHE
// =============================================================================

interface AdCache {
  ad: AdCandidate | null;
  timestamp: number;
  position: number;
}

// Session-level cache (survives component remounts but not page refresh)
let sessionCache: AdCache | null = null;

/**
 * Get cached ad if still valid
 */
function getCachedAd(): AdCache | null {
  if (!sessionCache) return null;

  const age = Date.now() - sessionCache.timestamp;
  if (age >= CACHE_TTL_MS) {
    sessionCache = null;
    return null;
  }

  return sessionCache;
}

/**
 * Set ad in cache with stable position
 */
function setCachedAd(ad: AdCandidate | null): AdCache {
  const position = AD_POSITION_MIN + Math.floor(Math.random() * (AD_POSITION_MAX - AD_POSITION_MIN + 1));

  sessionCache = {
    ad,
    timestamp: Date.now(),
    position,
  };

  return sessionCache;
}

/**
 * Invalidate cache (called when ad is exhausted)
 */
export function invalidateAdCache(): void {
  sessionCache = null;
}

/**
 * Get cache stats for monitoring
 */
export function getAdCacheStats(): { cached: boolean; age: number | null } {
  if (!sessionCache) {
    return { cached: false, age: null };
  }
  return {
    cached: true,
    age: Date.now() - sessionCache.timestamp,
  };
}

// =============================================================================
// RETRY LOGIC
// =============================================================================

/**
 * Fetch with exponential backoff retry
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Don't retry on 4xx errors (client errors)
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // Retry on 5xx errors
      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        adLogger.warn('ad_fetch_retry', {
          attempt: attempt + 1,
          maxRetries,
          delay,
          error: lastError.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// =============================================================================
// HOOK
// =============================================================================

interface UseFeedWithAdsOptions {
  /** Whether to fetch a new ad (set false to disable temporarily) */
  enabled?: boolean;
}

interface UseFeedWithAdsReturn<T> {
  /** Feed items with ads intercalated */
  items: FeedItem<T>[];
  /** The current ad being shown (if any) */
  currentAd: AdCandidate | null;
  /** Whether an ad is being loaded */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch a new ad (invalidates cache) */
  refetchAd: () => void;
}

/**
 * Hook to intercalate ads in feed items.
 *
 * Usage:
 * ```tsx
 * const { items, currentAd, isLoading, error } = useFeedWithAds(feedEvents);
 *
 * return (
 *   <div>
 *     {items.map((item) =>
 *       item.type === 'ad' ? (
 *         <FeedAd key={`ad-${(item.data as AdCandidate).id}`} campaign={item.data as AdCandidate} />
 *       ) : (
 *         <EventCard key={(item.data as LiveEvent).id} event={item.data as LiveEvent} />
 *       )
 *     )}
 *   </div>
 * );
 * ```
 */
export function useFeedWithAds<T = LiveEvent>(
  feedItems: T[],
  options: UseFeedWithAdsOptions = {}
): UseFeedWithAdsReturn<T> {
  const { enabled = true } = options;

  const [cachedData, setCachedData] = useState<AdCache | null>(() => getCachedAd());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const isMountedRef = useRef(true);

  // Check if ads are enabled (feature flag + options)
  const adsEnabled = ADS_ENABLED && enabled;

  // Fetch next ad from API with retry and caching
  const fetchNextAd = useCallback(async (forceRefresh: boolean = false) => {
    if (!adsEnabled) {
      setCachedData(null);
      return;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCachedAd();
      if (cached) {
        adLogger.debug('ad_cache_hit', { age: Date.now() - cached.timestamp });
        setCachedData(cached);
        return;
      }
    } else {
      invalidateAdCache();
    }

    setIsLoading(true);
    setError(null);

    const startTime = Date.now();

    try {
      const response = await fetchWithRetry(
        `${API_URL}/api/v1/ads/next`,
        {
          method: 'GET',
          credentials: 'include',
        }
      );

      if (!isMountedRef.current) return;

      if (!response.ok) {
        // 404 means ads system disabled or no ads - not an error
        if (response.status === 404) {
          const cache = setCachedAd(null);
          setCachedData(cache);
          adLogger.debug('ad_fetch_none', { duration: Date.now() - startTime });
          return;
        }

        throw new Error(`HTTP ${response.status}`);
      }

      const data: AdNextResponse = await response.json();
      const cache = setCachedAd(data.ad);
      setCachedData(cache);

      adLogger.info('ad_fetch_success', {
        duration: Date.now() - startTime,
        hasAd: data.ad !== null,
        adId: data.ad?.id ?? null,
        position: cache.position,
      });
    } catch (err) {
      if (!isMountedRef.current) return;

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);

      adLogger.error('ad_fetch_failed', {
        duration: Date.now() - startTime,
        error: errorMessage,
      });

      // Set empty cache to prevent infinite retries
      const cache = setCachedAd(null);
      setCachedData(cache);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [adsEnabled]);

  // Track mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch ad on mount and when trigger changes
  useEffect(() => {
    fetchNextAd(fetchTrigger > 0);
  }, [fetchNextAd, fetchTrigger]);

  // Function to refetch ad (invalidates cache)
  const refetchAd = useCallback(() => {
    setFetchTrigger((prev) => prev + 1);
  }, []);

  // Memoized items with ad intercalated at STABLE position
  const items = useMemo((): FeedItem<T>[] => {
    // If ads disabled, no ad available, or not enough items, return original items
    if (!adsEnabled || !cachedData?.ad || feedItems.length < MIN_ITEMS_FOR_AD) {
      return feedItems.map((item) => ({
        type: 'event' as const,
        data: item,
      }));
    }

    // Convert feed items to FeedItem format
    const result: FeedItem<T>[] = feedItems.map((item) => ({
      type: 'event' as const,
      data: item,
    }));

    // Use STABLE position from cache (doesn't change when feed updates)
    const adPosition = Math.min(cachedData.position, result.length - 1);

    // Insert ad at stable position
    result.splice(adPosition, 0, {
      type: 'ad' as const,
      data: cachedData.ad,
    });

    return result;
  }, [feedItems, cachedData, adsEnabled]);

  return {
    items,
    currentAd: cachedData?.ad ?? null,
    isLoading,
    error,
    refetchAd,
  };
}
