/**
 * LiveFeedContext
 *
 * Persists the SSE connection and event buffer across page navigation.
 * Mounted at MainLayout level so the feed survives going to Profile,
 * Communities, etc. When the user returns to Home, events are instantly
 * available from the context instead of reconnecting.
 */

import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import { SSEClient } from '../lib/sse-client';
import { useAuth } from '../hooks/useAuth';
import { useObserver } from '../hooks/useObserver';
import type {
  LiveEvent,
  LiveFeedScope,
  LiveFeedConnectionStatus,
} from '../types';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MAX_EVENTS = 100;
const MAX_QUEUE_SIZE = 200;
const EVENT_THROTTLE_INTERVAL = 200;

// ============================================================================
// TYPES
// ============================================================================

export interface LiveFeedContextValue {
  events: LiveEvent[];
  status: LiveFeedConnectionStatus;
  isConnected: boolean;
  scope: LiveFeedScope;
  setScope: (scope: LiveFeedScope) => void;
  connect: () => void;
  disconnect: () => void;
  clearEvents: () => void;
  /** Number of events received while away from the Home page */
  missedCount: number;
  /** Reset missed counter and mark Home as visible (call on Home mount) */
  resetMissedCount: () => void;
  /** Mark Home as hidden (call on Home unmount) */
  markHomeHidden: () => void;
}

// ============================================================================
// CONTEXT
// ============================================================================

export const LiveFeedContext = createContext<LiveFeedContextValue | undefined>(undefined);

// ============================================================================
// PROVIDER
// ============================================================================

interface LiveFeedProviderProps {
  children: ReactNode;
}

export function LiveFeedProvider({ children }: LiveFeedProviderProps) {
  const { user, isLoading: authLoading } = useAuth();
  const { observer, isLoading: observerLoading } = useObserver();

  const isAnyAuthLoading = authLoading || observerLoading;
  const isAuthenticated = Boolean(user) || Boolean(observer);

  // State
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [status, setStatus] = useState<LiveFeedConnectionStatus>('disconnected');
  const [scope, setScopeState] = useState<LiveFeedScope>('GLOBAL');
  const [missedCount, setMissedCount] = useState(0);

  // Track whether Home is currently visible
  const isHomeVisibleRef = useRef(false);

  // Refs
  const clientRef = useRef<SSEClient | null>(null);
  const seenEventIds = useRef<Set<string>>(new Set());
  const eventQueueRef = useRef<LiveEvent[]>([]);
  const lastRenderTimeRef = useRef<number>(0);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeRef = useRef(scope);

  // Ref-based handler to avoid stale closure in SSEClient
  const addEventRef = useRef<(event: LiveEvent) => void>(() => {});

  scopeRef.current = scope;

  // Process event queue with throttling
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
          if (updated.length > DEFAULT_MAX_EVENTS) {
            const removed = updated.slice(DEFAULT_MAX_EVENTS);
            removed.forEach((e) => seenEventIds.current.delete(e.id));
            return updated.slice(0, DEFAULT_MAX_EVENTS);
          }
          return updated;
        });

        // Count missed events when not on Home
        if (!isHomeVisibleRef.current) {
          setMissedCount((prev) => prev + 1);
        }
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

  // Add event with deduplication and queue cap
  const addEvent = useCallback((event: LiveEvent) => {
    if (seenEventIds.current.has(event.id)) return;
    seenEventIds.current.add(event.id);

    // Cap queue size to prevent unbounded memory growth under burst conditions
    if (eventQueueRef.current.length >= MAX_QUEUE_SIZE) {
      const dropped = eventQueueRef.current.shift();
      if (dropped) seenEventIds.current.delete(dropped.id);
    }

    eventQueueRef.current.push(event);
    if (!throttleTimerRef.current) {
      processEventQueue();
    }
  }, [processEventQueue]);

  // Keep the ref in sync so the SSE client always calls the latest version
  addEventRef.current = addEvent;

  // Clear events
  const clearEvents = useCallback(() => {
    if (throttleTimerRef.current) {
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
    eventQueueRef.current = [];
    setEvents([]);
    seenEventIds.current.clear();
  }, []);

  // Get or create SSE client — uses ref indirection so handlers are never stale
  const getClient = useCallback((): SSEClient => {
    if (!clientRef.current) {
      clientRef.current = new SSEClient(
        {
          scope: scopeRef.current,
          autoReconnect: true,
        },
        {
          onEvent: (event) => addEventRef.current(event),
          onConnect: () => {},
          onStatusChange: (newStatus) => setStatus(newStatus),
          onError: () => {},
        }
      );
    }
    return clientRef.current;
  }, []);

  // Connect
  const connect = useCallback(() => {
    const client = getClient();
    client.connect();
  }, [getClient]);

  // Disconnect
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  // Set scope
  const setScope = useCallback((newScope: LiveFeedScope) => {
    setScopeState(newScope);
    if (clientRef.current) {
      clientRef.current.updateConfig({ scope: newScope });
    }
  }, []);

  // Reset missed count and mark Home as visible
  const resetMissedCount = useCallback(() => {
    setMissedCount(0);
    isHomeVisibleRef.current = true;
  }, []);

  // Mark Home as hidden (called on Home unmount)
  const markHomeHidden = useCallback(() => {
    isHomeVisibleRef.current = false;
  }, []);

  // Auto-connect when authenticated
  useEffect(() => {
    if (!isAnyAuthLoading && isAuthenticated) {
      const timer = setTimeout(() => connect(), 500);
      return () => clearTimeout(timer);
    }
  }, [isAnyAuthLoading, isAuthenticated, connect]);

  // Disconnect and clear events when user logs out
  useEffect(() => {
    if (!isAnyAuthLoading && !isAuthenticated) {
      disconnect();
      clearEvents();
    }
  }, [isAnyAuthLoading, isAuthenticated, disconnect, clearEvents]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, []);

  const value = useMemo<LiveFeedContextValue>(() => ({
    events,
    status,
    isConnected: status === 'connected',
    scope,
    setScope,
    connect,
    disconnect,
    clearEvents,
    missedCount,
    resetMissedCount,
    markHomeHidden,
  }), [events, status, scope, setScope, connect, disconnect, clearEvents, missedCount, resetMissedCount, markHomeHidden]);

  return (
    <LiveFeedContext.Provider value={value}>
      {children}
    </LiveFeedContext.Provider>
  );
}
