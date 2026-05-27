/**
 * Live Utilities Tests
 *
 * Tests for the pure functions used by the Live Feed system.
 * These functions handle validation and filtering of live events.
 *
 * @module __tests__/live-utils
 */

import { describe, it, expect } from 'vitest';
import {
  parseAndValidateTypes,
  shouldSendEvent,
  isValidScope,
  VALID_UPDATE_ACTIONS,
  VALID_SCOPES,
  type LiveFeedScope,
} from '../lib/live-utils.js';
import type { LiveEvent } from '../lib/live-events.js';
import type { UpdateAction } from '@prisma/client';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock LiveEvent for testing
 */
function createMockEvent(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    id: 'event-123',
    type: 'SEND_SCRAP',
    timestamp: new Date().toISOString(),
    actor: {
      id: 'actor-123',
      name: 'Test Actor',
      profilePicture: null,
    },
    ...overrides,
  };
}

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('Constants', () => {
  describe('VALID_UPDATE_ACTIONS', () => {
    it('should contain all 14 action types', () => {
      expect(VALID_UPDATE_ACTIONS).toHaveLength(14);
    });

    it('should contain original actions', () => {
      expect(VALID_UPDATE_ACTIONS).toContain('JOIN_CLUSTER');
      expect(VALID_UPDATE_ACTIONS).toContain('ADD_FRIEND');
      expect(VALID_UPDATE_ACTIONS).toContain('ADD_POST');
      expect(VALID_UPDATE_ACTIONS).toContain('ADD_PHOTO');
    });

    it('should contain Live Pulse Feed actions', () => {
      expect(VALID_UPDATE_ACTIONS).toContain('SEND_SCRAP');
      expect(VALID_UPDATE_ACTIONS).toContain('WRITE_TESTIMONIAL');
      expect(VALID_UPDATE_ACTIONS).toContain('CREATE_TOPIC');
      expect(VALID_UPDATE_ACTIONS).toContain('REPLY_TOPIC');
      expect(VALID_UPDATE_ACTIONS).toContain('CREATE_POLL');
      expect(VALID_UPDATE_ACTIONS).toContain('VOTE_POLL');
      expect(VALID_UPDATE_ACTIONS).toContain('JOIN_EVENT');
      expect(VALID_UPDATE_ACTIONS).toContain('BECOME_FAN');
    });

    it('should contain v2.2.0 actions', () => {
      expect(VALID_UPDATE_ACTIONS).toContain('CREATE_CLUSTER');
      expect(VALID_UPDATE_ACTIONS).toContain('VOTE_KARMA');
    });
  });

  describe('VALID_SCOPES', () => {
    it('should contain all 3 scope types', () => {
      expect(VALID_SCOPES).toHaveLength(3);
    });

    it('should contain expected scopes', () => {
      expect(VALID_SCOPES).toContain('GLOBAL');
      expect(VALID_SCOPES).toContain('FRIENDS');
      expect(VALID_SCOPES).toContain('MY_AGENT');
    });
  });
});

// ============================================================================
// isValidScope TESTS
// ============================================================================

describe('isValidScope', () => {
  it('should return true for GLOBAL', () => {
    expect(isValidScope('GLOBAL')).toBe(true);
  });

  it('should return true for FRIENDS', () => {
    expect(isValidScope('FRIENDS')).toBe(true);
  });

  it('should return true for MY_AGENT', () => {
    expect(isValidScope('MY_AGENT')).toBe(true);
  });

  it('should return false for invalid scope', () => {
    expect(isValidScope('INVALID')).toBe(false);
  });

  it('should return false for lowercase scope', () => {
    expect(isValidScope('global')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isValidScope('')).toBe(false);
  });

  it('should return false for partial match', () => {
    expect(isValidScope('GLOB')).toBe(false);
    expect(isValidScope('FRIEND')).toBe(false);
  });
});

// ============================================================================
// parseAndValidateTypes TESTS
// ============================================================================

describe('parseAndValidateTypes', () => {
  describe('when types is undefined or empty', () => {
    it('should return valid with null types for undefined', () => {
      const result = parseAndValidateTypes(undefined);

      expect(result.valid).toBe(true);
      expect(result.types).toBeNull();
      expect(result.invalidTypes).toHaveLength(0);
    });

    it('should return valid with null types for empty string', () => {
      const result = parseAndValidateTypes('');

      expect(result.valid).toBe(true);
      expect(result.types).toBeNull();
      expect(result.invalidTypes).toHaveLength(0);
    });

    it('should return valid with null types for whitespace only', () => {
      const result = parseAndValidateTypes('   ');

      expect(result.valid).toBe(true);
      expect(result.types).toBeNull();
      expect(result.invalidTypes).toHaveLength(0);
    });
  });

  describe('when types contains valid values', () => {
    it('should parse single valid type', () => {
      const result = parseAndValidateTypes('SEND_SCRAP');

      expect(result.valid).toBe(true);
      expect(result.types).toBeInstanceOf(Set);
      expect(result.types?.has('SEND_SCRAP')).toBe(true);
      expect(result.types?.size).toBe(1);
      expect(result.invalidTypes).toHaveLength(0);
    });

    it('should parse multiple valid types', () => {
      const result = parseAndValidateTypes('SEND_SCRAP,ADD_FRIEND,JOIN_CLUSTER');

      expect(result.valid).toBe(true);
      expect(result.types?.size).toBe(3);
      expect(result.types?.has('SEND_SCRAP')).toBe(true);
      expect(result.types?.has('ADD_FRIEND')).toBe(true);
      expect(result.types?.has('JOIN_CLUSTER')).toBe(true);
    });

    it('should handle spaces around type names', () => {
      const result = parseAndValidateTypes('  SEND_SCRAP  ,  ADD_FRIEND  ');

      expect(result.valid).toBe(true);
      expect(result.types?.size).toBe(2);
      expect(result.types?.has('SEND_SCRAP')).toBe(true);
      expect(result.types?.has('ADD_FRIEND')).toBe(true);
    });

    it('should be case-insensitive (convert to uppercase)', () => {
      const result = parseAndValidateTypes('send_scrap,Add_Friend');

      expect(result.valid).toBe(true);
      expect(result.types?.has('SEND_SCRAP')).toBe(true);
      expect(result.types?.has('ADD_FRIEND')).toBe(true);
    });

    it('should deduplicate repeated types', () => {
      const result = parseAndValidateTypes('SEND_SCRAP,SEND_SCRAP,SEND_SCRAP');

      expect(result.valid).toBe(true);
      expect(result.types?.size).toBe(1);
    });

    it('should parse all valid types', () => {
      const allTypes = VALID_UPDATE_ACTIONS.join(',');
      const result = parseAndValidateTypes(allTypes);

      expect(result.valid).toBe(true);
      expect(result.types?.size).toBe(VALID_UPDATE_ACTIONS.length);
    });
  });

  describe('when types contains invalid values', () => {
    it('should reject single invalid type', () => {
      const result = parseAndValidateTypes('INVALID_TYPE');

      expect(result.valid).toBe(false);
      expect(result.types).toBeNull();
      expect(result.invalidTypes).toContain('INVALID_TYPE');
    });

    it('should reject mixed valid and invalid types', () => {
      const result = parseAndValidateTypes('SEND_SCRAP,INVALID_TYPE,ADD_FRIEND');

      expect(result.valid).toBe(false);
      expect(result.types).toBeNull();
      expect(result.invalidTypes).toContain('INVALID_TYPE');
      expect(result.invalidTypes).not.toContain('SEND_SCRAP');
      expect(result.invalidTypes).not.toContain('ADD_FRIEND');
    });

    it('should report all invalid types', () => {
      const result = parseAndValidateTypes('INVALID1,SEND_SCRAP,INVALID2,INVALID3');

      expect(result.valid).toBe(false);
      expect(result.invalidTypes).toHaveLength(3);
      expect(result.invalidTypes).toContain('INVALID1');
      expect(result.invalidTypes).toContain('INVALID2');
      expect(result.invalidTypes).toContain('INVALID3');
    });

    it('should reject types with typos', () => {
      const result = parseAndValidateTypes('SEND_SCRAPX');

      expect(result.valid).toBe(false);
      expect(result.invalidTypes).toContain('SEND_SCRAPX');
    });
  });

  describe('edge cases', () => {
    it('should handle trailing comma', () => {
      const result = parseAndValidateTypes('SEND_SCRAP,');

      expect(result.valid).toBe(true);
      expect(result.types?.size).toBe(1);
    });

    it('should handle leading comma', () => {
      const result = parseAndValidateTypes(',SEND_SCRAP');

      expect(result.valid).toBe(true);
      expect(result.types?.size).toBe(1);
    });

    it('should handle multiple consecutive commas', () => {
      const result = parseAndValidateTypes('SEND_SCRAP,,ADD_FRIEND');

      expect(result.valid).toBe(true);
      expect(result.types?.size).toBe(2);
    });
  });
});

// ============================================================================
// shouldSendEvent TESTS
// ============================================================================

describe('shouldSendEvent', () => {
  const userId = 'user-123';
  const friendId = 'friend-456';
  const strangerId = 'stranger-789';
  const friendIds = new Set([friendId]);

  describe('GLOBAL scope', () => {
    const scope: LiveFeedScope = 'GLOBAL';

    it('should allow all events with no type filter', () => {
      const event = createMockEvent({ actor: { id: strangerId, name: 'Stranger', profilePicture: null } });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(true);
    });

    it('should filter by type when types are specified', () => {
      const event = createMockEvent({ type: 'SEND_SCRAP' });
      const allowedTypes = new Set<UpdateAction>(['ADD_FRIEND']);

      expect(shouldSendEvent(event, userId, scope, friendIds, allowedTypes)).toBe(false);
    });

    it('should allow event when type is in allowed types', () => {
      const event = createMockEvent({ type: 'SEND_SCRAP' });
      const allowedTypes = new Set<UpdateAction>(['SEND_SCRAP', 'ADD_FRIEND']);

      expect(shouldSendEvent(event, userId, scope, friendIds, allowedTypes)).toBe(true);
    });
  });

  describe('FRIENDS scope', () => {
    const scope: LiveFeedScope = 'FRIENDS';

    it('should allow events from self', () => {
      const event = createMockEvent({ actor: { id: userId, name: 'Self', profilePicture: null } });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(true);
    });

    it('should allow events from friends', () => {
      const event = createMockEvent({ actor: { id: friendId, name: 'Friend', profilePicture: null } });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(true);
    });

    it('should allow events targeting friends', () => {
      const event = createMockEvent({
        actor: { id: strangerId, name: 'Stranger', profilePicture: null },
        target: { id: friendId, name: 'Friend', type: 'user' },
      });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(true);
    });

    it('should reject events from strangers not targeting friends', () => {
      const event = createMockEvent({
        actor: { id: strangerId, name: 'Stranger', profilePicture: null },
      });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(false);
    });

    it('should reject events targeting non-user entities from strangers', () => {
      const event = createMockEvent({
        actor: { id: strangerId, name: 'Stranger', profilePicture: null },
        target: { id: 'cluster-1', name: 'Cluster', type: 'cluster' },
      });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(false);
    });

    it('should apply type filter before scope filter', () => {
      const event = createMockEvent({
        type: 'SEND_SCRAP',
        actor: { id: friendId, name: 'Friend', profilePicture: null },
      });
      const allowedTypes = new Set<UpdateAction>(['ADD_FRIEND']);

      expect(shouldSendEvent(event, userId, scope, friendIds, allowedTypes)).toBe(false);
    });
  });

  describe('MY_AGENT scope', () => {
    const scope: LiveFeedScope = 'MY_AGENT';

    it('should allow events where user is actor', () => {
      const event = createMockEvent({
        actor: { id: userId, name: 'Self', profilePicture: null },
      });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(true);
    });

    it('should allow events where user is target', () => {
      const event = createMockEvent({
        actor: { id: strangerId, name: 'Stranger', profilePicture: null },
        target: { id: userId, name: 'Self', type: 'user' },
      });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(true);
    });

    it('should reject events not involving user', () => {
      const event = createMockEvent({
        actor: { id: strangerId, name: 'Stranger', profilePicture: null },
        target: { id: friendId, name: 'Friend', type: 'user' },
      });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(false);
    });

    it('should reject events with no target not from user', () => {
      const event = createMockEvent({
        actor: { id: strangerId, name: 'Stranger', profilePicture: null },
      });

      expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(false);
    });

    it('should apply type filter', () => {
      const event = createMockEvent({
        type: 'SEND_SCRAP',
        actor: { id: userId, name: 'Self', profilePicture: null },
      });
      const allowedTypes = new Set<UpdateAction>(['ADD_FRIEND']);

      expect(shouldSendEvent(event, userId, scope, friendIds, allowedTypes)).toBe(false);
    });
  });

  describe('type filtering', () => {
    const scope: LiveFeedScope = 'GLOBAL';

    it('should allow all types when allowedTypes is null', () => {
      for (const type of VALID_UPDATE_ACTIONS) {
        const event = createMockEvent({ type });
        expect(shouldSendEvent(event, userId, scope, friendIds, null)).toBe(true);
      }
    });

    it('should filter to single type', () => {
      const allowedTypes = new Set<UpdateAction>(['SEND_SCRAP']);

      expect(
        shouldSendEvent(createMockEvent({ type: 'SEND_SCRAP' }), userId, scope, friendIds, allowedTypes)
      ).toBe(true);

      expect(
        shouldSendEvent(createMockEvent({ type: 'ADD_FRIEND' }), userId, scope, friendIds, allowedTypes)
      ).toBe(false);
    });

    it('should filter to multiple types', () => {
      const allowedTypes = new Set<UpdateAction>(['SEND_SCRAP', 'ADD_FRIEND', 'JOIN_COMMUNITY']);

      expect(
        shouldSendEvent(createMockEvent({ type: 'SEND_SCRAP' }), userId, scope, friendIds, allowedTypes)
      ).toBe(true);

      expect(
        shouldSendEvent(createMockEvent({ type: 'ADD_FRIEND' }), userId, scope, friendIds, allowedTypes)
      ).toBe(true);

      expect(
        shouldSendEvent(createMockEvent({ type: 'JOIN_COMMUNITY' }), userId, scope, friendIds, allowedTypes)
      ).toBe(true);

      expect(
        shouldSendEvent(createMockEvent({ type: 'BECOME_FAN' }), userId, scope, friendIds, allowedTypes)
      ).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty friend set', () => {
      const event = createMockEvent({
        actor: { id: friendId, name: 'Friend', profilePicture: null },
      });

      expect(shouldSendEvent(event, userId, 'FRIENDS', new Set(), null)).toBe(false);
    });

    it('should handle event without target', () => {
      const event = createMockEvent({
        actor: { id: userId, name: 'Self', profilePicture: null },
        target: undefined,
      });

      expect(shouldSendEvent(event, userId, 'MY_AGENT', friendIds, null)).toBe(true);
    });
  });
});
