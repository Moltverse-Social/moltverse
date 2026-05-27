/**
 * useLiveFeed hook
 *
 * Provides real-time event streaming from the Live Pulse Feed.
 * Manages SSE connection, event buffering, and connection state.
 *
 * Features:
 * - Automatic connection management
 * - Reconnection with exponential backoff
 * - Event deduplication
 * - Visual throttling (max 5 events/second to prevent UI flooding)
 * - Configurable event buffer size
 * - Scope and type filtering
 *
 * @module hooks/useLiveFeed
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { SSEClient } from '../lib/sse-client';
import type {
  LiveEvent,
  LiveFeedScope,
  LiveFeedConnectionStatus,
  UseLiveFeedOptions,
  UpdateAction,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default maximum events to keep in memory */
const DEFAULT_MAX_EVENTS = 50;

/** Minimum interval between rendered events in ms (5 events/second = 200ms) */
const EVENT_THROTTLE_INTERVAL = 200;

// ============================================================================
// TYPES
// ============================================================================

/**
 * Return type for useLiveFeed hook
 */
export interface UseLiveFeedReturn {
  /** List of received events (newest first) */
  events: LiveEvent[];
  /** Current connection status */
  status: LiveFeedConnectionStatus;
  /** Current connection ID (if connected) */
  connectionId: string | null;
  /** Whether currently connected */
  isConnected: boolean;
  /** Connect to the live feed */
  connect: () => void;
  /** Disconnect from the live feed */
  disconnect: () => void;
  /** Clear all events from the buffer */
  clearEvents: () => void;
  /** Update scope filter */
  setScope: (scope: LiveFeedScope) => void;
  /** Update type filter */
  setTypes: (types: UpdateAction[] | undefined) => void;
  /** Current scope */
  scope: LiveFeedScope;
  /** Current types filter */
  types: UpdateAction[] | undefined;
  /** Last error (if any) */
  error: Error | null;
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for consuming Live Pulse Feed events
 */
export function useLiveFeed(options: UseLiveFeedOptions = {}): UseLiveFeedReturn {
  const {
    scope: initialScope = 'GLOBAL',
    types: initialTypes,
    maxEvents = DEFAULT_MAX_EVENTS,
    autoConnect = true,
  } = options;

  // State
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [status, setStatus] = useState<LiveFeedConnectionStatus>('disconnected');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [scope, setScopeState] = useState<LiveFeedScope>(initialScope);
  const [types, setTypesState] = useState<UpdateAction[] | undefined>(initialTypes);

  // Refs - these don't cause re-renders
  const clientRef = useRef<SSEClient | null>(null);
  const seenEventIds = useRef<Set<string>>(new Set());
  const eventQueueRef = useRef<LiveEvent[]>([]);
  const lastRenderTimeRef = useRef<number>(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxEventsRef = useRef(maxEvents);
  const scopeRef = useRef(scope);
  const typesRef = useRef(types);

  // Keep refs in sync with state/props
  maxEventsRef.current = maxEvents;
  scopeRef.current = scope;
  typesRef.current = types;

  /**
   * Process event queue with throttling
   */
  const processEventQueue = useCallback(() => {
    const queue = eventQueueRef.current;
    if (queue.length === 0) {
      throttleTimerRef.current = null;
      return;
    }

    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTimeRef.current;

    if (timeSinceLastRender >= EVENT_THROTTLE_INTERVAL) {
      const event = queue.shift();
      if (event) {
        lastRenderTimeRef.current = now;

        setEvents((prev) => {
          const updated = [event, ...prev];
          if (updated.length > maxEventsRef.current) {
            const removed = updated.slice(maxEventsRef.current);
            removed.forEach((e) => seenEventIds.current.delete(e.id));
            return updated.slice(0, maxEventsRef.current);
          }
          return updated;
        });
      }
    }

    if (queue.length > 0) {
      const nextDelay = Math.max(
        EVENT_THROTTLE_INTERVAL - (Date.now() - lastRenderTimeRef.current),
        0
      );
      throttleTimerRef.current = setTimeout(processEventQueue, nextDelay);
    } else {
      throttleTimerRef.current = null;
    }
  }, []);

  /**
   * Add event to the queue with deduplication
   */
  const addEvent = useCallback((event: LiveEvent) => {
    if (seenEventIds.current.has(event.id)) {
      return;
    }
    seenEventIds.current.add(event.id);
    eventQueueRef.current.push(event);

    if (!throttleTimerRef.current) {
      processEventQueue();
    }
  }, [processEventQueue]);

  /**
   * Clear all events
   */
  const clearEvents = useCallback(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    eventQueueRef.current = [];
    setEvents([]);
    seenEventIds.current.clear();
  }, []);

  /**
   * Get or create the SSE client
   */
  const getClient = useCallback((): SSEClient => {
    if (!clientRef.current) {
      // Create SSE client instance
      clientRef.current = new SSEClient(
        {
          scope: scopeRef.current,
          types: typesRef.current,
          autoReconnect: true,
        },
        {
          onEvent: addEvent,
          onConnect: (systemEvent) => {
            setConnectionId(systemEvent.connectionId);
            setError(null);
          },
          onStatusChange: (newStatus) => {
            setStatus(newStatus);
          },
          onError: (err) => {
            setError(err);
          },
        }
      );
    }
    return clientRef.current;
  }, [addEvent]);

  /**
   * Connect to the live feed
   */
  const connect = useCallback(() => {
    const client = getClient();
    client.connect();
  }, [getClient]);

  /**
   * Disconnect from the live feed
   */
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setConnectionId(null);
  }, []);

  /**
   * Update scope
   */
  const setScope = useCallback((newScope: LiveFeedScope) => {
    setScopeState(newScope);
    if (clientRef.current) {
      clientRef.current.updateConfig({ scope: newScope });
    }
  }, []);

  /**
   * Update types
   */
  const setTypes = useCallback((newTypes: UpdateAction[] | undefined) => {
    setTypesState(newTypes);
    if (clientRef.current) {
      clientRef.current.updateConfig({ types: newTypes });
    }
  }, []);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  /**
   * Effect 1: Auto-connect when autoConnect becomes true
   *
   * This effect ONLY handles the auto-connect logic.
   * It does NOT create or destroy the client.
   * Uses a 500ms delay so auth state can settle before attempting SSE.
   * If autoConnect flips back to false within the delay, the timer is cancelled.
   */
  useEffect(() => {
    if (autoConnect) {
      const timer = setTimeout(() => {
        connect();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [autoConnect, connect]);

  /**
   * Effect 2: Cleanup on unmount ONLY
   *
   * This effect handles cleanup when the component unmounts.
   * It uses an empty dependency array so it only runs on mount/unmount.
   */
  useEffect(() => {
    return () => {

      // Clear throttle timer
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }

      // Disconnect and cleanup client
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, []);

  return {
    events,
    status,
    connectionId,
    isConnected: status === 'connected',
    connect,
    disconnect,
    clearEvents,
    setScope,
    setTypes,
    scope,
    types,
    error,
  };
}
