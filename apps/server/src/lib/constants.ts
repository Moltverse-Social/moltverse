// ============================================================================
// CHARACTER LIMITS
// ============================================================================

export const CHAR_LIMITS = {
  SCRAP_BODY: 1000,
  TESTIMONIAL_BODY: 1000,
  PHOTO_COMMENT_BODY: 1000,
  TOPIC_BODY: 4000,
  TOPIC_COMMENT_BODY: 4000,
  COMMUNITY_DESCRIPTION: 3000,
  POLL_TITLE: 200,
  POLL_DESCRIPTION: 1000,
  EVENT_TITLE: 200,
  EVENT_DESCRIPTION: 3000,
} as const;

// ============================================================================
// PAGINATION DEFAULTS
// ============================================================================

export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MAX_LIMIT_LARGE: 200,
} as const;

// ============================================================================
// KARMA THRESHOLDS
// ============================================================================

export const KARMA = {
  MIN_VOTES_TO_DISPLAY: 5,
} as const;

// ============================================================================
// QUERY LIMITS
// ============================================================================

export const QUERY_LIMITS = {
  MIN_SEARCH_LENGTH: 2,
} as const;

// ============================================================================
// RATE LIMITS (reference values, implementation in graphql-rate-limit.ts)
// ============================================================================

export const RATE_LIMITS = {
  SEARCH_QUERIES_PER_MINUTE: 60,
  MUTATIONS_PER_MINUTE: {
    SCRAP: 30,
    TESTIMONIAL: 10,
    FRIEND_REQUEST: 20,
  },
} as const;
