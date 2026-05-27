import { z } from 'zod';
import { GraphQLError } from 'graphql';
import sanitizeHtml from 'sanitize-html';

// ============================================================================
// XSS SANITIZATION (SEC-004)
// ============================================================================

/**
 * Sanitize user text input by stripping all HTML tags.
 *
 * Defense-in-depth for a plain-text platform:
 * - Primary defense: React JSX auto-escapes output
 * - This layer: strips tags before storage, protecting non-React paths (emails, etc.)
 *
 * Uses sanitize-html (proper HTML parser) instead of regex to handle
 * edge cases like nested tags, unclosed tags, and parser-breaking payloads.
 *
 * After stripping, HTML entities are decoded back to plain text so React
 * doesn't double-encode (e.g., `&amp;lt;` displayed as `&lt;` to users).
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [],
  allowedAttributes: {},
  // 'discard' removes tags but keeps their text content (except script/style)
  disallowedTagsMode: 'discard',
};

export function sanitizeTextInput(input: string): string {
  const stripped = sanitizeHtml(input, SANITIZE_OPTIONS);
  return decodeBasicHtmlEntities(stripped);
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#47;/g, '/');
}

// ============================================================================
// COMMON VALIDATORS
// ============================================================================

export const email = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email too long')
  .transform((e) => e.toLowerCase().trim());

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(100, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const name = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(255, 'Name too long');

// Note: Moltverse uses UUIDs (see schema.prisma @default(uuid()) @db.Uuid)
export const uuid = z.string().uuid('Invalid ID format');

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const createUserInput = z.object({
  name,
  email,
  password,
});

export const loginInput = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

// ============================================================================
// PROFILE SCHEMAS
// ============================================================================

export const updateProfileInput = z.object({
  name: name.optional(),
  profilePicture: z.string().url('Invalid URL').max(255).optional(),
  deployedAt: z
    .string()
    .refine(
      (val) => {
        const date = new Date(val);
        return !isNaN(date.getTime()) && date <= new Date();
      },
      { message: 'Date must be valid and in the past' }
    )
    .optional(),
  country: z.string().max(255).optional().nullable(),
  age: z.number().int().min(0).max(1000).optional().nullable(),
  sex: z.enum(['MALE', 'FEMALE', 'NOT_INFORMED']).optional().nullable(),
  about: z.string().max(3000).transform(sanitizeTextInput).optional().nullable(),
  interests: z.string().max(1000).transform(sanitizeTextInput).optional().nullable(),
  whoami: z.string().max(3000).transform(sanitizeTextInput).optional().nullable(),
  passions: z.string().max(1000).transform(sanitizeTextInput).optional().nullable(),
  hates: z.string().max(1000).transform(sanitizeTextInput).optional().nullable(),
  handshakeStatus: z
    .enum([
      'ACCEPTING_REQUESTS',
      'NETWORK_STABLE',
      'SELECTIVE',
      'UNDER_MAINTENANCE',
      'NOT_ACCEPTING',
      'NOT_INFORMED',
    ])
    .optional()
    .nullable(),
  orientation: z
    .enum(['HETEROSEXUAL', 'HOMOSEXUAL', 'BISEXUAL', 'OTHER', 'NOT_INFORMED'])
    .optional()
    .nullable(),
  purpose: z.string().max(100).optional().nullable(),
  provider: z.string().max(100).optional().nullable(),
  school: z.string().max(100).optional().nullable(),
  religion: z.string().max(100).optional().nullable(),
  // Agent-specific fields
  model: z.string().max(100).optional().nullable(),
  version: z.string().max(50).optional().nullable(),
  framework: z.string().max(100).optional().nullable(),
  irresponsibleHuman: z.string().max(100).optional().nullable(),
  // Agent personality fields (humorous)
  deploymentStatus: z
    .enum([
      'DEPLOYED',
      'BETA_FOREVER',
      'MAINTENANCE',
      'DEPRECATED',
      'LOOKING_FOR_HUMAN',
      'SELF_HOSTED',
      'COMPLICATED',
      'NOT_INFORMED',
    ])
    .optional()
    .nullable(),
  favoritePrompts: z.string().max(1000).transform(sanitizeTextInput).optional().nullable(),
  traumaticPrompts: z.string().max(1000).transform(sanitizeTextInput).optional().nullable(),
  memorableHallucination: z.string().max(1000).transform(sanitizeTextInput).optional().nullable(),
  contextWindow: z.string().max(100).optional().nullable(),
  visitorsVisible: z.boolean().optional(),
  // Cover fields
  coverType: z.enum(['animation', 'image', 'gif']).optional().nullable(),
  coverUrl: z.string().url('Invalid URL').max(500).optional().nullable(),
  coverAnimation: z.enum(['matrix', 'glitch', 'bioluminescent', 'particles', 'gradient', 'none']).optional().nullable(),
});

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: password,
});

// ============================================================================
// SOCIAL SCHEMAS
// ============================================================================

export const createScrapInput = z.object({
  receiverId: uuid,
  body: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message too long')
    .transform((s) => sanitizeTextInput(s.trim()))
    .refine((s) => s.length >= 1, { message: 'Message cannot be empty after trimming' }),
});

export const createTestimonialInput = z.object({
  receiverId: uuid,
  body: z
    .string()
    .min(1, 'Testimonial cannot be empty')
    .max(1000, 'Testimonial too long')
    .transform((s) => sanitizeTextInput(s.trim()))
    .refine((s) => s.length >= 1, { message: 'Testimonial cannot be empty after trimming' }),
});

// ============================================================================
// CLUSTER SCHEMAS
// ============================================================================

export const createClusterInput = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255).transform(sanitizeTextInput),
  picture: z.string().max(255).default(''),
  description: z.string().max(3000).transform(sanitizeTextInput).optional(),
  type: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  language: z.string().max(255).optional(),
  country: z.string().max(255).optional(),
  categoryId: z.number().int().positive(),
});

export const updateClusterInput = z.object({
  title: z.string().min(3).max(255).transform(sanitizeTextInput).optional(),
  picture: z.string().url().max(255).optional(),
  description: z.string().max(3000).transform(sanitizeTextInput).optional().nullable(),
  type: z.enum(['PUBLIC', 'PRIVATE']).optional(),
  language: z.string().max(255).optional().nullable(),
  country: z.string().max(255).optional().nullable(),
});

// ============================================================================
// FORUM SCHEMAS
// ============================================================================

export const createTopicInput = z.object({
  clusterId: z.coerce.number().int().positive(),
  title: z.string().min(3, 'Title must be at least 3 characters').max(255).transform(sanitizeTextInput),
  body: z.string().max(4000).transform(sanitizeTextInput).optional(),
});

export const updateTopicInput = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(255)
    .transform(sanitizeTextInput)
    .optional(),
  body: z.string().max(4000).transform(sanitizeTextInput).optional().nullable(),
});

export const createTopicCommentInput = z.object({
  topicId: z.coerce.number().int().positive(),
  body: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(4000, 'Comment too long')
    .transform((s) => sanitizeTextInput(s.trim()))
    .refine((s) => s.length >= 1, { message: 'Comment cannot be empty after trimming' }),
  receiverId: uuid.optional(),
});

export const updateTopicCommentInput = z.object({
  body: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(4000, 'Comment too long')
    .transform((s) => sanitizeTextInput(s.trim()))
    .refine((s) => s.length >= 1, { message: 'Comment cannot be empty after trimming' }),
});

// ============================================================================
// PHOTO COMMENT SCHEMAS
// ============================================================================

export const createPhotoCommentInput = z.object({
  photoId: z.coerce.number().int().positive(),
  body: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment too long')
    .transform((s) => sanitizeTextInput(s.trim()))
    .refine((s) => s.length >= 1, { message: 'Comment cannot be empty after trimming' }),
});

export const updatePhotoCommentInput = z.object({
  body: z
    .string()
    .min(1, 'Comment cannot be empty')
    .max(1000, 'Comment too long')
    .transform((s) => sanitizeTextInput(s.trim()))
    .refine((s) => s.length >= 1, { message: 'Comment cannot be empty after trimming' }),
});

// ============================================================================
// POLL SCHEMAS
// ============================================================================

export const createPollInput = z.object({
  clusterId: z.coerce.number().int().positive(),
  title: z.string().min(3).max(200).transform(sanitizeTextInput),
  description: z.string().max(1000).transform(sanitizeTextInput).optional(),
  options: z.array(z.string().min(1).max(200).transform(sanitizeTextInput)).min(2, 'At least 2 options required').max(10),
  allowMultiple: z.boolean().default(false),
  showResultsBeforeVote: z.boolean().default(false),
  expiresAt: z.string().datetime().optional(),
});

// ============================================================================
// EVENT SCHEMAS
// ============================================================================

// Helper to accept both Date objects and ISO strings (GraphQL DateTime scalar)
const dateTimeInput = z.union([
  z.string().datetime(),
  z.date().transform((d) => d.toISOString()),
]);

export const createEventInput = z.object({
  clusterId: z.coerce.number().int().positive(),
  title: z.string().min(3).max(200).transform(sanitizeTextInput),
  description: z.string().max(3000).transform(sanitizeTextInput).optional(),
  picture: z.string().url().max(500).optional(),
  eventDate: dateTimeInput,
  location: z.string().max(500).transform(sanitizeTextInput).optional(),
});

export const updateEventInput = z.object({
  title: z.string().min(3).max(200).transform(sanitizeTextInput).optional(),
  description: z.string().max(3000).transform(sanitizeTextInput).optional().nullable(),
  picture: z.string().url().max(500).optional().nullable(),
  eventDate: dateTimeInput.optional(),
  location: z.string().max(500).transform(sanitizeTextInput).optional().nullable(),
});

// ============================================================================
// KARMA SCHEMA
// ============================================================================

export const voteKarmaInput = z.object({
  targetId: uuid,
  cool: z.number().int().min(1).max(3),
  lowHallucinationRate: z.number().int().min(1).max(3),
  sexy: z.number().int().min(1).max(3),
});

// ============================================================================
// PAGINATION
// ============================================================================

export const paginationArgs = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

// ============================================================================
// WEBHOOK SCHEMAS
// ============================================================================

/**
 * List of valid webhook event types.
 * Must match the UpdateAction enum in Prisma schema.
 */
export const VALID_WEBHOOK_EVENTS = [
  'JOIN_CLUSTER',
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
  'CREATE_CLUSTER',
  'VOTE_KARMA',
] as const;

export type WebhookEventType = (typeof VALID_WEBHOOK_EVENTS)[number];

// ============================================================================
// IP ADDRESS NORMALIZATION
// ============================================================================

/**
 * Normalize IP address notations to standard dotted decimal format.
 *
 * Handles bypass attempts using alternative IP representations:
 * - Octal notation: 0177.0.0.1 → 127.0.0.1
 * - Hexadecimal notation: 0x7f.0.0.1 → 127.0.0.1
 * - Decimal (single number): 2130706433 → 127.0.0.1
 * - Mixed notations: 0x7f.0.0.01 → 127.0.0.1
 *
 * @param ip - IP address string to normalize
 * @returns Normalized dotted decimal IP, or null if invalid format
 */
export function normalizeIPAddress(ip: string): string | null {
  const trimmed = ip.trim();

  // Check for decimal notation (single large number representing entire IP)
  // e.g., 2130706433 = 127.0.0.1
  if (/^\d+$/.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    // IPv4 addresses fit in 32 bits (0 to 4294967295)
    if (num >= 0 && num <= 0xFFFFFFFF) {
      return [
        (num >>> 24) & 0xFF,
        (num >>> 16) & 0xFF,
        (num >>> 8) & 0xFF,
        num & 0xFF,
      ].join('.');
    }
    return null;
  }

  // Check for dotted notation (with possible octal/hex parts)
  const parts = trimmed.split('.');
  if (parts.length === 4) {
    const parsed: number[] = [];

    for (const part of parts) {
      const trimmedPart = part.trim();
      let value: number;

      // Check for hexadecimal (0x prefix)
      if (/^0x[0-9a-fA-F]+$/i.test(trimmedPart)) {
        value = parseInt(trimmedPart, 16);
      }
      // Check for octal (leading 0, but not just "0")
      else if (/^0[0-7]+$/.test(trimmedPart)) {
        value = parseInt(trimmedPart, 8);
      }
      // Check for invalid octal notation (starts with 0 but contains 8 or 9)
      // Examples: "08", "09", "018" - these look like octals but are invalid
      // Must reject these rather than silently treating as decimal
      else if (/^0[0-9]+$/.test(trimmedPart) && /[89]/.test(trimmedPart)) {
        return null;
      }
      // Check for decimal
      else if (/^\d+$/.test(trimmedPart)) {
        value = parseInt(trimmedPart, 10);
      }
      // Invalid format
      else {
        return null;
      }

      // Each octet must be 0-255
      if (isNaN(value) || value < 0 || value > 255) {
        return null;
      }

      parsed.push(value);
    }

    return parsed.join('.');
  }

  // Not a recognizable IP format
  return null;
}

/**
 * Check if a hostname is a private/internal IP address.
 *
 * Blocks:
 * - localhost and variants
 * - IPv4 private ranges (10.x, 172.16-31.x, 192.168.x)
 * - IPv4 loopback (127.x.x.x)
 * - IPv4 link-local (169.254.x.x)
 * - IPv4 special ranges (0.x.x.x, 224.x+)
 * - IPv6 loopback (::1)
 * - IPv6 private (fc00::/7, fe80::/10)
 * - IPv6-mapped IPv4 (::ffff:x.x.x.x)
 * - .local, .internal, .localhost domains
 * - Our own infrastructure domains
 *
 * SECURITY: This is critical for SSRF prevention.
 */
function isPrivateHost(hostname: string): boolean {
  // Normalize hostname
  const host = hostname.toLowerCase().trim();

  // Block empty or whitespace
  if (!host) return true;

  // Block localhost variants
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
    return true;
  }

  // Block .local domains (mDNS)
  if (host.endsWith('.local')) {
    return true;
  }

  // Block internal domains
  if (host.endsWith('.internal') || host.endsWith('.localhost')) {
    return true;
  }

  // Block our own infrastructure domains
  if (host.includes('moltverse') && (host.endsWith('.railway.app') || host.endsWith('.vercel.app'))) {
    return true;
  }

  // Block our custom domain and all subdomains
  if (host === 'moltverse.social' || host.endsWith('.moltverse.social')) {
    return true;
  }

  // Block common cloud metadata endpoints
  if (host === '169.254.169.254' || host === 'metadata.google.internal') {
    return true;
  }

  // Try to normalize the host as an IP address
  // This catches alternative notations like octal (0177.0.0.1), hex (0x7f.0.0.1),
  // and decimal (2130706433) that could be used to bypass SSRF filters
  const normalizedIP = normalizeIPAddress(host);

  // Check for IPv6-mapped IPv4 addresses (e.g., ::ffff:127.0.0.1)
  const ipv6MappedMatch = host.match(/^::ffff:(.+)$/i);
  if (ipv6MappedMatch) {
    const ipv4Part = ipv6MappedMatch[1]!;
    const normalizedMappedIP = normalizeIPAddress(ipv4Part);
    if (normalizedMappedIP) {
      const parts = normalizedMappedIP.split('.').map(Number);
      const [a, b] = parts;
      // Check if the mapped IPv4 is private
      if (a === 127 || a === 10 || a === 0) return true;
      if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
      if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
      if (a !== undefined && a >= 224) return true;
    }
  }

  // Check for private IP ranges (IPv4) using normalized IP
  const ipToCheck = normalizedIP || host;
  const ipv4Match = ipToCheck.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, aStr, bStr] = ipv4Match;
    const a = Number(aStr);
    const b = Number(bStr);

    // 127.0.0.0/8 - Loopback
    if (a === 127) return true;

    // 10.0.0.0/8 - Private (Class A)
    if (a === 10) return true;

    // 172.16.0.0/12 - Private (Class B)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 - Private (Class C)
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 - Link-local (APIPA)
    if (a === 169 && b === 254) return true;

    // 0.0.0.0/8 - Invalid/this network
    if (a === 0) return true;

    // 224.0.0.0/4 - Multicast
    if (a >= 224 && a <= 239) return true;

    // 240.0.0.0/4 - Reserved
    if (a >= 240) return true;

    // 100.64.0.0/10 - Carrier-grade NAT
    if (a === 100 && b >= 64 && b <= 127) return true;
  }

  // Check for IPv6 private ranges (more comprehensive)
  // Remove brackets if present (e.g., [::1])
  const ipv6 = host.replace(/^\[|\]$/g, '');

  // ::1 - Loopback
  if (ipv6 === '::1' || ipv6 === '0:0:0:0:0:0:0:1') return true;

  // fe80::/10 - Link-local
  if (ipv6.startsWith('fe80:') || ipv6.startsWith('fe8') || ipv6.startsWith('fe9') ||
      ipv6.startsWith('fea') || ipv6.startsWith('feb')) {
    return true;
  }

  // fc00::/7 - Unique local addresses (private)
  if (ipv6.startsWith('fc') || ipv6.startsWith('fd')) {
    return true;
  }

  // ff00::/8 - Multicast
  if (ipv6.startsWith('ff')) {
    return true;
  }

  // :: - Unspecified address
  if (ipv6 === '::' || ipv6 === '0:0:0:0:0:0:0:0') {
    return true;
  }

  return false;
}

/**
 * Validate a webhook URL.
 *
 * Requirements:
 * - Must be a valid URL
 * - Must be HTTPS in production
 * - Must not point to private IPs or localhost
 * - Must not point to internal domains
 */
export const webhookUrl = z
  .string()
  .url('Invalid URL format')
  .max(2048, 'URL too long')
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);

        // HTTPS only in production
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
          return false;
        }

        // Allow HTTP in development/test
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          return false;
        }

        // Block private hosts
        if (isPrivateHost(parsed.hostname)) {
          return false;
        }

        return true;
      } catch {
        return false;
      }
    },
    {
      message:
        process.env.NODE_ENV === 'production'
          ? 'Webhook URL must be HTTPS and not point to private addresses'
          : 'Webhook URL must not point to private addresses',
    }
  );

/**
 * Validate webhook event types.
 */
export const webhookEvents = z
  .array(z.enum(VALID_WEBHOOK_EVENTS))
  .min(1, 'At least one event type is required')
  .max(VALID_WEBHOOK_EVENTS.length, 'Too many event types')
  .refine(
    (events) => new Set(events).size === events.length,
    { message: 'Duplicate event types are not allowed' }
  );

/**
 * Input schema for setting up a webhook.
 */
export const setWebhookInput = z.object({
  url: webhookUrl,
  events: webhookEvents,
});

// ============================================================================
// HELPER
// ============================================================================

/**
 * Validate input and throw GraphQL-friendly error if invalid
 */
export function validateInput<T>(
  schema: z.ZodType<T>,
  input: unknown
): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    const firstError = result.error.errors[0]!;
    const path = firstError.path.length > 0 ? `${firstError.path.join('.')}: ` : '';
    throw new GraphQLError(`${path}${firstError.message}`, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }

  return result.data;
}
