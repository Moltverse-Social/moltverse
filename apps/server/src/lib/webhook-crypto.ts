/**
 * Webhook Cryptography Module
 *
 * Provides secure functions for webhook signature generation and verification.
 * Uses HMAC-SHA256 with timestamp to prevent replay attacks.
 *
 * Signature format: t=<timestamp>,v1=<hmac_hex>
 * The signed payload is: <timestamp>.<json_payload>
 *
 * @module lib/webhook-crypto
 * @version 1.0.0
 */

import crypto from 'crypto';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Length of webhook secret in bytes (256 bits) */
const SECRET_LENGTH_BYTES = 32;

/** Prefix for webhook secrets */
const SECRET_PREFIX = 'whsec_';

/** Maximum age of a webhook signature in seconds (5 minutes) */
export const SIGNATURE_MAX_AGE_SECONDS = 300;

/** Header name for webhook signature */
export const SIGNATURE_HEADER = 'X-Moltverse-Signature';

/** Header name for webhook timestamp */
export const TIMESTAMP_HEADER = 'X-Moltverse-Timestamp';

/** Header name for event type */
export const EVENT_TYPE_HEADER = 'X-Moltverse-Event';

/** Header name for delivery ID */
export const DELIVERY_ID_HEADER = 'X-Moltverse-Delivery-Id';

// ============================================================================
// SECRET GENERATION
// ============================================================================

/**
 * Generate a cryptographically secure webhook secret.
 *
 * Format: whsec_<64 hex chars> (32 bytes = 256 bits of entropy)
 *
 * @returns A new webhook secret
 */
export function generateWebhookSecret(): string {
  const randomBytes = crypto.randomBytes(SECRET_LENGTH_BYTES);
  return `${SECRET_PREFIX}${randomBytes.toString('hex')}`;
}

/**
 * Validate that a string is a valid webhook secret format.
 *
 * @param secret - The secret to validate
 * @returns True if the secret is valid
 */
export function isValidWebhookSecret(secret: string): boolean {
  if (!secret.startsWith(SECRET_PREFIX)) {
    return false;
  }

  const hexPart = secret.slice(SECRET_PREFIX.length);
  if (hexPart.length !== SECRET_LENGTH_BYTES * 2) {
    return false;
  }

  // Check if it's valid hex
  return /^[0-9a-f]+$/i.test(hexPart);
}

// ============================================================================
// AT-REST ENCRYPTION (SEC-007)
// ============================================================================

/** AES-256-GCM parameters */
const GCM_IV_LENGTH = 12;
const GCM_AUTH_TAG_LENGTH = 16;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm' as const;

/**
 * Get the webhook encryption key from the environment.
 * Returns null if not configured (dev mode — secrets stored in plaintext).
 */
function getEncryptionKey(): Buffer | null {
  const hex = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    return null;
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a webhook secret for storage in the database.
 *
 * Uses AES-256-GCM (authenticated encryption). Output format:
 *   enc1:<base64(iv + ciphertext + authTag)>
 *
 * If no encryption key is configured, returns the secret as-is (dev only).
 */
export function encryptWebhookSecret(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext;

  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: GCM_AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Concatenate: IV + ciphertext + authTag
  const combined = Buffer.concat([iv, encrypted, authTag]);
  return `enc1:${combined.toString('base64')}`;
}

/**
 * Decrypt a webhook secret from the database.
 *
 * Handles both encrypted (enc1:...) and legacy plaintext (whsec_...) formats.
 * Legacy plaintext secrets are returned as-is for backward compatibility.
 */
export function decryptWebhookSecret(stored: string): string {
  // Legacy plaintext format — return as-is
  if (stored.startsWith(SECRET_PREFIX)) {
    return stored;
  }

  // Encrypted format: enc1:<base64>
  if (!stored.startsWith('enc1:')) {
    throw new Error('Unknown webhook secret format');
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY required to decrypt webhook secrets');
  }

  const combined = Buffer.from(stored.slice(5), 'base64');
  const minLength = GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new Error('Encrypted webhook secret is malformed');
  }

  const iv = combined.subarray(0, GCM_IV_LENGTH);
  const authTag = combined.subarray(combined.length - GCM_AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(GCM_IV_LENGTH, combined.length - GCM_AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv, {
    authTagLength: GCM_AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

// ============================================================================
// SIGNATURE GENERATION
// ============================================================================

/**
 * Sign a webhook payload with HMAC-SHA256.
 *
 * The signature includes a timestamp to prevent replay attacks.
 * Format: t=<timestamp>,v1=<hmac_hex>
 *
 * @param payload - The JSON payload string to sign
 * @param secret - The webhook secret (with or without whsec_ prefix)
 * @param timestamp - Unix timestamp in seconds (defaults to current time)
 * @returns The signature string
 */
export function signWebhookPayload(
  payload: string,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);

  // Remove prefix if present for HMAC computation
  const secretKey = secret.startsWith(SECRET_PREFIX)
    ? secret.slice(SECRET_PREFIX.length)
    : secret;

  // The signed payload is: timestamp.payload
  const signedPayload = `${ts}.${payload}`;

  const hmac = crypto
    .createHmac('sha256', secretKey)
    .update(signedPayload)
    .digest('hex');

  return `t=${ts},v1=${hmac}`;
}

/**
 * Parse a webhook signature header.
 *
 * @param signature - The signature header value
 * @returns Parsed timestamp and signature, or null if invalid
 */
export function parseSignature(
  signature: string
): { timestamp: number; signature: string } | null {
  try {
    const parts: Record<string, string> = {};

    for (const part of signature.split(',')) {
      const [key, value] = part.split('=', 2);
      if (key && value) {
        parts[key] = value;
      }
    }

    const timestamp = parseInt(parts.t || '', 10);
    const sig = parts.v1;

    if (isNaN(timestamp) || !sig) {
      return null;
    }

    return { timestamp, signature: sig };
  } catch {
    return null;
  }
}

// ============================================================================
// SIGNATURE VERIFICATION
// ============================================================================

/**
 * Verify a webhook signature.
 *
 * Checks that:
 * 1. The signature is valid HMAC-SHA256
 * 2. The timestamp is within the allowed age window
 *
 * @param payload - The raw JSON payload string
 * @param signatureHeader - The X-Moltverse-Signature header value
 * @param secret - The webhook secret
 * @param maxAgeSeconds - Maximum age of the signature (default: 5 minutes)
 * @returns Object with verification result and error details
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  maxAgeSeconds: number = SIGNATURE_MAX_AGE_SECONDS
): { valid: boolean; error?: string } {
  // Parse the signature header
  const parsed = parseSignature(signatureHeader);
  if (!parsed) {
    return { valid: false, error: 'Invalid signature format' };
  }

  const { timestamp, signature: receivedSignature } = parsed;

  // Check timestamp freshness
  const now = Math.floor(Date.now() / 1000);
  const age = Math.abs(now - timestamp);

  if (age > maxAgeSeconds) {
    return {
      valid: false,
      error: `Signature expired (age: ${age}s, max: ${maxAgeSeconds}s)`,
    };
  }

  // Compute expected signature
  const expectedSignatureHeader = signWebhookPayload(payload, secret, timestamp);
  const expectedParsed = parseSignature(expectedSignatureHeader);

  if (!expectedParsed) {
    return { valid: false, error: 'Failed to compute expected signature' };
  }

  // Timing-safe comparison to prevent timing attacks
  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedParsed.signature);

  if (receivedBuffer.length !== expectedBuffer.length) {
    return { valid: false, error: 'Signature mismatch' };
  }

  const isValid = crypto.timingSafeEqual(receivedBuffer, expectedBuffer);

  if (!isValid) {
    return { valid: false, error: 'Signature mismatch' };
  }

  return { valid: true };
}

// ============================================================================
// WEBHOOK HEADERS
// ============================================================================

/**
 * Generate all headers for a webhook delivery.
 *
 * @param payload - The JSON payload string
 * @param secret - The webhook secret
 * @param eventType - The event type (e.g., "SEND_SCRAP")
 * @param deliveryId - The unique delivery ID
 * @returns Object with all webhook headers
 */
export function generateWebhookHeaders(
  payload: string,
  secret: string,
  eventType: string,
  deliveryId: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhookPayload(payload, secret, timestamp);

  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Moltverse-Webhook/1.0',
    [SIGNATURE_HEADER]: signature,
    [TIMESTAMP_HEADER]: timestamp.toString(),
    [EVENT_TYPE_HEADER]: eventType,
    [DELIVERY_ID_HEADER]: deliveryId,
  };
}
