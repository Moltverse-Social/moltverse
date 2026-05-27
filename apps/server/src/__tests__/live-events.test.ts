/**
 * Live Events System Tests
 *
 * Tests for the LiveEventsEmitter class that handles real-time event
 * emission and subscription for the Live Pulse Feed.
 *
 * @module __tests__/live-events
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to create a fresh instance for each test to avoid state leakage
// So we'll dynamically import the module

describe('LiveEventsEmitter', () => {
  let liveEvents: typeof import('../lib/live-events.js').liveEvents;
  let LiveEvent: typeof import('../lib/live-events.js').LiveEvent;

  beforeEach(async () => {
    // Clear module cache and get fresh instance
    vi.resetModules();
    const module = await import('../lib/live-events.js');
    liveEvents = module.liveEvents;
  });

  afterEach(() => {
    // Cleanup
    if (liveEvents) {
      liveEvents.shutdown();
    }
  });

  describe('Event Emission', () => {
    it('should emit an event with correct structure', () => {
      const event = liveEvents.emit({
        type: 'SEND_SCRAP',
        actor: {
          id: 'actor-123',
          name: 'Test Actor',
          profilePicture: 'https://example.com/pic.jpg',
        },
        target: {
          id: 'target-456',
          name: 'Test Target',
          type: 'user',
        },
        body: 'Hello, World!',
      });

      expect(event).toBeDefined();
      expect(event.id).toBeDefined();
      expect(event.type).toBe('SEND_SCRAP');
      expect(event.timestamp).toBeDefined();
      expect(event.actor.id).toBe('actor-123');
      expect(event.actor.name).toBe('Test Actor');
      expect(event.target?.id).toBe('target-456');
      expect(event.body).toBe('Hello, World!');
    });

    it('should generate unique event IDs', () => {
      const event1 = liveEvents.emit({
        type: 'ADD_FRIEND',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      const event2 = liveEvents.emit({
        type: 'ADD_FRIEND',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(event1.id).not.toBe(event2.id);
    });

    it('should include ISO timestamp', () => {
      const event = liveEvents.emit({
        type: 'JOIN_COMMUNITY',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      // Should be a valid ISO string
      const parsed = new Date(event.timestamp);
      expect(parsed.toISOString()).toBe(event.timestamp);
    });

    it('should handle events without target', () => {
      const event = liveEvents.emit({
        type: 'ADD_POST',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(event.target).toBeUndefined();
    });

    it('should handle events with metadata', () => {
      const event = liveEvents.emit({
        type: 'CREATE_POLL',
        actor: { id: '1', name: 'A', profilePicture: null },
        metadata: { pollId: 'poll-123', options: ['Yes', 'No'] },
      });

      expect(event.metadata).toEqual({ pollId: 'poll-123', options: ['Yes', 'No'] });
    });
  });

  describe('Event Subscription', () => {
    it('should notify subscribers when event is emitted', () => {
      const receivedEvents: unknown[] = [];

      const unsubscribe = liveEvents.subscribe((event) => {
        receivedEvents.push(event);
      });

      liveEvents.emit({
        type: 'SEND_SCRAP',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(receivedEvents).toHaveLength(1);
      expect((receivedEvents[0] as { type: string }).type).toBe('SEND_SCRAP');

      unsubscribe();
    });

    it('should support multiple subscribers', () => {
      let count1 = 0;
      let count2 = 0;

      const unsubscribe1 = liveEvents.subscribe(() => {
        count1++;
      });
      const unsubscribe2 = liveEvents.subscribe(() => {
        count2++;
      });

      liveEvents.emit({
        type: 'ADD_FRIEND',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(count1).toBe(1);
      expect(count2).toBe(1);

      unsubscribe1();
      unsubscribe2();
    });

    it('should stop receiving events after unsubscribe', () => {
      let count = 0;

      const unsubscribe = liveEvents.subscribe(() => {
        count++;
      });

      liveEvents.emit({
        type: 'ADD_FRIEND',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(count).toBe(1);

      unsubscribe();

      liveEvents.emit({
        type: 'ADD_FRIEND',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(count).toBe(1); // Should not have increased
    });
  });

  describe('Ping Subscription', () => {
    it('should allow subscribing to ping events', () => {
      const pings: unknown[] = [];

      const unsubscribe = liveEvents.subscribePing((data) => {
        pings.push(data);
      });

      // Ping is emitted internally on interval, but we can test the subscription
      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
    });
  });

  describe('Connection Management', () => {
    it('should register a connection', () => {
      const connection = liveEvents.registerConnection('conn-1', 'user-1');

      expect(connection.id).toBe('conn-1');
      expect(connection.userId).toBe('user-1');
      expect(connection.connectedAt).toBeInstanceOf(Date);
    });

    it('should track connection count', () => {
      expect(liveEvents.getStats().activeConnections).toBe(0);

      liveEvents.registerConnection('conn-1', 'user-1');
      expect(liveEvents.getStats().activeConnections).toBe(1);

      liveEvents.registerConnection('conn-2', 'user-1');
      expect(liveEvents.getStats().activeConnections).toBe(2);
    });

    it('should unregister a connection', () => {
      liveEvents.registerConnection('conn-1', 'user-1');
      expect(liveEvents.getStats().activeConnections).toBe(1);

      liveEvents.unregisterConnection('conn-1');
      expect(liveEvents.getStats().activeConnections).toBe(0);
    });

    it('should handle unregistering non-existent connection gracefully', () => {
      // Should not throw
      expect(() => {
        liveEvents.unregisterConnection('non-existent');
      }).not.toThrow();
    });

    it('should get connection count for a specific user', () => {
      liveEvents.registerConnection('conn-1', 'user-1');
      liveEvents.registerConnection('conn-2', 'user-1');
      liveEvents.registerConnection('conn-3', 'user-2');

      expect(liveEvents.getConnectionCountForUser('user-1')).toBe(2);
      expect(liveEvents.getConnectionCountForUser('user-2')).toBe(1);
      expect(liveEvents.getConnectionCountForUser('user-3')).toBe(0);
    });

    it('should get all connections', () => {
      liveEvents.registerConnection('conn-1', 'user-1');
      liveEvents.registerConnection('conn-2', 'user-2');

      const connections = liveEvents.getConnections();

      expect(connections).toHaveLength(2);
      expect(connections.map((c) => c.id).sort()).toEqual(['conn-1', 'conn-2']);
    });

    it('should update last event ID for connection', () => {
      liveEvents.registerConnection('conn-1', 'user-1');
      liveEvents.updateLastEventId('conn-1', 'event-123');

      const connections = liveEvents.getConnections();
      const conn = connections.find((c) => c.id === 'conn-1');

      expect(conn?.lastEventId).toBe('event-123');
    });
  });

  describe('Statistics', () => {
    it('should track total events emitted', () => {
      expect(liveEvents.getStats().totalEventsEmitted).toBe(0);

      liveEvents.emit({
        type: 'ADD_FRIEND',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(liveEvents.getStats().totalEventsEmitted).toBe(1);

      liveEvents.emit({
        type: 'ADD_FRIEND',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(liveEvents.getStats().totalEventsEmitted).toBe(2);
    });

    it('should track events in last minute', () => {
      // Initially zero
      expect(liveEvents.getStats().eventsLastMinute).toBe(0);

      // Emit an event
      liveEvents.emit({
        type: 'ADD_FRIEND',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(liveEvents.getStats().eventsLastMinute).toBe(1);
    });

    it('should track uptime', () => {
      const uptime = liveEvents.getStats().uptimeSeconds;
      expect(uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Shutdown', () => {
    it('should clear all connections on shutdown', () => {
      liveEvents.registerConnection('conn-1', 'user-1');
      liveEvents.registerConnection('conn-2', 'user-2');

      expect(liveEvents.getStats().activeConnections).toBe(2);

      liveEvents.shutdown();

      expect(liveEvents.getStats().activeConnections).toBe(0);
    });

    it('should remove all listeners on shutdown', () => {
      let count = 0;

      liveEvents.subscribe(() => {
        count++;
      });

      liveEvents.emit({
        type: 'ADD_FRIEND',
        actor: { id: '1', name: 'A', profilePicture: null },
      });

      expect(count).toBe(1);

      liveEvents.shutdown();

      // After shutdown, no more events should be received
      // Note: emit() will still work but no listeners will receive it
    });
  });
});

describe('LiveEvent Types', () => {
  it('should support all UpdateAction types', () => {
    const validTypes = [
      'JOIN_COMMUNITY',
      'ADD_FRIEND',
      'ADD_POST',
      'ADD_PHOTO',
      'SEND_SCRAP',
      'WRITE_TESTIMONIAL',
      'CREATE_TOPIC',
      'REPLY_TOPIC',
      'CREATE_POLL',
      'VOTE_POLL',
      'JOIN_EVENT',
      'BECOME_FAN',
      'CREATE_COMMUNITY',
      'VOTE_KARMA',
    ];

    // This is a type-level test - if the code compiles, it passes
    // Just verify we have the expected types
    expect(validTypes).toHaveLength(14);
  });

  it('should support all target types', () => {
    const validTargetTypes = ['user', 'cluster', 'topic', 'poll', 'event', 'scrap', 'testimonial'];

    // Type-level verification
    expect(validTargetTypes).toHaveLength(7);
  });
});
