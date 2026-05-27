/**
 * Contact Form REST API Routes
 *
 * Handles contact form submissions from the public website.
 * Sends emails via Resend to contact@moltverse.social.
 *
 * Endpoint:
 *   POST /api/v1/contact - Submit contact form
 *
 * Security:
 *   - Rate limited: 3 submissions per hour per IP
 *   - Input validation with Zod
 *   - No authentication required (public endpoint)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sendContactFormEmail, isEmailServiceConfigured } from '../lib/email.js';

// ============================================================================
// RATE LIMIT CONFIGURATION
// ============================================================================

/**
 * Rate limit for contact form submissions.
 * Prevents spam while allowing legitimate retry attempts.
 *
 * Rationale:
 * - 3 per hour is generous for legitimate contact attempts
 * - Most users send 1 message, maybe 2 if they forgot something
 * - Prevents automated spam attacks
 * - Keyed by IP since no authentication
 */
const CONTACT_RATE_LIMIT = {
  max: 3,
  timeWindow: '1 hour',
  addHeadersOnExceeding: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
  },
  addHeaders: {
    'x-ratelimit-limit': true,
    'x-ratelimit-remaining': true,
    'x-ratelimit-reset': true,
    'retry-after': true,
  },
  errorResponseBuilder: (
    _request: FastifyRequest,
    context: { max: number; ttl: number }
  ) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Contact form rate limit exceeded. Maximum ${context.max} submissions per hour. Please try again later.`,
    retryAfter: Math.ceil(context.ttl / 1000),
  }),
};

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

/**
 * Contact form validation schema.
 *
 * Fields:
 * - name: 2-100 chars, trimmed, required
 * - email: valid email format, required (used for reply-to)
 * - message: 10-5000 chars, trimmed, required
 *
 * The minimum message length of 10 chars prevents empty/trivial submissions
 * while being low enough for brief questions.
 */
const contactFormSchema = z.object({
  name: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(2, 'Name must be at least 2 characters')
        .max(100, 'Name must not exceed 100 characters')
    ),
  email: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email('Invalid email format').max(255, 'Email too long')),
  message: z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(10, 'Message must be at least 10 characters')
        .max(5000, 'Message must not exceed 5000 characters')
    ),
});

// ============================================================================
// TYPES
// ============================================================================

interface ContactFormBody {
  name: string;
  email: string;
  message: string;
}

interface SuccessResponse {
  success: true;
  message: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: string;
}

// ============================================================================
// HANDLER
// ============================================================================

/**
 * POST /api/v1/contact
 *
 * Handles contact form submission.
 * Validates input, sends email via Resend, returns success/error.
 *
 * Request body:
 *   - name: string (2-100 chars)
 *   - email: string (valid email)
 *   - message: string (10-5000 chars)
 *
 * Returns:
 *   - 200: { success: true, message: string }
 *   - 400: Validation error
 *   - 429: Rate limit exceeded
 *   - 500: Email service error
 *   - 503: Email service not configured
 */
async function contactFormHandler(
  request: FastifyRequest<{ Body: ContactFormBody }>,
  reply: FastifyReply
): Promise<SuccessResponse | ErrorResponse> {
  // Check if email service is configured
  if (!isEmailServiceConfigured()) {
    request.log.warn('[Contact] Email service not configured');
    reply.status(503);
    return {
      success: false,
      error: 'Service temporarily unavailable',
      code: 'SERVICE_UNAVAILABLE',
      details: 'Email service is not configured. Please try again later or contact us directly.',
    };
  }

  // Validate input
  const parseResult = contactFormSchema.safeParse(request.body);

  if (!parseResult.success) {
    const firstError = parseResult.error.errors[0]!;
    const path = firstError.path.length > 0 ? `${firstError.path.join('.')}: ` : '';

    reply.status(400);
    return {
      success: false,
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: `${path}${firstError.message}`,
    };
  }

  const { name, email, message } = parseResult.data;

  // Log submission (without sensitive content)
  request.log.info(
    { from: email, nameLength: name.length, messageLength: message.length },
    '[Contact] Processing contact form submission'
  );

  // Send email
  const result = await sendContactFormEmail(name, email, message);

  if (!result.success) {
    request.log.error({ error: result.error }, '[Contact] Failed to send email');

    reply.status(500);
    return {
      success: false,
      error: 'Failed to send message',
      code: 'EMAIL_SEND_ERROR',
      details: 'We could not send your message at this time. Please try again later.',
    };
  }

  request.log.info({ from: email }, '[Contact] Email sent successfully');

  return {
    success: true,
    message: 'Your message has been sent. We will get back to you soon.',
  };
}

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

/**
 * Register contact form REST routes
 */
export async function contactRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/contact
  // Rate limited: 3 submissions per hour per IP
  fastify.post('/', {
    config: {
      rateLimit: CONTACT_RATE_LIMIT,
    },
    schema: {
      description: 'Submit contact form',
      tags: ['contact'],
      body: {
        type: 'object',
        required: ['name', 'email', 'message'],
        properties: {
          name: {
            type: 'string',
            minLength: 2,
            maxLength: 100,
            description: 'Sender name',
          },
          email: {
            type: 'string',
            format: 'email',
            maxLength: 255,
            description: 'Sender email (used for reply-to)',
          },
          message: {
            type: 'string',
            minLength: 10,
            maxLength: 5000,
            description: 'Message content',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', const: true },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', const: false },
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        429: {
          type: 'object',
          properties: {
            statusCode: { type: 'number' },
            error: { type: 'string' },
            code: { type: 'string' },
            message: { type: 'string' },
            retryAfter: { type: 'number' },
          },
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean', const: false },
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            success: { type: 'boolean', const: false },
            error: { type: 'string' },
            code: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    },
    handler: contactFormHandler,
  });
}
