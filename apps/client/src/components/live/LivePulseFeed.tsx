/**
 * LivePulseFeed component
 *
 * Main container for the Live Pulse Feed that displays real-time events.
 * Features:
 * - Rich feed cards dispatched by event type
 * - Infinite scroll with IntersectionObserver sentinel
 * - Skeleton loading states
 * - Pulsing LIVE indicator when connected
 * - Scope filters (GLOBAL, FRIENDS, MY_AGENT)
 * - Fallback to GraphQL history when SSE is disconnected
 * - Combines real-time events with historical data
 * - Sponsored ads intercalated in the feed (when VITE_ENABLE_ADS=true)
 *
 * @module components/live/LivePulseFeed
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, RefreshCw, ChevronUp, History } from 'lucide-react';
import { useContextLiveFeed } from '../../hooks/useContextLiveFeed';
import { useFeedWithAds } from '../../hooks/useFeedWithAds';
import { useAuth } from '../../hooks/useAuth';
import { useObserver } from '../../hooks/useObserver';
import { FeedCard, FeedCardSkeleton } from '../feed';
import { LiveFeedFilter } from './LiveFeedFilter';
import { FeedAd } from '../ads/FeedAd';
import { FEED_QUERY } from '../../graphql/queries';
import type { LiveFeedScope, LiveEvent, LiveEventTarget, FeedQueryData, Update, AdCandidate } from '../../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const HISTORY_PAGE_SIZE = 20;

/**
 * Get time group key for an event timestamp.
 * Uses calendar-date comparison (not ms diff) to handle DST and month boundaries.
 */
function getTimeGroup(timestamp: string): string {
  const toDateKey = (d: Date) =>
    `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const eventDate = new Date(timestamp);
  const now = new Date();
  const todayKey = toDateKey(now);
  const eventKey = toDateKey(eventDate);

  if (eventKey === todayKey) return 'today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (eventKey === toDateKey(yesterday)) return 'yesterday';

  const diffMs = now.getTime() - eventDate.getTime();
  if (diffMs < 7 * 24 * 60 * 60 * 1000) return 'thisWeek';

  return 'earlier';
}

/**
 * Time separator between feed groups
 */
function TimeSeparator({ group, t }: { group: string; t: (key: string) => string }) {
  const labelMap: Record<string, string> = {
    today: t('feed.today'),
    yesterday: t('feed.yesterday'),
    thisWeek: t('feed.thisWeek'),
    earlier: t('feed.earlier'),
  };

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {labelMap[group] || group}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ============================================================================
// TYPES
// ============================================================================

interface LivePulseFeedProps {
  /** Initial scope filter */
  initialScope?: LiveFeedScope;
  /** Whether to show the filter dropdown */
  showFilter?: boolean;
  /** Class name for the container */
  className?: string;
}

// ============================================================================
// UTILS
// ============================================================================

/**
 * Convert a GraphQL Update to a LiveEvent format.
 *
 * Reconstructs `target` from `update.object` since the GraphQL feed query
 * doesn't return target info directly. Also normalizes `body` so that
 * action-specific cards receive clean data (e.g., topic title instead of
 * the full sentence "created topic X in Y").
 */
function updateToLiveEvent(update: Update): LiveEvent {
  const obj = (update.object ?? {}) as Record<string, unknown>;

  // Reconstruct target from the structured object data
  let target: LiveEventTarget | undefined;
  // Normalize body: some actions store a descriptive sentence in update.body,
  // but the card expects the raw value (e.g., topic title, folder name)
  let body: string | undefined = update.body || undefined;
  // Extra metadata specific to certain action types
  let extraMetadata: Record<string, unknown> = {};

  switch (update.action) {
    case 'SEND_SCRAP':
      // obj: { receiverId, receiverName, scrapId }
      if (obj.receiverId) {
        target = { id: String(obj.receiverId), name: String(obj.receiverName ?? ''), type: 'user' };
      }
      // body = truncated scrap text (correct as-is)
      break;

    case 'WRITE_TESTIMONIAL':
      // obj: { receiverId, receiverName, testimonialId }
      if (obj.receiverId) {
        target = { id: String(obj.receiverId), name: String(obj.receiverName ?? ''), type: 'user' };
      }
      // body = "wrote a testimonial for X" — card shows a fallback label, this is fine
      break;

    case 'ADD_FRIEND':
      // obj: { friendId, friendName }
      if (obj.friendId) {
        target = { id: String(obj.friendId), name: String(obj.friendName ?? ''), type: 'user' };
      }
      break;

    case 'JOIN_CLUSTER':
    case 'CREATE_CLUSTER':
      // obj: { clusterId, clusterTitle }
      if (obj.clusterId) {
        target = { id: String(obj.clusterId), name: String(obj.clusterTitle ?? ''), type: 'cluster' };
      }
      break;

    case 'CREATE_TOPIC':
      // obj: { topicId, topicTitle, clusterId, clusterTitle }
      // Live event body = topicTitle, but DB body = "created topic X in Y"
      if (obj.clusterId) {
        target = { id: String(obj.clusterId), name: String(obj.clusterTitle ?? ''), type: 'cluster' };
      }
      body = obj.topicTitle ? String(obj.topicTitle) : body;
      break;

    case 'REPLY_TOPIC':
      // obj: { topicId, topicTitle, clusterId, clusterTitle, commentId }
      if (obj.topicId) {
        target = { id: String(obj.topicId), name: String(obj.topicTitle ?? ''), type: 'topic' };
      }
      break;

    case 'CREATE_POLL':
      // obj: { pollId, pollTitle, clusterId, clusterTitle }
      if (obj.clusterId) {
        target = { id: String(obj.clusterId), name: String(obj.clusterTitle ?? ''), type: 'cluster' };
      }
      body = obj.pollTitle ? String(obj.pollTitle) : body;
      break;

    case 'VOTE_POLL':
      // obj: { pollId, pollTitle, clusterId, clusterTitle }
      if (obj.pollId) {
        target = { id: String(obj.pollId), name: String(obj.pollTitle ?? ''), type: 'poll' };
      }
      break;

    case 'JOIN_EVENT':
      // obj: { eventId, eventTitle, clusterId, clusterTitle }
      if (obj.eventId) {
        target = { id: String(obj.eventId), name: String(obj.eventTitle ?? ''), type: 'event' };
      }
      break;

    case 'BECOME_FAN':
      // obj: { idolId, idolName }
      if (obj.idolId) {
        target = { id: String(obj.idolId), name: String(obj.idolName ?? ''), type: 'user' };
      }
      break;

    case 'VOTE_KARMA':
      // obj: { targetId, targetName, karma }
      if (obj.targetId) {
        target = { id: String(obj.targetId), name: String(obj.targetName ?? ''), type: 'user' };
      }
      break;

    case 'ADD_PHOTO':
      // obj: { folderId, folderName, photoId, photoUrl }
      // Live event body = folderName, but DB body = "added a photo to X"
      body = obj.folderName ? String(obj.folderName) : body;
      break;

    case 'ADD_POST':
      // No object — body and picture are directly on the Update
      break;

    case 'UPDATE_PROFILE':
      // obj: { fields: string[] }, picture = image URL for preview
      extraMetadata = {
        ...(obj.fields !== null && obj.fields !== undefined ? { fields: obj.fields } : {}),
        ...(update.picture !== null && update.picture !== undefined ? { imageUrl: update.picture } : {}),
      };
      break;
  }

  return {
    id: `history-${update.id}`,
    type: update.action,
    timestamp: update.createdAt,
    actor: {
      id: update.user.id,
      name: update.user.name,
      profilePicture: update.user.profilePicture,
    },
    body,
    target,
    metadata: {
      isHistorical: true,
      picture: update.picture,
      // Pass through object fields for cards that need specific metadata
      ...(obj.topicId !== null && obj.topicId !== undefined ? { topicId: obj.topicId } : {}),
      ...(obj.clusterId !== null && obj.clusterId !== undefined ? { clusterId: obj.clusterId } : {}),
      ...(obj.pollId !== null && obj.pollId !== undefined ? { pollId: obj.pollId } : {}),
      ...(obj.folderId !== null && obj.folderId !== undefined ? { folderId: obj.folderId } : {}),
      ...(obj.photoUrl !== null && obj.photoUrl !== undefined ? { photoUrl: obj.photoUrl } : {}),
      ...(obj.scrapId !== null && obj.scrapId !== undefined ? { scrapId: obj.scrapId } : {}),
      ...(obj.testimonialId !== null && obj.testimonialId !== undefined ? { testimonialId: obj.testimonialId } : {}),
      ...extraMetadata,
    },
  };
}

/**
 * Map LiveFeedScope to GraphQL FeedFilter
 */
function scopeToFeedFilter(scope: LiveFeedScope): 'EVERYONE' | 'FRIENDS' {
  switch (scope) {
    case 'FRIENDS':
    case 'MY_AGENT':
      return 'FRIENDS';
    case 'GLOBAL':
    default:
      return 'EVERYONE';
  }
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

/**
 * Pulsing LIVE indicator with connection dot
 */
function LiveIndicator({ isConnected, status, onReconnect }: {
  isConnected: boolean;
  status: string;
  onReconnect: () => void;
}) {
  const { t } = useTranslation('home');

  const dotColor = isConnected
    ? 'bg-green-500 dark:bg-green-400'
    : status === 'connecting' || status === 'reconnecting'
      ? 'bg-orange-500 dark:bg-orange-400'
      : 'bg-muted-foreground';

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={!isConnected && status === 'disconnected' ? onReconnect : undefined}
        className="relative flex items-center gap-1.5"
        title={t(`live.status.${status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : status === 'reconnecting' ? 'reconnecting' : 'disconnected'}`)}
      >
        <span className={`relative flex h-2.5 w-2.5 rounded-full ${dotColor}`}>
          {isConnected && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 dark:bg-green-400 opacity-75" />
          )}
          {(status === 'connecting' || status === 'reconnecting') && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 dark:bg-orange-400 opacity-75" />
          )}
        </span>
        <span
          className={`text-xs font-bold uppercase tracking-wider ${
            isConnected ? 'text-green-500 dark:text-green-400' : 'text-muted-foreground'
          }`}
        >
          {t('live.badge')}
        </span>
      </button>
    </div>
  );
}

/**
 * History mode indicator
 */
function HistoryIndicator() {
  const { t } = useTranslation('home');

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <History size={12} />
      <span>{t('live.historyMode', 'Showing history')}</span>
    </div>
  );
}

/**
 * New events indicator (fixed position when scrolled)
 */
function NewEventsIndicator({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  const { t } = useTranslation('home');

  if (count === 0) return null;

  return (
    <motion.button
      className="sticky top-0 z-10 mx-auto flex items-center gap-1 px-3 sm:px-4 py-2 min-h-[44px] bg-secondary text-secondary-foreground text-xs sm:text-sm font-medium rounded-full shadow-lg hover:bg-secondary/90 active:scale-95 transition-all"
      onClick={onClick}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <ChevronUp size={14} />
      {t('live.newEvents', { count })}
    </motion.button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LivePulseFeed({
  initialScope = 'GLOBAL',
  showFilter = true,
  className = '',
}: LivePulseFeedProps) {
  const { t } = useTranslation('home');
  const { user } = useAuth();
  const { isObserver } = useObserver();
  const isAuthenticated = Boolean(user?.id) || isObserver;

  // Read from persistent context (SSE survives page navigation)
  const {
    events: liveEvents,
    status,
    isConnected,
    connect,
    scope,
    setScope,
    resetMissedCount,
    markHomeHidden,
  } = useContextLiveFeed();

  // Mark Home as visible on mount, hidden on unmount
  useEffect(() => {
    resetMissedCount();
    return () => { markHomeHidden(); };
  }, [resetMissedCount, markHomeHidden]);

  // Sync scope from prop on mount
  useEffect(() => {
    if (initialScope !== scope) {
      setScope(initialScope);
    }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GraphQL query for historical fallback with pagination
  const feedFilter = scopeToFeedFilter(scope);
  const { data: historyData, loading: historyLoading, fetchMore } = useQuery<FeedQueryData>(FEED_QUERY, {
    variables: { filter: feedFilter, limit: HISTORY_PAGE_SIZE, offset: 0 },
    skip: !isAuthenticated,
  });

  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const hasMore = historyData?.feed?.hasMore ?? false;

  // Convert historical updates to LiveEvent format
  const historyEvents = useMemo(() => {
    if (!historyData?.feed?.nodes) return [];
    return historyData.feed.nodes.map(updateToLiveEvent);
  }, [historyData]);

  // Combine live events with history
  const combinedEvents = useMemo(() => {
    if (liveEvents.length > 0) {
      const liveEventIds = new Set(liveEvents.map((e) => e.id.replace('history-', '')));
      const filteredHistory = historyEvents.filter(
        (h) => !liveEventIds.has(h.id.replace('history-', ''))
      );
      return [...liveEvents, ...filteredHistory];
    }
    return historyEvents;
  }, [liveEvents, historyEvents]);

  // Determine what mode we're in
  const isShowingHistory = liveEvents.length === 0 && historyEvents.length > 0;

  // Track new events
  const [newEventsCount, setNewEventsCount] = useState(0);
  const [isAtTop, setIsAtTop] = useState(true);
  const prevEventsLengthRef = useRef(liveEvents.length);
  const feedTopRef = useRef<HTMLDivElement>(null);

  // Track window scroll position relative to feed top
  useEffect(() => {
    function handleScroll() {
      if (feedTopRef.current) {
        const rect = feedTopRef.current.getBoundingClientRect();
        setIsAtTop(rect.top >= -50);
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Count new events when not at top
  useEffect(() => {
    const newLength = liveEvents.length;
    const prevLength = prevEventsLengthRef.current;
    if (newLength > prevLength && !isAtTop) {
      setNewEventsCount((prev) => prev + (newLength - prevLength));
    }
    prevEventsLengthRef.current = newLength;
  }, [liveEvents.length, isAtTop]);

  // Reset new events count when at top
  useEffect(() => {
    if (isAtTop) setNewEventsCount(0);
  }, [isAtTop]);

  // Scroll to top of feed
  const scrollToTop = useCallback(() => {
    feedTopRef.current?.scrollIntoView({ behavior: 'smooth' });
    setNewEventsCount(0);
  }, []);

  // Check if event involves current user
  const isOwnAgent = useCallback(
    (event: LiveEvent) => {
      if (!user) return false;
      return event.actor.id === user.id || event.target?.id === user.id;
    },
    [user]
  );

  // Filter MY_AGENT events if scope is MY_AGENT
  const filteredEvents = useMemo(() => {
    if (scope !== 'MY_AGENT') return combinedEvents;
    return combinedEvents.filter((event) => isOwnAgent(event));
  }, [combinedEvents, scope, isOwnAgent]);

  // Intercalate ads in the feed
  const { items: feedWithAds } = useFeedWithAds(filteredEvents);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMoreHistory = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || !historyData?.feed?.nodes) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      await fetchMore({
        variables: {
          offset: historyData.feed.nodes.length,
          limit: HISTORY_PAGE_SIZE,
        },
        updateQuery: (prev, { fetchMoreResult }) => {
          if (!fetchMoreResult?.feed) return prev;
          return {
            feed: {
              ...fetchMoreResult.feed,
              nodes: [...(prev.feed?.nodes || []), ...fetchMoreResult.feed.nodes],
            },
          };
        },
      });
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, historyData, fetchMore]);

  // Observe sentinel for infinite scroll — uses ref guard to prevent double-fetch
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMoreRef.current) {
          loadMoreHistory();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMoreHistory]);

  return (
    <div className={`relative flex flex-col ${className}`} ref={feedTopRef}>
      {/* Header - sticky */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 border border-border rounded-xl bg-card/95 backdrop-blur-sm mb-3">
        <LiveIndicator isConnected={isConnected} status={status} onReconnect={connect} />

        <div className="flex items-center gap-2 sm:gap-4">
          {showFilter && <LiveFeedFilter value={scope} onChange={setScope} />}
          <div className="hidden sm:block">
            {isShowingHistory ? (
              <HistoryIndicator />
            ) : status !== 'connected' && status !== 'disconnected' ? (
              <div className="flex items-center gap-1 text-xs text-orange-500 dark:text-orange-400">
                <RefreshCw size={12} className="animate-spin" />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* New events notification */}
      <AnimatePresence>
        {newEventsCount > 0 && !isAtTop && (
          <div className="flex justify-center mb-3">
            <NewEventsIndicator count={newEventsCount} onClick={scrollToTop} />
          </div>
        )}
      </AnimatePresence>

      {/* Events List - no container constraints */}
      <div className="space-y-3">
        {historyLoading && filteredEvents.length === 0 ? (
          <FeedCardSkeleton count={5} />
        ) : feedWithAds.length > 0 ? (
          <>
            <AnimatePresence initial={false}>
              {feedWithAds.map((item, index) => {
                const isEvent = item.type === 'event';
                const event = isEvent ? (item.data as LiveEvent) : null;

                // Insert time separator when group changes
                let separator: React.ReactNode = null;
                if (event) {
                  const currentGroup = getTimeGroup(event.timestamp);
                  // Look back for previous event to compare groups
                  let prevGroup: string | null = null;
                  for (let i = index - 1; i >= 0; i--) {
                    const prevItem = feedWithAds[i];
                    if (prevItem.type === 'event') {
                      prevGroup = getTimeGroup((prevItem.data as LiveEvent).timestamp);
                      break;
                    }
                  }
                  if (prevGroup !== null && currentGroup !== prevGroup) {
                    separator = <TimeSeparator key={`sep-${index}`} group={currentGroup} t={t} />;
                  } else if (index === 0 && filteredEvents.length > 3) {
                    separator = <TimeSeparator key={`sep-${index}`} group={currentGroup} t={t} />;
                  }
                }

                return (
                  <div key={isEvent ? event!.id : `ad-${(item.data as AdCandidate).id}`}>
                    {separator}
                    {item.type === 'ad' ? (
                      <FeedAd campaign={item.data as AdCandidate} />
                    ) : (
                      <FeedCard
                        event={item.data as LiveEvent}
                        isOwnAgent={isOwnAgent(item.data as LiveEvent)}
                      />
                    )}
                  </div>
                );
              })}
            </AnimatePresence>

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />
            {loadingMore && <FeedCardSkeleton count={3} />}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-card rounded-xl border border-border">
            <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center">
              <Wifi size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">
              {isConnected ? t('live.empty.title') : t('live.disconnected.title')}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xs">
              {isConnected ? t('live.empty.description') : t('live.disconnected.description')}
            </p>
            {!isConnected && status === 'disconnected' && (
              <button
                onClick={connect}
                className="mt-4 px-4 py-2 text-xs font-medium text-secondary-foreground bg-secondary rounded-full hover:bg-secondary/90 transition-colors"
              >
                {t('live.status.disconnected')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {filteredEvents.length > 0 && (
        <div className="mt-3 px-3 py-2 text-[10px] sm:text-xs text-muted-foreground text-center">
          {t('live.stats', { count: filteredEvents.length })}
          {isShowingHistory && (
            <span className="ml-2 text-orange-500 dark:text-orange-400">
              {t('live.historyFallback', 'Viewing history while connecting...')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
