/**
 * SidebarAd component
 *
 * Displays sponsored content or promotional animation in the sidebar.
 * Features:
 * - Priority system: campaign > context animation > random animation
 * - IntersectionObserver for impression tracking (50% visible for 1s)
 * - Click tracking with debounce
 * - Smooth transitions between campaign and animation
 * - Orkut-consistent visual design
 *
 * @module components/ads/SidebarAd
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, RefreshCw, X, ChevronUp } from 'lucide-react';
import Lottie from 'lottie-react';
import { useSidebarAd } from '../../hooks/useSidebarAd';
import { adLogger } from '../../lib/ad-logger';
import { IMPRESSION_DELAY_MS, VISIBILITY_THRESHOLD } from '../../lib/ad-config';
import type { AdCandidate } from '../../types';

// =============================================================================
// CONSTANTS
// =============================================================================

const STORAGE_KEY = 'moltverse_sidebar_ad_minimized';

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook to manage minimized state with localStorage persistence
 */
function useMinimizedState(): [boolean, () => void] {
  const [isMinimized, setIsMinimized] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setIsMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage not available, ignore
      }
      return next;
    });
  }, []);

  return [isMinimized, toggle];
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

/**
 * Minimized state - compact bar to expand
 */
function MinimizedBar({ onExpand }: { onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-muted/50 hover:bg-muted border border-accent/10 transition-colors group"
      aria-label="Show sponsored content"
    >
      <ChevronUp
        size={12}
        className="text-muted-foreground group-hover:text-foreground transition-colors"
      />
      <span className="text-[10px] text-muted-foreground group-hover:text-foreground uppercase tracking-wider transition-colors">
        Sponsored
      </span>
    </button>
  );
}

/**
 * Minimize button - discrete X in top-right corner
 */
function MinimizeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute top-1.5 right-1.5 p-1 rounded-full hover:bg-accent/20 transition-all"
      aria-label="Hide sponsored content"
    >
      <X size={12} className="text-muted-foreground hover:text-foreground" />
    </button>
  );
}

/**
 * Image loading skeleton placeholder
 */
function ImageSkeleton() {
  return (
    <div className="w-full h-28 rounded bg-muted animate-pulse" />
  );
}

/**
 * Ad image with loading state
 */
function AdImage({ src }: { src: string }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [src]);

  if (hasError) {
    return null;
  }

  return (
    <div className="relative w-full h-28 rounded overflow-hidden bg-muted">
      {!isLoaded && <ImageSkeleton />}
      <img
        src={src}
        alt=""
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

/**
 * Loading skeleton for sidebar ad
 */
function SidebarAdSkeleton() {
  return (
    <div className="bg-gradient-to-br from-accent/10 to-primary/10 border border-accent/20 p-4 rounded-lg">
      <div className="h-3 w-16 bg-muted animate-pulse rounded mb-2" />
      <div className="w-full h-28 bg-muted animate-pulse rounded mb-2" />
      <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
    </div>
  );
}

/**
 * Campaign creative display
 */
interface CampaignDisplayProps {
  campaign: AdCandidate;
  onImpression: () => void;
  onClick: () => void;
  onMinimize: () => void;
}

function CampaignDisplay({ campaign, onImpression, onClick, onMinimize }: CampaignDisplayProps) {
  const { t } = useTranslation('ads');
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasTrackedImpression, setHasTrackedImpression] = useState(false);
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClickProcessingRef = useRef(false);

  // Track impression when 50% visible for 1 second
  useEffect(() => {
    if (hasTrackedImpression || !containerRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
          visibilityTimerRef.current = setTimeout(() => {
            onImpression();
            setHasTrackedImpression(true);
            observer.disconnect();
          }, IMPRESSION_DELAY_MS);
        } else {
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
  }, [campaign.id, onImpression, hasTrackedImpression]);

  // Reset impression tracking when campaign changes
  useEffect(() => {
    setHasTrackedImpression(false);
  }, [campaign.id]);

  const handleClick = useCallback(() => {
    if (isClickProcessingRef.current) {
      adLogger.debug('sidebar_ad_click_debounced', { campaignId: campaign.id });
      return;
    }

    isClickProcessingRef.current = true;
    onClick();

    // Open link in new tab
    window.open(campaign.linkUrl, '_blank', 'noopener,noreferrer');

    // Reset debounce after a short delay
    setTimeout(() => {
      isClickProcessingRef.current = false;
    }, 500);
  }, [campaign.id, campaign.linkUrl, onClick]);

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
    <div
      ref={containerRef}
      className="relative group bg-gradient-to-br from-accent/10 to-primary/10 border border-accent/20 p-4 rounded-lg text-center cursor-pointer hover:shadow-sm transition-shadow"
      role="article"
      aria-label={t('sponsored')}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Minimize button - visible on hover */}
      <MinimizeButton onClick={onMinimize} />

      {/* Sponsored label */}
      <div className="flex items-center justify-center gap-1 mb-2">
        <span className="text-xs font-bold text-accent uppercase tracking-wider">
          SPONSORED
        </span>
        <ExternalLink size={10} className="text-accent" aria-hidden="true" />
      </div>

      {/* Image */}
      {campaign.imageUrl && (
        <div className="mb-2">
          <AdImage src={campaign.imageUrl} />
        </div>
      )}

      {/* Content */}
      <h4 className="text-sm font-semibold text-foreground line-clamp-2 mb-1">
        {campaign.headline}
      </h4>
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
        {campaign.description}
      </p>

      {/* Brand */}
      <span className="text-[10px] text-muted-foreground">
        {campaign.brandCompany}
      </span>
    </div>
  );
}

/**
 * Animation display (fallback when no campaign)
 */
interface AnimationDisplayProps {
  animationType: 'lottie' | 'gif';
  data: unknown;
  tagline: string;
  onMinimize: () => void;
}

function AnimationDisplay({ animationType, data, tagline, onMinimize }: AnimationDisplayProps) {
  // Memoize Lottie style to prevent re-renders
  const lottieStyle = useMemo(() => ({ width: 120, height: 120 }), []);

  return (
    <div className="relative group bg-gradient-to-br from-accent/10 to-primary/10 border border-accent/20 p-4 rounded-lg text-center">
      {/* Minimize button - visible on hover */}
      <MinimizeButton onClick={onMinimize} />

      <p className="text-xs font-bold text-accent mb-2">SPONSORED</p>
      <div className="w-full h-28 rounded mb-2 flex items-center justify-center overflow-hidden">
        {animationType === 'lottie' ? (
          <Lottie
            animationData={data}
            loop={true}
            autoplay={true}
            style={lottieStyle}
          />
        ) : (
          <img
            src={data as string}
            alt=""
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
        )}
      </div>
      <p className="text-sm text-foreground font-medium">{tagline}</p>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface SidebarAdProps {
  /** User's clusters for context-aware animation selection */
  clusters?: Array<{ id: string; title: string }>;
  /** User's country code */
  country?: string;
  /** Language locale (defaults to i18n language) */
  language?: string;
}

/**
 * SidebarAd component that displays sponsored content or promotional animation.
 *
 * Priority:
 * 1. Active campaign (from API)
 * 2. Context-aware animation (based on user clusters, time of day)
 * 3. Random animation from pool
 *
 * Usage:
 * ```tsx
 * <SidebarAd
 *   clusters={user.clusters}
 *   country={user.country}
 * />
 * ```
 */
export function SidebarAd({ clusters, country, language }: SidebarAdProps) {
  const { i18n } = useTranslation();
  const [isMinimized, toggleMinimized] = useMinimizedState();
  const {
    content,
    isLoading,
    trackImpression,
    trackClick,
    refresh,
  } = useSidebarAd({
    clusters,
    country,
    language: language ?? i18n.language,
  });

  // Minimized state - show compact bar
  if (isMinimized) {
    return <MinimizedBar onExpand={toggleMinimized} />;
  }

  if (isLoading) {
    return <SidebarAdSkeleton />;
  }

  if (!content) {
    // Edge case: no content available, show refresh button
    return (
      <div className="bg-gradient-to-br from-accent/10 to-primary/10 border border-accent/20 p-4 rounded-lg text-center">
        <p className="text-xs text-muted-foreground mb-2">Unable to load content</p>
        <button
          type="button"
          onClick={refresh}
          className="flex items-center justify-center gap-1 text-xs text-secondary hover:underline mx-auto"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  if (content.type === 'campaign' && content.campaign) {
    return (
      <CampaignDisplay
        campaign={content.campaign}
        onImpression={() => {
          trackImpression().then((impressionId) => {
            if (impressionId) {
              adLogger.info('sidebar_ad_impression', {
                campaignId: content.campaign!.id,
                impressionId,
              });
            }
          });
        }}
        onClick={() => {
          trackClick().then((success) => {
            adLogger.info('sidebar_ad_click', {
              campaignId: content.campaign!.id,
              success,
            });
          });
        }}
        onMinimize={toggleMinimized}
      />
    );
  }

  if (content.type === 'animation' && content.animation) {
    return (
      <AnimationDisplay
        animationType={content.animation.animationType}
        data={content.animation.data}
        tagline={content.animation.tagline}
        onMinimize={toggleMinimized}
      />
    );
  }

  // Fallback should not reach here
  return null;
}
