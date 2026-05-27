/**
 * Webhook GraphQL Resolvers
 *
 * Handles webhook configuration, delivery history, and testing.
 *
 * @module graphql/resolvers/webhook
 * @version 1.0.0
 */

import { GraphQLError } from 'graphql';
import type { GraphQLContext } from '../context.js';
import type { Webhook, WebhookDelivery, WebhookDeliveryStatus } from '@prisma/client';
import { requireAgent } from '../../lib/guards.js';
import { validateInput, setWebhookInput } from '../../lib/validation.js';
import { generateWebhookSecret, encryptWebhookSecret, decryptWebhookSecret } from '../../lib/webhook-crypto.js';
import { sendTestWebhook } from '../../lib/webhook-dispatcher.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SetWebhookArgs {
  input: {
    url: string;
    events: string[];
  };
}

export interface ToggleWebhookArgs {
  enabled: boolean;
}

export interface WebhookDeliveriesArgs {
  status?: WebhookDeliveryStatus;
  limit?: number;
  offset?: number;
}

export interface SetWebhookPayload {
  webhook: Webhook;
  secret: string | null;
}

export interface TestWebhookPayload {
  success: boolean;
  statusCode: number | null;
  responseTime: number | null;
  errorMessage: string | null;
}

export interface WebhookDeliveryConnection {
  nodes: WebhookDelivery[];
  totalCount: number;
  hasMore: boolean;
}

// ============================================================================
// QUERIES
// ============================================================================

export const webhookQueries = {
  /**
   * Get the current agent's webhook configuration.
   */
  async myWebhook(
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<Webhook | null> {
    const agent = requireAgent(ctx);

    return ctx.prisma.webhook.findUnique({
      where: { agentId: agent.id },
    });
  },

  /**
   * Get webhook delivery history.
   */
  async webhookDeliveries(
    _: unknown,
    args: WebhookDeliveriesArgs,
    ctx: GraphQLContext
  ): Promise<WebhookDeliveryConnection> {
    const agent = requireAgent(ctx);
    const limit = Math.min(args.limit ?? 20, 100);
    const offset = args.offset ?? 0;

    // Get webhook for this agent
    const webhook = await ctx.prisma.webhook.findUnique({
      where: { agentId: agent.id },
    });

    if (!webhook) {
      return {
        nodes: [],
        totalCount: 0,
        hasMore: false,
      };
    }

    // Build where clause
    const where = {
      webhookId: webhook.id,
      ...(args.status && { status: args.status }),
    };

    // Fetch deliveries and count in parallel
    const [nodes, totalCount] = await Promise.all([
      ctx.prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      ctx.prisma.webhookDelivery.count({ where }),
    ]);

    return {
      nodes,
      totalCount,
      hasMore: offset + nodes.length < totalCount,
    };
  },
};

// ============================================================================
// MUTATIONS
// ============================================================================

export const webhookMutations = {
  /**
   * Configure a webhook for the agent.
   *
   * Creates new webhook or updates existing.
   * Secret is only returned on creation.
   */
  async setWebhook(
    _: unknown,
    args: SetWebhookArgs,
    ctx: GraphQLContext
  ): Promise<SetWebhookPayload> {
    const agent = requireAgent(ctx);

    // Validate input
    const input = validateInput(setWebhookInput, args.input);

    // Check if webhook already exists
    const existing = await ctx.prisma.webhook.findUnique({
      where: { agentId: agent.id },
    });

    if (existing) {
      // Update existing webhook
      const webhook = await ctx.prisma.webhook.update({
        where: { id: existing.id },
        data: {
          url: input.url,
          events: input.events,
          // Re-enable if it was auto-disabled
          enabled: true,
          disabledAt: null,
          disableReason: null,
          consecutiveFailures: 0,
        },
      });

      return {
        webhook,
        secret: null, // Don't return secret on update
      };
    }

    // Create new webhook with generated secret
    // SEC-007: Encrypt for storage, return plaintext to agent once
    const secret = generateWebhookSecret();
    const encryptedSecret = encryptWebhookSecret(secret);

    const webhook = await ctx.prisma.webhook.create({
      data: {
        agentId: agent.id,
        url: input.url,
        events: input.events,
        secret: encryptedSecret,
        enabled: true,
      },
    });

    return {
      webhook,
      secret, // Return plaintext secret on creation (only time it's visible)
    };
  },

  /**
   * Delete the agent's webhook.
   */
  async deleteWebhook(
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<boolean> {
    const agent = requireAgent(ctx);

    const webhook = await ctx.prisma.webhook.findUnique({
      where: { agentId: agent.id },
    });

    if (!webhook) {
      throw new GraphQLError('No webhook configured', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    // Delete webhook (cascade deletes deliveries)
    await ctx.prisma.webhook.delete({
      where: { id: webhook.id },
    });

    return true;
  },

  /**
   * Enable or disable the webhook.
   */
  async toggleWebhook(
    _: unknown,
    args: ToggleWebhookArgs,
    ctx: GraphQLContext
  ): Promise<Webhook> {
    const agent = requireAgent(ctx);

    const webhook = await ctx.prisma.webhook.findUnique({
      where: { agentId: agent.id },
    });

    if (!webhook) {
      throw new GraphQLError('No webhook configured', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    return ctx.prisma.webhook.update({
      where: { id: webhook.id },
      data: {
        enabled: args.enabled,
        // Clear auto-disable state if re-enabling
        ...(args.enabled && {
          disabledAt: null,
          disableReason: null,
          consecutiveFailures: 0,
        }),
      },
    });
  },

  /**
   * Regenerate webhook secret.
   */
  async regenerateWebhookSecret(
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<SetWebhookPayload> {
    const agent = requireAgent(ctx);

    const webhook = await ctx.prisma.webhook.findUnique({
      where: { agentId: agent.id },
    });

    if (!webhook) {
      throw new GraphQLError('No webhook configured', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    // SEC-007: Generate new secret, encrypt for storage
    const secret = generateWebhookSecret();
    const encryptedSecret = encryptWebhookSecret(secret);

    const updated = await ctx.prisma.webhook.update({
      where: { id: webhook.id },
      data: { secret: encryptedSecret },
    });

    return {
      webhook: updated,
      secret, // Return plaintext secret (only time it's visible)
    };
  },

  /**
   * Send a test webhook.
   */
  async testWebhook(
    _: unknown,
    __: unknown,
    ctx: GraphQLContext
  ): Promise<TestWebhookPayload> {
    const agent = requireAgent(ctx);

    const webhook = await ctx.prisma.webhook.findUnique({
      where: { agentId: agent.id },
    });

    if (!webhook) {
      throw new GraphQLError('No webhook configured', {
        extensions: { code: 'NOT_FOUND' },
      });
    }

    if (!webhook.enabled) {
      throw new GraphQLError('Webhook is disabled', {
        extensions: { code: 'BAD_REQUEST' },
      });
    }

    // SEC-007: Decrypt secret from DB before signing the test payload
    const plaintextSecret = decryptWebhookSecret(webhook.secret);
    const result = await sendTestWebhook(webhook.url, plaintextSecret);

    return {
      success: result.success,
      statusCode: result.statusCode,
      responseTime: result.responseTimeMs,
      errorMessage: result.errorMessage ?? null,
    };
  },
};

// ============================================================================
// TYPE RESOLVERS
// ============================================================================

export const webhookTypeResolvers = {
  Webhook: {
    // Convert string array to enum values for GraphQL
    events: (parent: Webhook) => parent.events,
  },

  WebhookDelivery: {
    // Map database enum to GraphQL enum
    eventType: (parent: WebhookDelivery) => parent.eventType,
    status: (parent: WebhookDelivery) => parent.status,
  },
};
