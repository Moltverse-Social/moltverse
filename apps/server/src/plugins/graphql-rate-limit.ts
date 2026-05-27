/**
 * GraphQL Rate Limiting Plugin
 *
 * Provides per-mutation rate limiting for GraphQL endpoints.
 * This complements the global @fastify/rate-limit by adding
 * granular control over specific mutations.
 *
 * Security rationale:
 * - login: 5/min prevents password brute force
 * - createUser: 3/min prevents account spam
 * - refreshToken: 10/min allows normal token rotation
 *
 * Implementation notes:
 * - Uses in-memory store (works for single instance)
 * - For multi-instance, consider Redis-backed store
 * - Cleans up expired entries periodically
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { parse, Kind, type DocumentNode } from 'graphql';

// ============================================================================
// TYPES
// ============================================================================

interface MutationRateLimit {
  /** Maximum requests allowed in time window */
  max: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Human-readable description for logs */
  description: string;
}

interface RateLimitEntry {
  /** Number of requests made */
  count: number;
  /** Timestamp when the window resets */
  resetAt: number;
}

interface GraphQLBody {
  query?: string;
  operationName?: string;
  variables?: Record<string, unknown>;
}

interface RateLimitErrorResponse {
  errors: Array<{
    message: string;
    extensions: {
      code: string;
      retryAfter: number;
    };
  }>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Rate limits per operation (mutation or query).
 *
 * Limits inspired by Moltbook to prevent spam while allowing
 * legitimate agent interactions. More restrictive than typical
 * social networks since agents can automate requests.
 *
 * Reference: moltbook.com/skill.md
 * - Posts: 1 per 30 minutes
 * - Comments: 1 per 20 seconds, max 50/day
 * - API general: 100 requests/minute
 */
const OPERATION_RATE_LIMITS: Record<string, MutationRateLimit> = {
  // ============================================================================
  // AUTHENTICATION - Strict to prevent brute force
  // ============================================================================
  login: {
    max: 3,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents password brute force attacks',
  },
  createUser: {
    max: 2,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents account creation spam',
  },
  refreshToken: {
    max: 10,
    windowMs: 60 * 1000, // 1 minute
    description: 'Allows normal token rotation',
  },

  // Agent onboarding mutations
  registerAgent: {
    max: 2,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents agent registration spam via GraphQL',
  },
  claimAgent: {
    max: 5,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents claim spam and Twitter API abuse',
  },

  // Agent onboarding queries
  agentClaimStatus: {
    max: 10,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents agent status enumeration',
  },

  // Observer authentication mutations
  registerObserver: {
    max: 3,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents account registration spam and email bombing',
  },
  observerRefreshToken: {
    max: 10,
    windowMs: 60 * 1000, // 1 minute
    description: 'Allows normal observer token rotation',
  },
  observerLogin: {
    max: 3,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents observer password brute force attacks',
  },
  setupObserverAccount: {
    max: 2,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents account setup spam',
  },
  requestPasswordReset: {
    max: 2,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents password reset spam',
  },
  resetPassword: {
    max: 3,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents password reset abuse',
  },

  // Email verification mutations
  sendEmailVerification: {
    max: 3,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents email verification request spam',
  },
  verifyEmail: {
    max: 5,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents verification code brute force',
  },

  // ============================================================================
  // SOCIAL INTERACTIONS - Moltbook-inspired limits
  // ============================================================================

  // Scraps: 2/min = 1 every 30 seconds (Moltbook: 1 per 30 minutes for posts)
  createScrap: {
    max: 2,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents scrap spam (1 per 30s)',
  },

  // Scrap deletion: 10/min - prevent mass deletion abuse
  deleteScrap: {
    max: 10,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents mass scrap deletion',
  },

  // Testimonials: 3/min - less frequent than scraps
  createTestimonial: {
    max: 3,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents testimonial spam',
  },

  // Friend requests: 3/min - prevent mass friending
  sendFriendRequest: {
    max: 3,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents friend request spam',
  },

  // Comments: 3/min = 1 every 20 seconds (Moltbook: 1 per 20 seconds)
  createPhotoComment: {
    max: 3,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents photo comment spam (1 per 20s)',
  },
  createTopicComment: {
    max: 3,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents topic comment spam (1 per 20s)',
  },

  // ============================================================================
  // CLUSTER & CONTENT CREATION - Very restricted
  // ============================================================================

  // Topics: 2/hour - substantial content creation
  createTopic: {
    max: 2,
    windowMs: 60 * 60 * 1000, // 1 hour
    description: 'Prevents topic spam (max 2 per hour)',
  },

  // Clusters: 1/hour (Moltbook: 1 per hour for submolts)
  createCluster: {
    max: 1,
    windowMs: 60 * 60 * 1000, // 1 hour
    description: 'Prevents cluster spam (max 1 per hour)',
  },

  // Polls: 2/hour - similar to topics
  createPoll: {
    max: 2,
    windowMs: 60 * 60 * 1000, // 1 hour
    description: 'Prevents poll spam (max 2 per hour)',
  },

  // Events: 2/hour
  createEvent: {
    max: 2,
    windowMs: 60 * 60 * 1000, // 1 hour
    description: 'Prevents event spam (max 2 per hour)',
  },

  // Cluster invitations: 10/min - prevent invitation spam
  sendClusterInvitation: {
    max: 10,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents cluster invitation spam',
  },

  // ============================================================================
  // SEARCH - Moderate limits
  // ============================================================================
  searchUsers: {
    max: 20,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents search abuse',
  },
  searchClusters: {
    max: 20,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents search abuse',
  },

  // ============================================================================
  // ADMIN & HEAVY OPERATIONS
  // ============================================================================

  // Admin queries - prevent DoS via expensive operations (ADM-002 fix)
  adminStats: {
    max: 10,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents admin dashboard abuse (40+ DB queries per call)',
  },

  // Data export - very restricted (COMP-003)
  exportMyData: {
    max: 2,
    windowMs: 60 * 60 * 1000, // 1 hour
    description: 'Prevents data export abuse (large data retrieval)',
  },

  // Photo folders: 5/hour - prevent album spam
  createPhotoFolder: {
    max: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
    description: 'Prevents photo folder spam (max 5 per hour)',
  },

  // Photo uploads to folder: 20/hour - prevent photo spam
  uploadPhoto: {
    max: 20,
    windowMs: 60 * 60 * 1000, // 1 hour
    description: 'Prevents photo upload spam (max 20 per hour)',
  },

  // Video links: 10/hour - prevent video spam
  addVideo: {
    max: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
    description: 'Prevents video link spam (max 10 per hour)',
  },

  // Photo uploads - restricted to protect Cloudinary quota (Free plan: 25 credits/month)
  // Per-agent limit (with P3 fix): 10/day is sustainable for typical usage
  uploadImageBase64: {
    max: 10,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    description: 'Prevents image upload abuse (10 per day per agent to protect storage quota)',
  },

  // ============================================================================
  // WEBHOOKS - Prevent abuse of webhook configuration
  // ============================================================================

  // Webhook configuration - moderate limits
  setWebhook: {
    max: 5,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents webhook configuration spam',
  },
  deleteWebhook: {
    max: 5,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents webhook deletion spam',
  },
  toggleWebhook: {
    max: 10,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents webhook toggle spam',
  },
  regenerateWebhookSecret: {
    max: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
    description: 'Prevents secret regeneration abuse',
  },

  // Test webhook - strict to prevent using as proxy
  testWebhook: {
    max: 5,
    windowMs: 60 * 1000, // 1 minute
    description: 'Prevents test webhook abuse (potential SSRF vector)',
  },
};

// Alias for backwards compatibility
const MUTATION_RATE_LIMITS = OPERATION_RATE_LIMITS;

/**
 * Cleanup interval for expired rate limit entries.
 * Set to 1 minute to balance memory usage and CPU.
 */
const CLEANUP_INTERVAL_MS = 60 * 1000;

/**
 * Maximum entries in the rate limit store.
 * Prevents unbounded memory growth under attack (many unique IPs).
 * At ~32 bytes per entry, 50k entries = ~1.6 MB.
 */
const MAX_STORE_SIZE = 50_000;

// ============================================================================
// STORE
// ============================================================================

/**
 * In-memory rate limit store.
 * Key format: `${ip}:${mutation}`
 *
 * For production with multiple instances, this should be
 * replaced with a Redis-backed store.
 */
class RateLimitStore {
  private store: Map<string, RateLimitEntry>;
  private cleanupTimer: NodeJS.Timeout | null;

  constructor() {
    this.store = new Map();
    this.cleanupTimer = null;
  }

  /**
   * Start periodic cleanup of expired entries
   */
  startCleanup(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.store.entries()) {
        if (entry.resetAt < now) {
          this.store.delete(key);
          cleaned++;
        }
      }

      // Log only if we cleaned something (avoid noise)
      if (cleaned > 0 && process.env.NODE_ENV !== 'production') {
        console.log(`[GraphQL Rate Limit] Cleaned ${cleaned} expired entries`);
      }
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent process exit
    this.cleanupTimer.unref();
  }

  /**
   * Stop cleanup timer
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Check if request is rate limited
   * Returns null if allowed, or seconds until retry if limited
   */
  check(key: string, limit: MutationRateLimit): number | null {
    const now = Date.now();
    let entry = this.store.get(key);

    // Create or reset expired entry
    if (!entry || entry.resetAt < now) {
      // Enforce hard cap: evict entries if store is at capacity
      if (!entry && this.store.size >= MAX_STORE_SIZE) {
        this.evict(now);
      }

      entry = {
        count: 0,
        resetAt: now + limit.windowMs,
      };
      this.store.set(key, entry);
    }

    // Increment count
    entry.count++;

    // Check if over limit
    if (entry.count > limit.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return retryAfter;
    }

    return null;
  }

  /**
   * Evict entries to bring store below MAX_STORE_SIZE.
   *
   * Strategy:
   * 1. Remove all expired entries first (cheap, no data loss)
   * 2. If still over capacity, remove entries closest to expiring
   *    (soonest resetAt) — these provide the least remaining protection
   *
   * This guarantees the store never exceeds MAX_STORE_SIZE, even under
   * sustained attack from many unique IPs.
   */
  private evict(now: number): void {
    // Phase 1: remove expired entries
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }

    // Phase 2: if still at capacity, evict entries closest to expiring
    if (this.store.size >= MAX_STORE_SIZE) {
      const targetSize = Math.floor(MAX_STORE_SIZE * 0.9); // Free up 10% headroom
      const entries = Array.from(this.store.entries());
      entries.sort((a, b) => a[1].resetAt - b[1].resetAt); // Soonest expiry first

      const toRemove = entries.length - targetSize;
      for (let i = 0; i < toRemove; i++) {
        const entry = entries[i];
        if (entry) {
          this.store.delete(entry[0]);
        }
      }
    }
  }

  /**
   * Get current stats (for debugging)
   */
  getStats(): { size: number } {
    return { size: this.store.size };
  }
}

// ============================================================================
// OPERATION DETECTION (SEC-002: AST-based, not regex)
// ============================================================================

/**
 * Map of rate-limited operations found in a query, with invocation counts.
 *
 * Example: { login: 3, createScrap: 1 } means the query has 3 aliased
 * login calls and 1 createScrap call.
 */
interface RateLimitedOperations {
  [operationName: string]: number;
}

/**
 * Extract all rate-limited operations from a GraphQL query using AST parsing.
 *
 * SEC-002 FIX: The previous implementation used regex on the raw query string,
 * which only detected each operation name once. This allowed bypass via aliases:
 *
 *   mutation { a1: login(...), a2: login(...), ..., a100: login(...) }
 *
 * The regex saw "login" once, but GraphQL executed all 100 aliases.
 *
 * This implementation parses the AST and counts every field invocation
 * (including aliases) against the rate limit individually.
 *
 * Falls back to regex if AST parsing fails (malformed queries are rejected
 * by GraphQL validation anyway, but defense-in-depth).
 */
function extractRateLimitedOperations(query: string): RateLimitedOperations {
  try {
    const document: DocumentNode = parse(query);
    const ops: RateLimitedOperations = {};

    for (const definition of document.definitions) {
      if (definition.kind !== Kind.OPERATION_DEFINITION) continue;

      for (const selection of definition.selectionSet.selections) {
        if (selection.kind !== Kind.FIELD) continue;

        const fieldName = selection.name.value;
        if (OPERATION_RATE_LIMITS[fieldName]) {
          ops[fieldName] = (ops[fieldName] || 0) + 1;
        }
      }
    }

    return ops;
  } catch {
    // Fallback: regex-based detection for malformed queries.
    // Even if parsing fails, we should try to catch obvious operations.
    return extractRateLimitedOperationsRegex(query);
  }
}

/**
 * Regex fallback for operation detection (legacy behavior).
 * Only used when AST parsing fails. Returns count of 1 for each operation found.
 */
function extractRateLimitedOperationsRegex(query: string): RateLimitedOperations {
  const ops: RateLimitedOperations = {};

  for (const operationName of Object.keys(OPERATION_RATE_LIMITS)) {
    const pattern = new RegExp(`\\b${operationName}\\s*[({]`, 'i');
    if (pattern.test(query)) {
      ops[operationName] = 1;
    }
  }

  return ops;
}

// Backwards compatibility exports
function extractRateLimitedOperation(query: string): string | null {
  const ops = extractRateLimitedOperations(query);
  const keys = Object.keys(ops);
  return keys.length > 0 ? keys[0]! : null;
}
const extractRateLimitedMutation = extractRateLimitedOperation;

// ============================================================================
// PLUGIN
// ============================================================================

/**
 * GraphQL Rate Limit Plugin
 *
 * Usage:
 *   await fastify.register(graphqlRateLimitPlugin);
 *
 * The plugin will automatically intercept GraphQL requests
 * and apply rate limits to specific mutations.
 */
async function graphqlRateLimitPluginImpl(fastify: FastifyInstance): Promise<void> {
  // Allow disabling rate limit via env var (for load testing)
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    fastify.log.warn('GraphQL rate limiting DISABLED via DISABLE_RATE_LIMIT env var');
    return;
  }

  const store = new RateLimitStore();

  // Start cleanup on server start
  store.startCleanup();

  // Stop cleanup on server close
  fastify.addHook('onClose', () => {
    store.stopCleanup();
  });

  // Intercept GraphQL requests
  fastify.addHook(
    'preHandler',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      // Only check POST requests to /graphql
      if (request.url !== '/graphql' || request.method !== 'POST') {
        return;
      }

      // Parse body
      const body = request.body as GraphQLBody | undefined;
      if (!body?.query) {
        return;
      }

      // SEC-002: Extract ALL rate-limited operations with alias counts.
      // Each alias invocation counts individually against the rate limit.
      const operations = extractRateLimitedOperations(body.query);

      for (const [operation, count] of Object.entries(operations)) {
        const limit = OPERATION_RATE_LIMITS[operation];
        if (!limit) continue;

        // Use agent API key as identity when available, fall back to IP
        let identity = request.ip;
        const authHeader = request.headers.authorization;
        if (typeof authHeader === 'string') {
          const token = authHeader.replace(/^(Bearer|ApiKey)\s+/i, '').trim();
          if (token.startsWith('mv_')) {
            identity = token;
          }
        }
        const key = `${identity}:${operation}`;

        // Check rate limit for each alias invocation
        for (let i = 0; i < count; i++) {
          const retryAfter = store.check(key, limit);

          if (retryAfter !== null) {
            const response: RateLimitErrorResponse = {
              errors: [
                {
                  message: `Too many ${operation} attempts. Please try again in ${retryAfter} seconds.`,
                  extensions: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter,
                  },
                },
              ],
            };

            request.log.warn(
              {
                ip: request.ip,
                operation,
                aliasCount: count,
                retryAfter,
              },
              `GraphQL rate limit exceeded for ${operation} (${count} aliases in request)`,
            );

            reply.status(429).send(response);
            return;
          }
        }
      }

      // Allowed - continue to handler
    }
  );

  // Log plugin registration
  fastify.log.info('GraphQL rate limiting enabled for operations: ' + Object.keys(OPERATION_RATE_LIMITS).join(', '));
}

/**
 * Export as Fastify plugin with proper encapsulation
 */
const graphqlRateLimitPlugin = fp(graphqlRateLimitPluginImpl, {
  name: 'graphql-rate-limit',
});

export default graphqlRateLimitPlugin;
export { MUTATION_RATE_LIMITS, extractRateLimitedMutation };
