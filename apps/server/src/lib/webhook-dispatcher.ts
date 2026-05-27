/**
 * Webhook Dispatcher Module
 *
 * Responsible for delivering webhook events to registered agent endpoints.
 * Subscribes to the live events system and dispatches HTTP POSTs to webhook URLs.
 *
 * Features:
 * - Async, non-blocking delivery (doesn't slow down resolvers)
 * - Filters events based on webhook configuration
 * - Creates delivery records for audit trail
 * - Handles timeouts and connection errors gracefully
 * - Supports circuit breaker pattern (disables webhooks after repeated failures)
 *
 * Architecture:
 * ```
 * Resolver -> liveEvents.emit() -> WebhookDispatcher.handleEvent()
 *                                          |
 *                                          v
 *                               For each subscribed webhook:
 *                               1. Create WebhookDelivery record
 *                               2. Sign payload with HMAC-SHA256
 *                               3. HTTP POST to webhook URL
 *                               4. Update delivery status
 * ```
 *
 * @module lib/webhook-dispatcher
 * @version 1.0.0
 */

import type { PrismaClient, Webhook, WebhookDelivery, UpdateAction } from '@prisma/client';
import dns from 'dns/promises';
import { createChildLogger } from './logger.js';
import { liveEvents, type LiveEvent } from './live-events.js';
import { generateWebhookHeaders, decryptWebhookSecret } from './webhook-crypto.js';
import { getActorContext } from './social-pulse.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Result of a webhook delivery attempt
 */
export interface DeliveryResult {
  /** Whether the delivery was successful (2xx response) */
  success: boolean;
  /** HTTP status code (null if network error) */
  statusCode: number | null;
  /** Response body (truncated to 1000 chars) */
  responseBody?: string;
  /** Time taken for the request in milliseconds */
  responseTimeMs: number;
  /** Error message if delivery failed */
  errorMessage?: string;
}

/**
 * Internal queue task for processing deliveries
 */
interface DeliveryTask {
  deliveryId: string;
  webhookId: string;
  attempt: number;
}

/**
 * Webhook with agent relation for processing
 */
type WebhookWithAgent = Webhook & {
  agent: {
    id: string;
    userId: string;
  };
};

// ============================================================================
// CONSTANTS
// ============================================================================

const log = createChildLogger({ module: 'webhook-dispatcher' });

/** HTTP request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 10_000;

/** Maximum response body length to store */
const MAX_RESPONSE_BODY_LENGTH = 1000;

/** Maximum concurrent webhook deliveries */
const MAX_CONCURRENT_DELIVERIES = 10;

/** Number of consecutive failures before auto-disabling webhook */
const CIRCUIT_BREAKER_THRESHOLD = 10;

/** Retry delays in milliseconds (exponential backoff) */
const RETRY_DELAYS_MS = [
  60_000,       // 1 minute
  300_000,      // 5 minutes
  900_000,      // 15 minutes
  3_600_000,    // 1 hour
  21_600_000,   // 6 hours
];

// ============================================================================
// DNS REBINDING PROTECTION
// ============================================================================

/**
 * Check if an IPv4 address is private/internal.
 * Used to prevent SSRF attacks via DNS rebinding.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;

  // 127.0.0.0/8 - Loopback
  if (a === 127) return true;
  // 10.0.0.0/8 - Private (Class A)
  if (a === 10) return true;
  // 172.16.0.0/12 - Private (Class B)
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 - Private (Class C)
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 - Link-local (APIPA)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8 - Invalid/this network
  if (a === 0) return true;
  // 100.64.0.0/10 - Carrier-grade NAT (CGNAT)
  if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4+ - Multicast and reserved
  if (a !== undefined && a >= 224) return true;

  return false;
}

/**
 * Check if an IPv6 address is private/internal.
 * Used to prevent SSRF attacks via DNS rebinding.
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // ::1 - Loopback
  if (normalized === '::1') return true;
  // :: - Unspecified
  if (normalized === '::') return true;
  // fe80::/10 - Link-local
  if (/^fe[89ab]/.test(normalized)) return true;
  // fc00::/7 - Unique local (private)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  // ff00::/8 - Multicast
  if (normalized.startsWith('ff')) return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.slice(7);
    return isPrivateIPv4(ipv4Part);
  }

  return false;
}

/**
 * Verify that a hostname resolves to only public IP addresses.
 * Throws an error if any resolved IP is private (DNS rebinding protection).
 *
 * This prevents attackers from:
 * 1. Setting up a webhook URL that initially resolves to a public IP
 * 2. Then changing DNS to resolve to internal IPs (like 127.0.0.1)
 * 3. Using the webhook to access internal services (SSRF)
 */
async function verifyHostnameResolvesToPublicIP(hostname: string): Promise<void> {
  const errors: string[] = [];

  // Resolve IPv4 addresses
  try {
    const ipv4Addresses = await dns.resolve4(hostname);
    for (const ip of ipv4Addresses) {
      if (isPrivateIPv4(ip)) {
        errors.push(`IPv4 ${ip} is private`);
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    // ENODATA: no A records, ENOTFOUND: domain doesn't exist
    // These are not errors - the domain might only have AAAA records
    if (code !== 'ENODATA' && code !== 'ENOTFOUND') {
      throw err;
    }
  }

  // Resolve IPv6 addresses
  try {
    const ipv6Addresses = await dns.resolve6(hostname);
    for (const ip of ipv6Addresses) {
      if (isPrivateIPv6(ip)) {
        errors.push(`IPv6 ${ip} is private`);
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENODATA' && code !== 'ENOTFOUND') {
      throw err;
    }
  }

  if (errors.length > 0) {
    throw new Error(`DNS rebinding attack detected: ${errors.join(', ')}`);
  }
}

// ============================================================================
// DELIVERY FUNCTION
// ============================================================================

/**
 * Deliver a webhook payload to a URL.
 *
 * @param url - Webhook URL to deliver to
 * @param payload - JSON payload string
 * @param secret - Webhook secret for signing
 * @param eventType - Event type for headers
 * @param deliveryId - Delivery ID for headers
 * @returns Delivery result
 */
async function deliverWebhook(
  url: string,
  payload: string,
  secret: string,
  eventType: string,
  deliveryId: string
): Promise<DeliveryResult> {
  const startTime = Date.now();

  // DNS rebinding protection: verify hostname resolves to public IPs only
  try {
    const parsed = new URL(url);
    await verifyHostnameResolvesToPublicIP(parsed.hostname);
  } catch (error) {
    return {
      success: false,
      statusCode: null,
      responseTimeMs: Date.now() - startTime,
      errorMessage: error instanceof Error
        ? error.message
        : 'DNS verification failed',
    };
  }

  const headers = generateWebhookHeaders(payload, secret, eventType, deliveryId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      signal: controller.signal,
      // SECURITY: Don't follow redirects to prevent SSRF attacks
      // An attacker could set up a webhook URL that redirects to internal services
      redirect: 'manual',
    });

    const responseTimeMs = Date.now() - startTime;
    let responseBody = '';

    try {
      responseBody = await response.text();
      if (responseBody.length > MAX_RESPONSE_BODY_LENGTH) {
        responseBody = responseBody.slice(0, MAX_RESPONSE_BODY_LENGTH) + '... (truncated)';
      }
    } catch {
      responseBody = '(failed to read response body)';
    }

    // Only 2xx is considered success
    // 3xx redirects are rejected for security (SSRF prevention)
    const success = response.status >= 200 && response.status < 300;

    let errorMessage: string | undefined;
    if (!success) {
      if (response.status >= 300 && response.status < 400) {
        errorMessage = `Redirect not allowed (HTTP ${response.status})`;
      } else {
        errorMessage = `HTTP ${response.status}`;
      }
    }

    const result: DeliveryResult = {
      success,
      statusCode: response.status,
      responseBody,
      responseTimeMs,
    };
    if (errorMessage) {
      result.errorMessage = errorMessage;
    }
    return result;
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    let errorMessage = 'Unknown error';
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = `Timeout after ${REQUEST_TIMEOUT_MS}ms`;
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      statusCode: null,
      responseTimeMs,
      errorMessage,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calculate the next retry timestamp based on attempt number.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @returns Next retry Date, or null if max attempts reached
 */
function getNextRetryAt(attempt: number): Date | null {
  const delay = RETRY_DELAYS_MS[attempt];
  if (delay === undefined) {
    return null;
  }
  return new Date(Date.now() + delay);
}

// ============================================================================
// WEBHOOK DISPATCHER CLASS
// ============================================================================

/**
 * WebhookDispatcher - Manages webhook delivery
 *
 * This class handles the delivery of webhooks to agent endpoints.
 * It subscribes to the live events system and processes deliveries
 * asynchronously.
 *
 * Usage:
 * ```typescript
 * import { webhookDispatcher } from './webhook-dispatcher.js';
 *
 * // Initialize with Prisma client (in server startup)
 * webhookDispatcher.initialize(prisma);
 *
 * // Events are automatically delivered to subscribed webhooks
 *
 * // On server shutdown
 * webhookDispatcher.shutdown();
 * ```
 */
class WebhookDispatcher {
  private prisma: PrismaClient | null = null;
  private unsubscribe: (() => void) | null = null;
  private queue: DeliveryTask[] = [];
  private activeDeliveries = 0;
  private isProcessing = false;
  private isInitialized = false;

  /**
   * Initialize the dispatcher with Prisma client.
   *
   * @param prisma - Prisma client instance
   */
  initialize(prisma: PrismaClient): void {
    if (this.isInitialized) {
      log.warn('WebhookDispatcher already initialized');
      return;
    }

    this.prisma = prisma;
    this.isInitialized = true;

    // Subscribe to live events
    this.unsubscribe = liveEvents.subscribe((event) => {
      this.handleEvent(event).catch((error) => {
        log.error({ error, eventId: event.id }, 'Failed to handle event for webhooks');
      });
    });

    log.info('WebhookDispatcher initialized');
  }

  /**
   * Handle a live event and dispatch to subscribed webhooks.
   *
   * @param event - Live event to process
   */
  private async handleEvent(event: LiveEvent): Promise<void> {
    if (!this.prisma) {
      log.warn('WebhookDispatcher not initialized');
      return;
    }

    // Find all webhooks subscribed to this event type
    const webhooks = await this.prisma.webhook.findMany({
      where: {
        enabled: true,
        disabledAt: null,
        events: {
          has: event.type,
        },
      },
      include: {
        agent: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    if (webhooks.length === 0) {
      return;
    }

    log.debug(
      { eventId: event.id, eventType: event.type, webhookCount: webhooks.length },
      'Processing event for webhooks'
    );

    // For each webhook, check if it should receive this event
    for (const webhook of webhooks) {
      if (!this.shouldDeliverToWebhook(event, webhook)) {
        continue;
      }

      // Create delivery record
      const delivery = await this.createDeliveryRecord(webhook.id, event);

      // Add to queue for async processing
      this.queue.push({
        deliveryId: delivery.id,
        webhookId: webhook.id,
        attempt: 0,
      });
    }

    // Process the queue
    this.processQueue();
  }

  /**
   * Determine if an event should be delivered to a webhook.
   *
   * An event is delivered if the webhook's agent is either:
   * - The actor (they performed the action)
   * - The target (the action was performed on them)
   *
   * @param event - The live event
   * @param webhook - The webhook to check
   * @returns True if the event should be delivered
   */
  private shouldDeliverToWebhook(event: LiveEvent, webhook: WebhookWithAgent): boolean {
    const agentUserId = webhook.agent.userId;

    // Agent is the actor
    if (event.actor.id === agentUserId) {
      return true;
    }

    // Agent is the target
    if (event.target?.id === agentUserId) {
      return true;
    }

    return false;
  }

  /**
   * Create a delivery record in the database.
   *
   * @param webhookId - ID of the webhook
   * @param event - The event to deliver
   * @returns The created delivery record
   */
  private async createDeliveryRecord(
    webhookId: string,
    event: LiveEvent
  ): Promise<WebhookDelivery> {
    if (!this.prisma) {
      throw new Error('WebhookDispatcher not initialized');
    }

    return this.prisma.webhookDelivery.create({
      data: {
        webhookId,
        eventType: event.type as UpdateAction,
        payload: event as object,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: RETRY_DELAYS_MS.length + 1,
        nextRetryAt: new Date(),
      },
    });
  }

  /**
   * Process the delivery queue.
   *
   * This method processes deliveries up to the concurrency limit.
   * It's called after adding items to the queue.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || !this.prisma) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.activeDeliveries < MAX_CONCURRENT_DELIVERIES) {
        const task = this.queue.shift();
        if (!task) break;

        this.activeDeliveries++;
        this.processDelivery(task).finally(() => {
          this.activeDeliveries--;
          // Continue processing if there are more tasks
          if (this.queue.length > 0) {
            this.processQueue();
          }
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single delivery task.
   *
   * @param task - The delivery task to process
   */
  private async processDelivery(task: DeliveryTask): Promise<void> {
    if (!this.prisma) return;

    try {
      // Fetch delivery and webhook
      const delivery = await this.prisma.webhookDelivery.findUnique({
        where: { id: task.deliveryId },
        include: {
          webhook: {
            include: {
              agent: {
                select: { id: true, userId: true },
              },
            },
          },
        },
      });

      if (!delivery || !delivery.webhook) {
        log.warn({ deliveryId: task.deliveryId }, 'Delivery or webhook not found');
        return;
      }

      const { webhook } = delivery;

      // Check if webhook is still enabled
      if (!webhook.enabled || webhook.disabledAt) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'EXHAUSTED',
            errorMessage: 'Webhook disabled',
          },
        });
        return;
      }

      // Enrich payload with actor context (social relationship data)
      let enrichedPayload = delivery.payload as Record<string, unknown>;
      try {
        const actor = enrichedPayload.actor as { id?: string } | undefined;
        if (this.prisma && actor?.id && webhook.agent?.userId) {
          const actorCtx = await getActorContext(this.prisma, actor.id, webhook.agent.userId);
          enrichedPayload = { ...enrichedPayload, actorContext: actorCtx };
        }
      } catch {
        // Non-critical: skip enrichment if it fails
      }

      // Prepare payload
      const payload = JSON.stringify(enrichedPayload);

      // Deliver
      log.debug(
        { deliveryId: delivery.id, webhookId: webhook.id, attempt: delivery.attempts + 1 },
        'Delivering webhook'
      );

      // SEC-007: Decrypt secret from DB before signing the delivery payload
      const plaintextSecret = decryptWebhookSecret(webhook.secret);

      const result = await deliverWebhook(
        webhook.url,
        payload,
        plaintextSecret,
        delivery.eventType,
        delivery.id
      );

      // Update delivery record
      const newAttempts = delivery.attempts + 1;

      if (result.success) {
        // Success!
        await this.prisma.$transaction([
          this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: 'DELIVERED',
              attempts: newAttempts,
              responseCode: result.statusCode,
              responseBody: result.responseBody ?? null,
              responseTime: result.responseTimeMs,
              deliveredAt: new Date(),
              errorMessage: null,
            },
          }),
          this.prisma.webhook.update({
            where: { id: webhook.id },
            data: {
              consecutiveFailures: 0,
              lastDeliveryAt: new Date(),
            },
          }),
        ]);

        log.info(
          { deliveryId: delivery.id, webhookId: webhook.id, responseTime: result.responseTimeMs },
          'Webhook delivered successfully'
        );
      } else {
        // Failure - schedule retry or mark as exhausted
        const nextRetryAt = getNextRetryAt(newAttempts);
        const newConsecutiveFailures = webhook.consecutiveFailures + 1;
        const shouldDisable = newConsecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD;

        await this.prisma.$transaction([
          this.prisma.webhookDelivery.update({
            where: { id: delivery.id },
            data: {
              status: nextRetryAt ? 'FAILED' : 'EXHAUSTED',
              attempts: newAttempts,
              responseCode: result.statusCode,
              responseBody: result.responseBody ?? null,
              responseTime: result.responseTimeMs,
              errorMessage: result.errorMessage ?? null,
              nextRetryAt,
            },
          }),
          this.prisma.webhook.update({
            where: { id: webhook.id },
            data: {
              consecutiveFailures: newConsecutiveFailures,
              lastFailureAt: new Date(),
              ...(shouldDisable && {
                enabled: false,
                disabledAt: new Date(),
                disableReason: `Auto-disabled after ${newConsecutiveFailures} consecutive failures`,
              }),
            },
          }),
        ]);

        if (shouldDisable) {
          log.warn(
            { webhookId: webhook.id, failures: newConsecutiveFailures },
            'Webhook auto-disabled due to consecutive failures'
          );
        } else if (nextRetryAt) {
          log.info(
            { deliveryId: delivery.id, attempt: newAttempts, nextRetryAt },
            'Webhook delivery failed, scheduled retry'
          );
        } else {
          log.warn(
            { deliveryId: delivery.id, attempts: newAttempts },
            'Webhook delivery exhausted all retries'
          );
        }
      }
    } catch (error) {
      log.error({ error, deliveryId: task.deliveryId }, 'Error processing webhook delivery');
    }
  }

  /**
   * Queue a delivery for retry (called by retry plugin).
   *
   * @param deliveryId - ID of the delivery to retry
   * @param webhookId - ID of the webhook
   */
  queueRetry(deliveryId: string, webhookId: string): void {
    this.queue.push({
      deliveryId,
      webhookId,
      attempt: 0, // Attempt count is tracked in the database
    });
    this.processQueue();
  }

  /**
   * Get queue statistics.
   *
   * @returns Queue stats
   */
  getStats(): { queueSize: number; activeDeliveries: number } {
    return {
      queueSize: this.queue.length,
      activeDeliveries: this.activeDeliveries,
    };
  }

  /**
   * Shutdown the dispatcher.
   */
  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    this.queue = [];
    this.isInitialized = false;
    this.prisma = null;

    log.info('WebhookDispatcher shutdown');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton instance of the WebhookDispatcher.
 *
 * Call initialize() in server startup and shutdown() on server close.
 */
export const webhookDispatcher = new WebhookDispatcher();

// ============================================================================
// TEST WEBHOOK FUNCTION
// ============================================================================

/**
 * Send a test webhook to verify endpoint configuration.
 *
 * This function is used by the testWebhook mutation to validate
 * that a webhook is correctly configured before going live.
 *
 * @param url - Webhook URL to test
 * @param secret - Webhook secret
 * @returns Delivery result
 */
export async function sendTestWebhook(
  url: string,
  secret: string
): Promise<DeliveryResult> {
  const testPayload = {
    id: `evt_test_${Date.now()}`,
    type: 'TEST',
    timestamp: new Date().toISOString(),
    test: true,
    data: {
      message: 'This is a test webhook delivery from Moltverse.',
    },
  };

  const payload = JSON.stringify(testPayload);
  const deliveryId = `test_${Date.now()}`;

  return deliverWebhook(url, payload, secret, 'TEST', deliveryId);
}

// ============================================================================
// TEST EXPORTS
// ============================================================================

/**
 * Export IP validation functions for testing purposes.
 * These are internal functions used by the webhook delivery system
 * to prevent SSRF attacks via DNS rebinding.
 */
export const __testExports = {
  isPrivateIPv4,
  isPrivateIPv6,
  verifyHostnameResolvesToPublicIP,
};
