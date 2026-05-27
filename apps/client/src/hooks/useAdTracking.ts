/**
 * Hook for tracking ad impressions and clicks
 *
 * Provides functions to:
 * - Record an impression when an ad is viewed (50% visible for 1s)
 * - Record a click when an ad is clicked
 *
 * Features:
 * - Graceful error handling (errors don't break UX)
 * - Structured logging for monitoring
 * - Loading state tracking
 *
 * @module hooks/useAdTracking
 */

import { useCallback, useState } from 'react';
import type { AdImpressionResponse, AdClickResponse } from '../types';
import { adLogger } from '../lib/ad-logger';
import { API_URL } from '../lib/ad-config';

interface UseAdTrackingReturn {
  /**
   * Record an impression for a campaign.
   * Returns the impression ID if successful, null if failed.
   */
  trackImpression: (campaignId: string) => Promise<string | null>;

  /**
   * Record a click for an impression.
   * Returns true if successful, false if failed.
   */
  trackClick: (impressionId: string) => Promise<boolean>;

  /**
   * Whether an impression is currently being tracked
   */
  isTrackingImpression: boolean;

  /**
   * Whether a click is currently being tracked
   */
  isTrackingClick: boolean;
}

/**
 * Hook for tracking ad impressions and clicks.
 *
 * Usage:
 * ```tsx
 * const { trackImpression, trackClick, isTrackingImpression } = useAdTracking();
 *
 * // When ad is 50% visible for 1 second
 * const impressionId = await trackImpression(campaign.id);
 *
 * // When user clicks the ad
 * if (impressionId) {
 *   await trackClick(impressionId);
 * }
 * ```
 */
export function useAdTracking(): UseAdTrackingReturn {
  const [isTrackingImpression, setIsTrackingImpression] = useState(false);
  const [isTrackingClick, setIsTrackingClick] = useState(false);

  const trackImpression = useCallback(async (campaignId: string): Promise<string | null> => {
    setIsTrackingImpression(true);
    const startTime = Date.now();

    try {
      const response = await fetch(`${API_URL}/api/v1/ads/impression`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ campaignId }),
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        // Campaign might be exhausted or inactive - this is expected behavior
        if (response.status === 404) {
          adLogger.debug('ad_impression_failed', {
            campaignId,
            duration,
            reason: 'campaign_unavailable',
            status: 404,
          });
          return null;
        }

        adLogger.warn('ad_impression_failed', {
          campaignId,
          duration,
          reason: 'http_error',
          status: response.status,
        });
        return null;
      }

      const data: AdImpressionResponse = await response.json();

      adLogger.info('ad_impression', {
        campaignId,
        impressionId: data.impressionId,
        duration,
      });

      return data.impressionId;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      adLogger.error('ad_impression_failed', {
        campaignId,
        duration,
        reason: 'network_error',
        error: errorMessage,
      });

      return null;
    } finally {
      setIsTrackingImpression(false);
    }
  }, []);

  const trackClick = useCallback(async (impressionId: string): Promise<boolean> => {
    setIsTrackingClick(true);
    const startTime = Date.now();

    try {
      const response = await fetch(`${API_URL}/api/v1/ads/click`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ impressionId }),
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        // Already clicked or impression not found - this is expected behavior
        if (response.status === 404) {
          adLogger.debug('ad_click_failed', {
            impressionId,
            duration,
            reason: 'impression_unavailable',
            status: 404,
          });
          return false;
        }

        adLogger.warn('ad_click_failed', {
          impressionId,
          duration,
          reason: 'http_error',
          status: response.status,
        });
        return false;
      }

      const data: AdClickResponse = await response.json();

      adLogger.info('ad_click', {
        impressionId,
        duration,
        success: data.success,
      });

      return data.success;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      adLogger.error('ad_click_failed', {
        impressionId,
        duration,
        reason: 'network_error',
        error: errorMessage,
      });

      return false;
    } finally {
      setIsTrackingClick(false);
    }
  }, []);

  return {
    trackImpression,
    trackClick,
    isTrackingImpression,
    isTrackingClick,
  };
}
