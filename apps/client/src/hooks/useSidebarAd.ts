/**
 * Hook for managing sidebar ad slot content
 *
 * Priority system:
 * 1. Active campaign (from API)
 * 2. Context-aware animation (based on user clusters, time)
 * 3. Random animation fallback
 *
 * @module hooks/useSidebarAd
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdCandidate, SidebarSlotContent } from '../types';
import { useAdTracking } from './useAdTracking';
import { adLogger } from '../lib/ad-logger';
import { API_URL, ADS_ENABLED } from '../lib/ad-config';
import {
  getAnimationForContext,
  getAnimationConfig,
  buildUserContext,
  type AnimationId,
} from '../lib/sidebar-animations';

// =============================================================================
// TYPES
// =============================================================================

interface UseSidebarAdOptions {
  /** User's clusters for context-aware animation selection */
  clusters?: Array<{ id: string; title: string }>;
  /** User's country code */
  country?: string;
  /** Language locale */
  language?: string;
  /** Whether to auto-fetch on mount (default: true) */
  autoFetch?: boolean;
}

interface UseSidebarAdReturn {
  /** Content to display (campaign or animation) */
  content: SidebarSlotContent | null;
  /** Whether content is loading */
  isLoading: boolean;
  /** Error if fetch failed */
  error: Error | null;
  /** Track impression when ad becomes visible */
  trackImpression: () => Promise<string | null>;
  /** Track click when ad is clicked */
  trackClick: () => Promise<boolean>;
  /** Refresh content (fetch new ad or select new animation) */
  refresh: () => void;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for managing the sidebar ad slot.
 *
 * Usage:
 * ```tsx
 * const { content, isLoading, trackImpression, trackClick } = useSidebarAd({
 *   clusters: user.clusters,
 *   country: user.country,
 * });
 *
 * if (content?.type === 'campaign') {
 *   return <AdCreative campaign={content.campaign} />;
 * }
 * return <AnimationDisplay animation={content?.animation} />;
 * ```
 */
export function useSidebarAd(options: UseSidebarAdOptions = {}): UseSidebarAdReturn {
  const { t } = useTranslation();
  const { clusters, country, language, autoFetch = true } = options;

  const [content, setContent] = useState<SidebarSlotContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { trackImpression: trackAdImpression, trackClick: trackAdClick } = useAdTracking();

  // Store current campaign ID for impression tracking
  const currentCampaignIdRef = useRef<string | null>(null);
  const impressionIdRef = useRef<string | null>(null);

  /**
   * Load animation data and set as content
   */
  const loadAnimation = useCallback(async (animationId: AnimationId) => {
    try {
      const config = getAnimationConfig(animationId);
      const animationData = await config.import();

      setContent({
        type: 'animation',
        animation: {
          id: animationId,
          animationType: config.type,
          data: animationData.default,
          tagline: t(config.taglineKey),
        },
      });

      adLogger.debug('sidebar_animation_loaded', { animationId, animationType: config.type });
    } catch (err) {
      adLogger.error('sidebar_animation_failed', {
        animationId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      setError(err instanceof Error ? err : new Error('Failed to load animation'));
    }
  }, [t]);

  /**
   * Fetch ad from API and handle fallback to animation
   */
  const fetchSidebarAd = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    currentCampaignIdRef.current = null;
    impressionIdRef.current = null;

    // If ads are disabled, go straight to animation
    if (!ADS_ENABLED) {
      const ctx = buildUserContext({ clusters, country, language });
      const animationId = getAnimationForContext(ctx);
      await loadAnimation(animationId);
      setIsLoading(false);
      return;
    }

    const startTime = Date.now();

    try {
      const response = await fetch(`${API_URL}/api/v1/ads/next?slot=sidebar`, {
        method: 'GET',
        credentials: 'include',
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        adLogger.warn('sidebar_ad_fetch_failed', {
          duration,
          status: response.status,
        });

        // Fallback to animation
        const ctx = buildUserContext({ clusters, country, language });
        const animationId = getAnimationForContext(ctx);
        await loadAnimation(animationId);
        setIsLoading(false);
        return;
      }

      const data: { ad: AdCandidate | null } = await response.json();

      if (data.ad) {
        // Campaign available
        currentCampaignIdRef.current = data.ad.id;
        setContent({
          type: 'campaign',
          campaign: data.ad,
        });

        adLogger.info('sidebar_ad_loaded', {
          campaignId: data.ad.id,
          duration,
        });
      } else {
        // No campaign, use animation
        adLogger.debug('sidebar_ad_none', { duration });

        const ctx = buildUserContext({ clusters, country, language });
        const animationId = getAnimationForContext(ctx);
        await loadAnimation(animationId);
      }
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      adLogger.error('sidebar_ad_fetch_error', {
        duration,
        error: errorMessage,
      });

      // Fallback to animation on error
      const ctx = buildUserContext({ clusters, country, language });
      const animationId = getAnimationForContext(ctx);
      await loadAnimation(animationId);
    } finally {
      setIsLoading(false);
    }
  }, [clusters, country, language, loadAnimation]);

  /**
   * Track impression for the current campaign
   */
  const trackImpression = useCallback(async (): Promise<string | null> => {
    if (content?.type !== 'campaign' || !currentCampaignIdRef.current) {
      return null;
    }

    // Don't track if already tracked
    if (impressionIdRef.current) {
      return impressionIdRef.current;
    }

    const impressionId = await trackAdImpression(currentCampaignIdRef.current);
    impressionIdRef.current = impressionId;
    return impressionId;
  }, [content, trackAdImpression]);

  /**
   * Track click for the current impression
   */
  const trackClick = useCallback(async (): Promise<boolean> => {
    if (!impressionIdRef.current) {
      // Track impression first if not already tracked
      const impressionId = await trackImpression();
      if (!impressionId) {
        return false;
      }
    }

    if (!impressionIdRef.current) {
      return false;
    }

    return trackAdClick(impressionIdRef.current);
  }, [trackImpression, trackAdClick]);

  /**
   * Refresh content
   */
  const refresh = useCallback(() => {
    fetchSidebarAd();
  }, [fetchSidebarAd]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchSidebarAd();
    }
  }, [autoFetch, fetchSidebarAd]);

  return {
    content,
    isLoading,
    error,
    trackImpression,
    trackClick,
    refresh,
  };
}
