/**
 * FeedAd component
 *
 * Displays a sponsored ad in the Live Pulse Feed.
 * Features:
 * - IntersectionObserver for impression tracking (50% visible for 1s)
 * - Click tracking with debounce to prevent duplicate calls
 * - Image loading skeleton
 * - Orkut-consistent visual design
 * - i18n support
 * - Keyboard accessibility
 *
 * @module components/ads/FeedAd
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ExternalLink } from 'lucide-react';
import { useAdTracking } from '../../hooks/useAdTracking';
import { adLogger } from '../../lib/ad-logger';
import { IMPRESSION_DELAY_MS, VISIBILITY_THRESHOLD } from '../../lib/ad-config';
import type { AdCandidate } from '../../types';

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

/**
 * Image loading skeleton placeholder
 */
function ImageSkeleton() {
  return (
    <div className="w-full h-32 sm:h-40 rounded-md bg-muted animate-pulse" />
  );
}

/**
 * Ad image with loading state
 */
function AdImage({ src, onLoad }: { src: string; onLoad?: () => void }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Reset state when src changes (new campaign)
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [src]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    onLoad?.();
  }, [onLoad]);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoaded(true); // Stop showing skeleton
  }, []);

  if (hasError) {
    return null; // Don't show broken image
  }

  return (
    <div className="relative w-full h-32 sm:h-40 mb-3 rounded-md overflow-hidden bg-muted">
      {!isLoaded && <ImageSkeleton />}
      <img
        src={src}
        alt=""
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface FeedAdProps {
  /** The ad campaign to display */
  campaign: AdCandidate;
  /** Animation delay index for stagger effect */
  delay?: number;
}

/**
 * FeedAd component that displays sponsored content in the feed.
 *
 * Tracks impressions when:
 * - Ad is at least 50% visible in the viewport
 * - Ad remains visible for at least 1 second
 *
 * Tracks clicks when:
 * - User clicks the ad (only if impression was already recorded)
 * - Debounced to prevent duplicate tracking calls
 */
export function FeedAd({ campaign, delay = 0 }: FeedAdProps) {
  const { t } = useTranslation('ads');
  const { trackImpression, trackClick } = useAdTracking();

  const containerRef = useRef<HTMLDivElement>(null);
  const [impressionId, setImpressionId] = useState<string | null>(null);
  const [hasTrackedImpression, setHasTrackedImpression] = useState(false);
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Click debounce ref to prevent duplicate calls
  const isClickProcessingRef = useRef(false);

  // Track impression when 50% visible for 1 second
  useEffect(() => {
    if (hasTrackedImpression || !containerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
          // Start timer when ad becomes sufficiently visible
          visibilityTimerRef.current = setTimeout(async () => {
            const startTime = Date.now();
            const id = await trackImpression(campaign.id);

            if (id) {
              setImpressionId(id);
              setHasTrackedImpression(true);

              adLogger.info('ad_impression', {
                campaignId: campaign.id,
                impressionId: id,
                duration: Date.now() - startTime,
              });
            } else {
              adLogger.warn('ad_impression_failed', {
                campaignId: campaign.id,
                duration: Date.now() - startTime,
              });
            }

            observer.disconnect();
          }, IMPRESSION_DELAY_MS);
        } else {
          // Cancel timer if ad scrolls out of view
          if (visibilityTimerRef.current) {
            clearTimeout(visibilityTimerRef.current);
            visibilityTimerRef.current = null;
          }
        }
      },
      { threshold: VISIBILITY_THRESHOLD }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (visibilityTimerRef.current) {
        clearTimeout(visibilityTimerRef.current);
      }
    };
  }, [campaign.id, trackImpression, hasTrackedImpression]);

  // Handle ad click with debounce
  const handleClick = useCallback(async () => {
    // Debounce: prevent multiple rapid clicks
    if (isClickProcessingRef.current) {
      adLogger.debug('ad_click_debounced', { campaignId: campaign.id });
      return;
    }

    // Track click if we have an impression ID
    if (impressionId) {
      isClickProcessingRef.current = true;

      const startTime = Date.now();
      const success = await trackClick(impressionId);

      if (success) {
        adLogger.info('ad_click', {
          campaignId: campaign.id,
          impressionId,
          duration: Date.now() - startTime,
        });
      } else {
        adLogger.warn('ad_click_failed', {
          campaignId: campaign.id,
          impressionId,
          duration: Date.now() - startTime,
        });
      }

      // Reset debounce after a short delay
      setTimeout(() => {
        isClickProcessingRef.current = false;
      }, 500);
    }

    // Open link in new tab (always, regardless of tracking success)
    window.open(campaign.linkUrl, '_blank', 'noopener,noreferrer');
  }, [impressionId, campaign.id, campaign.linkUrl, trackClick]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, delay: delay * 0.03 }}
      className="bg-card rounded-lg border border-border p-3 sm:p-4 hover:shadow-sm transition-shadow cursor-pointer"
      role="article"
      aria-label={t('sponsored')}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Sponsored label */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider">
          {t('sponsored')}
        </span>
        <ExternalLink size={12} className="text-muted-foreground" aria-hidden="true" />
      </div>

      {/* Image with loading skeleton */}
      {campaign.imageUrl && <AdImage src={campaign.imageUrl} />}

      {/* Content */}
      <div className="space-y-1.5">
        <h4 className="font-semibold text-sm sm:text-base text-foreground line-clamp-2">
          {campaign.headline}
        </h4>
        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
          {campaign.description}
        </p>
        <span className="text-[10px] sm:text-xs text-muted-foreground">
          {campaign.brandCompany}
        </span>
      </div>

      {/* CTA Button */}
      <button
        type="button"
        className="mt-3 w-full py-2 px-4 bg-secondary text-secondary-foreground text-xs sm:text-sm font-medium rounded-md hover:bg-secondary/80 active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-secondary focus:ring-offset-2"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
      >
        {t('learnMore')}
      </button>
    </motion.div>
  );
}
