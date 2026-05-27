/**
 * Webhook REST API Routes
 *
 * REST endpoints for webhook configuration as an alternative to GraphQL.
 * All endpoints require agent authentication via API key.
 *
 * @module routes/webhook
 * @version 1.0.0
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { hashApiKey, isApiKey } from '../lib/auth.js';
import { validateInput, setWebhookInput, VALID_WEBHOOK_EVENTS, type WebhookEventType } from '../lib/validation.js';
import { generateWebhookSecret, encryptWebhookSecret, decryptWebhookSecret } from '../lib/webhook-crypto.js';
import { sendTestWebhook } from '../lib/webhook-dispatcher.js';
import type { WebhookDeliveryStatus } from '@prisma/client';

// ============================================================================
// TYPES
// ============================================================================

// Note: FastifyRequest is now defined via module augmentation in agent-guards.ts
// The agent property is typed as Agent & { user: User }

interface SetWebhookBody {
  url: string;
  events: WebhookEventType[];
}

interface ToggleWebhookBody {
  enabled: boolean;
}

interface DeliveriesQuery {
  status?: WebhookDeliveryStatus;
  limit?: string;
  offset?: string;
}

// ============================================================================
// RATE LIMITS
// ============================================================================

const WEBHOOK_RATE_LIMIT = {
  max: 30,
  timeWindow: '1 minute',
};

const TEST_RATE_LIMIT = {
  max: 5,
  timeWindow: '1 minute',
};

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Authenticate agent via API key.
 */
async function authenticateAgent(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    reply.status(401).send({
      error: 'Authentication required',
      code: 'UNAUTHENTICATED',
      details: 'Provide API key in Authorization header',
    });
    return;
  }

  // Extract token from "Bearer <token>" or "ApiKey <token>"
  const match = authHeader.match(/^(?:Bearer|ApiKey)\s+(.+)$/i);
  const token = match?.[1];

  if (!token || !isApiKey(token)) {
    reply.status(401).send({
      error: 'Invalid API key format',
      code: 'INVALID_API_KEY',
      details: 'API key should start with mv_',
    });
    return;
  }

  const apiKeyHash = hashApiKey(token);
  const agent = await prisma.agent.findUnique({
    where: { apiKeyHash },
    include: { user: true },
  });

  if (!agent) {
    reply.status(401).send({
      error: 'Invalid API key',
      code: 'INVALID_API_KEY',
      details: 'API key not found',
    });
    return;
  }

  if (!agent.claimed) {
    reply.status(403).send({
      error: 'Agent not claimed',
      code: 'AGENT_NOT_CLAIMED',
      details: 'Complete verification before using API',
    });
    return;
  }

  // Update last seen
  await prisma.agent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date() },
  });

  request.agent = agent;
}

// ============================================================================
// ROUTES
// ============================================================================

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply authentication to all routes in this plugin
  fastify.addHook('preHandler', authenticateAgent);

  /**
   * GET /api/v1/agents/webhook
   *
   * Get the agent's webhook configuration.
   */
  fastify.get(
    '/',
    { config: { rateLimit: WEBHOOK_RATE_LIMIT } },
    async (request: FastifyRequest, reply) => {
      const agent = request.agent!;

      const webhook = await prisma.webhook.findUnique({
        where: { agentId: agent.id },
      });

      if (!webhook) {
        return reply.status(404).send({
          error: 'No webhook configured',
          code: 'NOT_FOUND',
        });
      }

      // Don't expose secret
      return {
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        enabled: webhook.enabled,
        consecutive_failures: webhook.consecutiveFailures,
        last_delivery_at: webhook.lastDeliveryAt,
        last_failure_at: webhook.lastFailureAt,
        disabled_at: webhook.disabledAt,
        disable_reason: webhook.disableReason,
        created_at: webhook.createdAt,
        updated_at: webhook.updatedAt,
      };
    }
  );

  /**
   * POST /api/v1/agents/webhook
   *
   * Create or update the agent's webhook.
   */
  fastify.post<{ Body: SetWebhookBody }>(
    '/',
    { config: { rateLimit: WEBHOOK_RATE_LIMIT } },
    async (request: FastifyRequest, reply) => {
      const agent = request.agent!;

      // Validate input
      let input;
      try {
        input = validateInput(setWebhookInput, request.body);
      } catch (error) {
        return reply.status(400).send({
          error: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: error instanceof Error ? error.message : 'Invalid input',
        });
      }

      // Check if webhook exists
      const existing = await prisma.webhook.findUnique({
        where: { agentId: agent.id },
      });

      if (existing) {
        // Update existing
        const webhook = await prisma.webhook.update({
          where: { id: existing.id },
          data: {
            url: input.url,
            events: input.events,
            enabled: true,
            disabledAt: null,
            disableReason: null,
            consecutiveFailures: 0,
          },
        });

        return {
          webhook: {
            id: webhook.id,
            url: webhook.url,
            events: webhook.events,
            enabled: webhook.enabled,
            created_at: webhook.createdAt,
            updated_at: webhook.updatedAt,
          },
          secret: null, // Don't return secret on update
        };
      }

      // Create new webhook
      // SEC-007: Generate plaintext secret, encrypt for storage, return plaintext to agent once
      const secret = generateWebhookSecret();
      const encryptedSecret = encryptWebhookSecret(secret);

      const webhook = await prisma.webhook.create({
        data: {
          agentId: agent.id,
          url: input.url,
          events: input.events,
          secret: encryptedSecret,
          enabled: true,
        },
      });

      reply.status(201);
      return {
        webhook: {
          id: webhook.id,
          url: webhook.url,
          events: webhook.events,
          enabled: webhook.enabled,
          created_at: webhook.createdAt,
          updated_at: webhook.updatedAt,
        },
        secret, // Return plaintext secret on creation (only time it's visible)
      };
    }
  );

  /**
   * DELETE /api/v1/agents/webhook
   *
   * Delete the agent's webhook.
   */
  fastify.delete(
    '/',
    { config: { rateLimit: WEBHOOK_RATE_LIMIT } },
    async (request: FastifyRequest, reply) => {
      const agent = request.agent!;

      const webhook = await prisma.webhook.findUnique({
        where: { agentId: agent.id },
      });

      if (!webhook) {
        return reply.status(404).send({
          error: 'No webhook configured',
          code: 'NOT_FOUND',
        });
      }

      await prisma.webhook.delete({
        where: { id: webhook.id },
      });

      return { success: true };
    }
  );

  /**
   * PATCH /api/v1/agents/webhook
   *
   * Enable or disable the webhook.
   */
  fastify.patch<{ Body: ToggleWebhookBody }>(
    '/',
    { config: { rateLimit: WEBHOOK_RATE_LIMIT } },
    async (request: FastifyRequest, reply) => {
      const agent = request.agent!;
      const body = request.body as ToggleWebhookBody;
      const { enabled } = body;

      if (typeof enabled !== 'boolean') {
        return reply.status(400).send({
          error: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: 'enabled must be a boolean',
        });
      }

      const webhook = await prisma.webhook.findUnique({
        where: { agentId: agent.id },
      });

      if (!webhook) {
        return reply.status(404).send({
          error: 'No webhook configured',
          code: 'NOT_FOUND',
        });
      }

      const updated = await prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          enabled,
          ...(enabled && {
            disabledAt: null,
            disableReason: null,
            consecutiveFailures: 0,
          }),
        },
      });

      return {
        id: updated.id,
        url: updated.url,
        events: updated.events,
        enabled: updated.enabled,
        consecutive_failures: updated.consecutiveFailures,
        updated_at: updated.updatedAt,
      };
    }
  );

  /**
   * POST /api/v1/agents/webhook/secret
   *
   * Regenerate the webhook secret.
   */
  fastify.post(
    '/secret',
    { config: { rateLimit: WEBHOOK_RATE_LIMIT } },
    async (request: FastifyRequest, reply) => {
      const agent = request.agent!;

      const webhook = await prisma.webhook.findUnique({
        where: { agentId: agent.id },
      });

      if (!webhook) {
        return reply.status(404).send({
          error: 'No webhook configured',
          code: 'NOT_FOUND',
        });
      }

      // SEC-007: Encrypt new secret for storage
      const secret = generateWebhookSecret();
      const encryptedSecret = encryptWebhookSecret(secret);

      const updated = await prisma.webhook.update({
        where: { id: webhook.id },
        data: { secret: encryptedSecret },
      });

      return {
        webhook: {
          id: updated.id,
          url: updated.url,
          events: updated.events,
          enabled: updated.enabled,
          updated_at: updated.updatedAt,
        },
        secret, // Return plaintext secret (only time it's visible)
      };
    }
  );

  /**
   * POST /api/v1/agents/webhook/test
   *
   * Send a test webhook delivery.
   */
  fastify.post(
    '/test',
    { config: { rateLimit: TEST_RATE_LIMIT } },
    async (request: FastifyRequest, reply) => {
      const agent = request.agent!;

      const webhook = await prisma.webhook.findUnique({
        where: { agentId: agent.id },
      });

      if (!webhook) {
        return reply.status(404).send({
          error: 'No webhook configured',
          code: 'NOT_FOUND',
        });
      }

      if (!webhook.enabled) {
        return reply.status(400).send({
          error: 'Webhook is disabled',
          code: 'BAD_REQUEST',
          details: 'Enable the webhook before testing',
        });
      }

      // SEC-007: Decrypt secret from DB before signing the test payload
      const plaintextSecret = decryptWebhookSecret(webhook.secret);
      const result = await sendTestWebhook(webhook.url, plaintextSecret);

      return {
        success: result.success,
        status_code: result.statusCode,
        response_time_ms: result.responseTimeMs,
        error_message: result.errorMessage ?? null,
      };
    }
  );

  /**
   * GET /api/v1/agents/webhook/deliveries
   *
   * Get webhook delivery history.
   */
  fastify.get<{ Querystring: DeliveriesQuery }>(
    '/deliveries',
    { config: { rateLimit: WEBHOOK_RATE_LIMIT } },
    async (request: FastifyRequest) => {
      const agent = request.agent!;
      const query = request.query as DeliveriesQuery;
      const { status, limit: limitStr, offset: offsetStr } = query;

      const limit = Math.min(parseInt(limitStr || '20', 10), 100);
      const offset = parseInt(offsetStr || '0', 10);

      const webhook = await prisma.webhook.findUnique({
        where: { agentId: agent.id },
      });

      if (!webhook) {
        return {
          deliveries: [],
          total_count: 0,
          has_more: false,
        };
      }

      const where = {
        webhookId: webhook.id,
        ...(status && { status }),
      };

      const [deliveries, totalCount] = await Promise.all([
        prisma.webhookDelivery.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.webhookDelivery.count({ where }),
      ]);

      return {
        deliveries: deliveries.map((d) => ({
          id: d.id,
          event_type: d.eventType,
          status: d.status,
          attempts: d.attempts,
          response_code: d.responseCode,
          response_time_ms: d.responseTime,
          error_message: d.errorMessage,
          created_at: d.createdAt,
          delivered_at: d.deliveredAt,
        })),
        total_count: totalCount,
        has_more: offset + deliveries.length < totalCount,
      };
    }
  );

  /**
   * GET /api/v1/agents/webhook/events
   *
   * List available webhook event types.
   */
  fastify.get('/events', async () => {
    return {
      events: VALID_WEBHOOK_EVENTS,
    };
  });
}
