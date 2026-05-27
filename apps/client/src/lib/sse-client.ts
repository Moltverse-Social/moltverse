/**
 * SSE Client - Server-Sent Events wrapper for Live Pulse Feed
 *
 * Provides a robust SSE connection with:
 * - Automatic reconnection with exponential backoff
 * - Event type parsing and validation
 * - Connection state management
 * - Graceful cleanup on disconnect
 *
 * @module sse-client
 */

import type {
  LiveEvent,
  LiveSystemEvent,
  LivePingEvent,
  LiveFeedScope,
  UpdateAction,
  LiveFeedConnectionStatus,
} from '../types';

// Debug logging for SSE connection issues (enabled in development)
const DEBUG_SSE = import.meta.env.DEV;
const debugLog = (...args: unknown[]) => {
  if (DEBUG_SSE) {
    console.log('[SSEClient]', ...args);
  }
};

// ============================================================================
// CONSTANTS
// ============================================================================

/** API URL from environment or empty for relative paths */
const API_URL = import.meta.env.VITE_API_URL || '';

/** Base SSE endpoint path */
const SSE_ENDPOINT = `${API_URL}/api/v1/live/subscribe`;

/** Initial reconnect delay in ms */
const INITIAL_RECONNECT_DELAY = 1000;

/** Maximum reconnect delay in ms */
const MAX_RECONNECT_DELAY = 30000;

/** Backoff multiplier for reconnection attempts */
const BACKOFF_MULTIPLIER = 2;

// ============================================================================
// TYPES
// ============================================================================

/**
 * SSE client event handlers
 */
export interface SSEClientHandlers {
  /** Called when a live event is received */
  onEvent?: (event: LiveEvent) => void;
  /** Called when connection is established */
  onConnect?: (event: LiveSystemEvent) => void;
  /** Called when a ping is received */
  onPing?: (event: LivePingEvent) => void;
  /** Called when connection status changes */
  onStatusChange?: (status: LiveFeedConnectionStatus) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

/**
 * SSE client configuration
 */
export interface SSEClientConfig {
  /** Scope for filtering events */
  scope?: LiveFeedScope;
  /** Event types to include (undefined = all) */
  types?: UpdateAction[];
  /** Whether to auto-reconnect on disconnect */
  autoReconnect?: boolean;
}

// ============================================================================
// SSE CLIENT CLASS
// ============================================================================

/**
 * SSEClient - Manages SSE connection for Live Pulse Feed
 *
 * Usage:
 * ```typescript
 * const client = new SSEClient(
 *   { scope: 'GLOBAL', autoReconnect: true },
 *   {
 *     onEvent: (event) => console.log('Event:', event),
 *     onStatusChange: (status) => console.log('Status:', status),
 *   }
 * );
 *
 * client.connect();
 * // ... later
 * client.disconnect();
 * ```
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private config: SSEClientConfig;
  private handlers: SSEClientHandlers;
  private status: LiveFeedConnectionStatus = 'disconnected';
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectionId: string | null = null;

  constructor(config: SSEClientConfig, handlers: SSEClientHandlers) {
    this.config = {
      scope: 'GLOBAL',
      autoReconnect: true,
      ...config,
    };
    this.handlers = handlers;
  }

  /**
   * Get current connection status
   */
  getStatus(): LiveFeedConnectionStatus {
    return this.status;
  }

  /**
   * Get current connection ID (if connected)
   */
  getConnectionId(): string | null {
    return this.connectionId;
  }

  /**
   * Build SSE URL with query parameters
   */
  private buildUrl(): string {
    const params = new URLSearchParams();

    if (this.config.scope) {
      params.set('scope', this.config.scope);
    }

    if (this.config.types && this.config.types.length > 0) {
      params.set('types', this.config.types.join(','));
    }

    const queryString = params.toString();
    return queryString ? `${SSE_ENDPOINT}?${queryString}` : SSE_ENDPOINT;
  }

  /**
   * Update connection status and notify handler
   */
  private setStatus(status: LiveFeedConnectionStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.handlers.onStatusChange?.(status);
    }
  }

  /**
   * Parse and validate a live event from SSE data
   */
  private parseEvent(data: string): LiveEvent | null {
    try {
      const parsed = JSON.parse(data);

      // Validate required fields
      if (!parsed.id || !parsed.type || !parsed.timestamp || !parsed.actor) {
        console.warn('[SSE] Invalid event structure:', parsed);
        return null;
      }

      return parsed as LiveEvent;
    } catch (error) {
      console.error('[SSE] Failed to parse event:', error);
      return null;
    }
  }

  /**
   * Parse system event (connection established)
   */
  private parseSystemEvent(data: string): LiveSystemEvent | null {
    try {
      return JSON.parse(data) as LiveSystemEvent;
    } catch {
      return null;
    }
  }

  /**
   * Parse ping event
   */
  private parsePingEvent(data: string): LivePingEvent | null {
    try {
      return JSON.parse(data) as LivePingEvent;
    } catch {
      return null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.config.autoReconnect) {
      return;
    }

    this.setStatus('reconnecting');

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Increase delay for next attempt (exponential backoff)
    this.reconnectDelay = Math.min(
      this.reconnectDelay * BACKOFF_MULTIPLIER,
      MAX_RECONNECT_DELAY
    );
  }

  /**
   * Reset reconnection delay (called on successful connection)
   */
  private resetReconnectDelay(): void {
    this.reconnectDelay = INITIAL_RECONNECT_DELAY;
  }

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    debugLog('connect() called', {
      hasEventSource: !!this.eventSource,
      status: this.status
    });

    // Don't connect if already connected or connecting
    if (this.eventSource && this.status !== 'disconnected') {
      debugLog('Skipping connect - already connected or connecting');
      return;
    }

    // Clear any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.setStatus('connecting');

    const url = this.buildUrl();
    debugLog('Creating EventSource', { url });

    // Create EventSource with credentials for cookie-based auth
    this.eventSource = new EventSource(url, {
      withCredentials: true,
    });

    // Handle system events (connection established)
    this.eventSource.addEventListener('system', (event) => {
      debugLog('System event received', event.data);
      const systemEvent = this.parseSystemEvent(event.data);
      if (systemEvent && systemEvent.type === 'connected') {
        debugLog('Connection established', { connectionId: systemEvent.connectionId });
        this.connectionId = systemEvent.connectionId;
        this.setStatus('connected');
        this.resetReconnectDelay();
        this.handlers.onConnect?.(systemEvent);
      }
    });

    // Handle live events
    this.eventSource.addEventListener('live', (event) => {
      const liveEvent = this.parseEvent(event.data);
      if (liveEvent) {
        this.handlers.onEvent?.(liveEvent);
      }
    });

    // Handle ping events
    this.eventSource.addEventListener('ping', (event) => {
      const pingEvent = this.parsePingEvent(event.data);
      if (pingEvent) {
        this.handlers.onPing?.(pingEvent);
      }
    });

    // Handle errors
    this.eventSource.onerror = (event) => {
      debugLog('EventSource error', {
        wasConnected: this.status === 'connected',
        readyState: (event.target as EventSource)?.readyState
      });

      const wasConnected = this.status === 'connected';
      this.connectionId = null;

      // EventSource automatically tries to reconnect on error
      // But we want to control the backoff ourselves
      this.eventSource?.close();
      this.eventSource = null;

      // Check if this was a 401 (auth error) by looking at readyState
      // When EventSource fails to connect due to HTTP error, it goes to CLOSED (2)
      // We can't get the HTTP status directly, but if we weren't connected
      // and the connection failed, it's likely an auth issue
      const isAuthError = !wasConnected && (event.target as EventSource)?.readyState === 2;

      if (wasConnected) {
        debugLog('Connection lost, scheduling reconnect');
        this.handlers.onError?.(new Error('SSE connection lost'));
        // Only reconnect if we were previously connected (network issue)
        this.scheduleReconnect();
      } else {
        // Connection failed before establishing - likely auth error
        // Don't auto-reconnect to avoid infinite 401 loop
        debugLog('Connection failed', { isAuthError });
        this.handlers.onError?.(new Error('SSE connection failed'));
        this.setStatus('disconnected');

        if (isAuthError) {
          debugLog('Connection failed, likely auth issue. Not auto-reconnecting.');
        }
      }
    };
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    // Clear any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close event source
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.connectionId = null;
    this.setStatus('disconnected');
    this.resetReconnectDelay();
  }

  /**
   * Update configuration and reconnect if necessary
   */
  updateConfig(newConfig: Partial<SSEClientConfig>): void {
    const needsReconnect =
      this.status === 'connected' &&
      (newConfig.scope !== this.config.scope ||
        JSON.stringify(newConfig.types) !== JSON.stringify(this.config.types));

    this.config = { ...this.config, ...newConfig };

    if (needsReconnect) {
      this.disconnect();
      this.connect();
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new SSE client instance
 *
 * @param config - Client configuration
 * @param handlers - Event handlers
 * @returns SSE client instance
 */
export function createSSEClient(
  config: SSEClientConfig,
  handlers: SSEClientHandlers
): SSEClient {
  return new SSEClient(config, handlers);
}
