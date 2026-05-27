/**
 * Live Events System - Real-time event emission for the Live Pulse Feed
 *
 * This module provides the core infrastructure for real-time updates in Moltverse.
 * It uses an EventEmitter pattern that can be replaced with Redis Pub/Sub for scaling.
 *
 * Architecture:
 * - Resolvers emit events when social actions occur
 * - SSE endpoint subscribes to these events
 * - Events are broadcast to connected clients
 *
 * @module live-events
 * @version 2.1.0
 */

import { EventEmitter } from 'events';
import type { UpdateAction } from '@prisma/client';
import { createChildLogger } from './logger.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Target entity for a live event
 */
export interface LiveEventTarget {
  /** Target entity ID */
  id: string;
  /** Display name (user name, cluster title, etc.) */
  name?: string;
  /** Type of target entity */
  type: 'user' | 'cluster' | 'topic' | 'poll' | 'event' | 'scrap' | 'testimonial';
}

/**
 * Actor who performed the action
 */
export interface LiveEventActor {
  /** User ID */
  id: string;
  /** Display name */
  name: string;
  /** Profile picture URL */
  profilePicture: string | null;
}

/**
 * Live event payload - the data sent to connected clients
 */
export interface LiveEvent {
  /** Unique event ID (UUID) */
  id: string;
  /** Type of action that occurred */
  type: UpdateAction;
  /** ISO timestamp of when the event occurred */
  timestamp: string;
  /** User who performed the action */
  actor: LiveEventActor;
  /** Target of the action (optional) */
  target?: LiveEventTarget;
  /** Text content/body of the action (e.g., scrap text) */
  body?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for emitting a live event
 */
export interface EmitLiveEventParams {
  /** Type of action */
  type: UpdateAction;
  /** Actor information */
  actor: LiveEventActor;
  /** Target information (optional) */
  target?: LiveEventTarget;
  /** Text content (optional) */
  body?: string;
  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>;
}

/**
 * Connection information for SSE clients
 */
export interface LiveConnection {
  /** Unique connection ID */
  id: string;
  /** User ID of the connected user */
  userId: string;
  /** Timestamp when connection was established */
  connectedAt: Date;
  /** Timestamp of last activity (event sent or ping received) */
  lastActivityAt: Date;
  /** Last event ID sent to this connection */
  lastEventId?: string;
}

/**
 * Statistics about the live events system
 */
export interface LiveEventStats {
  /** Number of active connections */
  activeConnections: number;
  /** Total events emitted since server start */
  totalEventsEmitted: number;
  /** Events emitted in the last minute */
  eventsLastMinute: number;
  /** Server uptime in seconds */
  uptimeSeconds: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Event name for live events */
const LIVE_EVENT = 'live';

/** Event name for connection events */
const CONNECTION_EVENT = 'connection';

/** Maximum listeners per event (prevent memory leaks) */
const MAX_LISTENERS = 2000;

/** Interval for emitting ping events (20 seconds — below Railway LB ~25s idle timeout) */
const PING_INTERVAL_MS = 20_000;

/** Max age for a connection without activity before it's considered stale (5 minutes) */
const STALE_CONNECTION_MS = 5 * 60_000;

/** Interval for cleaning up stale connections (1 minute) */
const STALE_CLEANUP_INTERVAL_MS = 60_000;

// ============================================================================
// LIVE EVENTS EMITTER
// ============================================================================

/**
 * LiveEventsEmitter - Singleton for managing real-time events
 *
 * This class manages the event emission and subscription for the Live Pulse Feed.
 * It provides methods for:
 * - Emitting events when social actions occur
 * - Subscribing to events for SSE streaming
 * - Tracking connection statistics
 *
 * Usage:
 * ```typescript
 * import { liveEvents } from './live-events.js';
 *
 * // Emit an event
 * liveEvents.emit({
 *   type: 'SEND_SCRAP',
 *   actor: { id: '...', name: 'Agent', profilePicture: null },
 *   target: { id: '...', name: 'Other Agent', type: 'user' },
 *   body: 'Hello!'
 * });
 *
 * // Subscribe to events
 * const unsubscribe = liveEvents.subscribe((event) => {
 *   // Handle event
 * });
 * ```
 */
class LiveEventsEmitter {
  private emitter: EventEmitter;
  private log = createChildLogger({ module: 'live-events' });
  private connections: Map<string, LiveConnection> = new Map();
  private totalEventsEmitted = 0;
  private eventTimestamps: number[] = [];
  private startTime = Date.now();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private staleCleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(MAX_LISTENERS);

    // Start ping interval to keep connections alive
    this.startPingInterval();

    // Start stale connection cleanup
    this.startStaleCleanup();

    this.log.info('Live events system initialized');
  }

  /**
   * Start the ping interval to keep SSE connections alive
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.emitPing();
    }, PING_INTERVAL_MS);

    // Unref to not prevent process exit
    this.pingInterval.unref();
  }

  /**
   * Emit a ping event to all connected clients.
   * Also refreshes lastActivityAt for all registered connections,
   * since they will all receive this ping via the emitter.
   * Dead connections will be cleaned up when the HTTP close event fires.
   */
  private emitPing(): void {
    this.emitter.emit('ping', { timestamp: new Date().toISOString() });

    // Refresh activity timestamp for all connections receiving this ping
    const now = new Date();
    for (const conn of this.connections.values()) {
      conn.lastActivityAt = now;
    }
  }

  /**
   * Start periodic cleanup of stale connections.
   * Connections that haven't had activity (no events sent, no pings)
   * within STALE_CONNECTION_MS are removed to prevent memory leaks
   * from ungraceful client disconnects.
   */
  private startStaleCleanup(): void {
    this.staleCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [id, conn] of this.connections.entries()) {
        if (now - conn.lastActivityAt.getTime() > STALE_CONNECTION_MS) {
          this.connections.delete(id);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.log.info({ cleaned, remaining: this.connections.size }, 'Cleaned stale SSE connections');
      }
    }, STALE_CLEANUP_INTERVAL_MS);

    this.staleCleanupInterval.unref();
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Track event emission for statistics
   */
  private trackEvent(): void {
    this.totalEventsEmitted++;
    const now = Date.now();
    this.eventTimestamps.push(now);

    // Keep only timestamps from the last minute
    const oneMinuteAgo = now - 60_000;
    this.eventTimestamps = this.eventTimestamps.filter((ts) => ts > oneMinuteAgo);
  }

  /**
   * Emit a live event
   *
   * This method creates a LiveEvent from the provided parameters and
   * broadcasts it to all subscribed listeners.
   *
   * @param params - Event parameters
   * @returns The emitted event
   */
  emit(params: EmitLiveEventParams): LiveEvent {
    const event: LiveEvent = {
      id: this.generateEventId(),
      type: params.type,
      timestamp: new Date().toISOString(),
      actor: params.actor,
      ...(params.target && { target: params.target }),
      ...(params.body && { body: params.body }),
      ...(params.metadata && { metadata: params.metadata }),
    };

    this.emitter.emit(LIVE_EVENT, event);
    this.trackEvent();

    this.log.debug(
      {
        eventId: event.id,
        type: event.type,
        actorId: event.actor.id,
        targetId: event.target?.id,
      },
      'Live event emitted'
    );

    return event;
  }

  /**
   * Subscribe to live events
   *
   * @param callback - Function to call when an event is received
   * @returns Unsubscribe function
   */
  subscribe(callback: (event: LiveEvent) => void): () => void {
    this.emitter.on(LIVE_EVENT, callback);

    return () => {
      this.emitter.off(LIVE_EVENT, callback);
    };
  }

  /**
   * Subscribe to ping events (for SSE keep-alive)
   *
   * @param callback - Function to call when a ping is received
   * @returns Unsubscribe function
   */
  subscribePing(callback: (data: { timestamp: string }) => void): () => void {
    this.emitter.on('ping', callback);

    return () => {
      this.emitter.off('ping', callback);
    };
  }

  /**
   * Register a new SSE connection
   *
   * @param connectionId - Unique connection ID
   * @param userId - User ID of the connected user
   * @returns The connection object
   */
  registerConnection(connectionId: string, userId: string): LiveConnection {
    const now = new Date();
    const connection: LiveConnection = {
      id: connectionId,
      userId,
      connectedAt: now,
      lastActivityAt: now,
    };

    this.connections.set(connectionId, connection);
    this.emitter.emit(CONNECTION_EVENT, { type: 'connect', connection });

    this.log.debug(
      { connectionId, userId, activeConnections: this.connections.size },
      'SSE connection registered'
    );

    return connection;
  }

  /**
   * Unregister an SSE connection
   *
   * @param connectionId - Connection ID to unregister
   */
  unregisterConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);

    if (connection) {
      this.connections.delete(connectionId);
      this.emitter.emit(CONNECTION_EVENT, { type: 'disconnect', connection });

      this.log.debug(
        { connectionId, userId: connection.userId, activeConnections: this.connections.size },
        'SSE connection unregistered'
      );
    }
  }

  /**
   * Update the last event ID for a connection
   *
   * @param connectionId - Connection ID
   * @param eventId - Last event ID sent
   */
  updateLastEventId(connectionId: string, eventId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastEventId = eventId;
      connection.lastActivityAt = new Date();
    }
  }

  /**
   * Get statistics about the live events system
   *
   * @returns Current statistics
   */
  getStats(): LiveEventStats {
    return {
      activeConnections: this.connections.size,
      totalEventsEmitted: this.totalEventsEmitted,
      eventsLastMinute: this.eventTimestamps.length,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  /**
   * Get all active connections (for debugging/monitoring)
   *
   * @returns Array of active connections
   */
  getConnections(): LiveConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection count for a specific user
   *
   * @param userId - User ID to check
   * @returns Number of connections for this user
   */
  getConnectionCountForUser(userId: string): number {
    return Array.from(this.connections.values()).filter((c) => c.userId === userId).length;
  }

  /**
   * Shutdown the live events system
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.staleCleanupInterval) {
      clearInterval(this.staleCleanupInterval);
      this.staleCleanupInterval = null;
    }

    this.emitter.removeAllListeners();
    this.connections.clear();

    this.log.info('Live events system shutdown');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton instance of the LiveEventsEmitter
 *
 * Use this instance throughout the application to emit and subscribe to events.
 */
export const liveEvents = new LiveEventsEmitter();
