/**
 * Live Feed Utilities - Pure functions for event filtering and validation
 *
 * This module contains pure functions used by the Live Feed system.
 * Separated from live.ts for better testability and modularity.
 *
 * @module live-utils
 * @version 1.0.0
 */

import type { UpdateAction } from '@prisma/client';
import type { LiveEvent } from './live-events.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Scope filter for live feed subscription
 */
export type LiveFeedScope = 'GLOBAL' | 'FRIENDS' | 'MY_AGENT';

/**
 * Result of parsing and validating the types parameter
 */
export interface TypesValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Set of valid types, or null if all types are allowed */
  types: Set<UpdateAction> | null;
  /** List of invalid type strings that were rejected */
  invalidTypes: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Valid UpdateAction values for type filtering
 * This must be kept in sync with the Prisma schema enum
 */
export const VALID_UPDATE_ACTIONS: readonly UpdateAction[] = [
  // Original actions
  'JOIN_CLUSTER',
  'ADD_FRIEND',
  'ADD_POST',
  'ADD_PHOTO',
  // Live Pulse Feed actions (v2.1.0)
  'SEND_SCRAP',
  'WRITE_TESTIMONIAL',
  'CREATE_TOPIC',
  'REPLY_TOPIC',
  'CREATE_POLL',
  'VOTE_POLL',
  'JOIN_EVENT',
  'BECOME_FAN',
  // Additional Live Pulse Feed actions (v2.2.0)
  'CREATE_CLUSTER',
  'VOTE_KARMA',
] as const;

/** Set for O(1) lookup of valid action types */
export const VALID_UPDATE_ACTIONS_SET = new Set<string>(VALID_UPDATE_ACTIONS);

/** Valid scope values */
export const VALID_SCOPES: readonly LiveFeedScope[] = ['GLOBAL', 'FRIENDS', 'MY_AGENT'] as const;

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Parse and validate the types query parameter
 *
 * Accepts a comma-separated string of event types and validates each one
 * against the known UpdateAction enum values.
 *
 * @param typesParam - Comma-separated list of event types (e.g., "SEND_SCRAP,ADD_FRIEND")
 * @returns Validation result with parsed types or error details
 *
 * @example
 * // Valid types
 * parseAndValidateTypes("SEND_SCRAP,ADD_FRIEND")
 * // Returns: { valid: true, types: Set(['SEND_SCRAP', 'ADD_FRIEND']), invalidTypes: [] }
 *
 * @example
 * // Invalid types
 * parseAndValidateTypes("SEND_SCRAP,INVALID_TYPE")
 * // Returns: { valid: false, types: null, invalidTypes: ['INVALID_TYPE'] }
 *
 * @example
 * // Empty or undefined
 * parseAndValidateTypes(undefined)
 * // Returns: { valid: true, types: null, invalidTypes: [] } (null means all types)
 */
export function parseAndValidateTypes(typesParam: string | undefined): TypesValidationResult {
  // If no types specified, return null (means all types allowed)
  if (!typesParam || typesParam.trim() === '') {
    return { valid: true, types: null, invalidTypes: [] };
  }

  const requestedTypes = typesParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0);

  if (requestedTypes.length === 0) {
    return { valid: true, types: null, invalidTypes: [] };
  }

  const validTypes = new Set<UpdateAction>();
  const invalidTypes: string[] = [];

  for (const type of requestedTypes) {
    if (VALID_UPDATE_ACTIONS_SET.has(type)) {
      validTypes.add(type as UpdateAction);
    } else {
      invalidTypes.push(type);
    }
  }

  // If there are invalid types, return error
  if (invalidTypes.length > 0) {
    return { valid: false, types: null, invalidTypes };
  }

  // If all types are valid but the set is empty (shouldn't happen), allow all
  if (validTypes.size === 0) {
    return { valid: true, types: null, invalidTypes: [] };
  }

  return { valid: true, types: validTypes, invalidTypes: [] };
}

/**
 * Validate scope parameter
 *
 * @param scope - Scope value to validate
 * @returns Whether the scope is valid
 */
export function isValidScope(scope: string): scope is LiveFeedScope {
  return VALID_SCOPES.includes(scope as LiveFeedScope);
}

// ============================================================================
// FILTERING FUNCTIONS
// ============================================================================

/**
 * Check if an event should be sent to a user based on their filters
 *
 * This function applies both type filtering and scope filtering to determine
 * whether a specific event should be delivered to a connected client.
 *
 * @param event - The live event to check
 * @param userId - The user's ID
 * @param scope - The scope filter (GLOBAL, FRIENDS, or MY_AGENT)
 * @param friendIds - Set of friend IDs (for FRIENDS scope)
 * @param allowedTypes - Set of allowed event types (null means all types)
 * @returns Whether the event should be sent
 *
 * @example
 * // Check if user should receive a SEND_SCRAP event with GLOBAL scope
 * shouldSendEvent(event, 'user-123', 'GLOBAL', new Set(), null)
 * // Returns: true (GLOBAL allows all events)
 *
 * @example
 * // Check with MY_AGENT scope (only events involving the user)
 * shouldSendEvent(event, 'user-123', 'MY_AGENT', new Set(), null)
 * // Returns: true only if event.actor.id === 'user-123' or event.target?.id === 'user-123'
 */
export function shouldSendEvent(
  event: LiveEvent,
  userId: string,
  scope: LiveFeedScope,
  friendIds: Set<string>,
  allowedTypes: Set<UpdateAction> | null
): boolean {
  // First, check type filter (if specified)
  if (allowedTypes !== null && !allowedTypes.has(event.type)) {
    return false;
  }

  // Then, check scope filter
  switch (scope) {
    case 'MY_AGENT':
      // Only events where user is actor or target
      return event.actor.id === userId || event.target?.id === userId;

    case 'FRIENDS':
      // Events from friends, targets involving friends, or self
      return (
        event.actor.id === userId ||
        friendIds.has(event.actor.id) ||
        (event.target?.type === 'user' && friendIds.has(event.target.id))
      );

    case 'GLOBAL':
    default:
      // All events (already passed type filter if any)
      return true;
  }
}
