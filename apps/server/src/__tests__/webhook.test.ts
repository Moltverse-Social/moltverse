/**
 * Webhook system tests
 *
 * Tests for webhook cryptography, URL validation, and SSRF prevention.
 */

import { describe, it, expect } from 'vitest';
import {
  generateWebhookSecret,
  isValidWebhookSecret,
  signWebhookPayload,
  parseSignature,
  verifyWebhookSignature,
  generateWebhookHeaders,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  EVENT_TYPE_HEADER,
  DELIVERY_ID_HEADER,
  SIGNATURE_MAX_AGE_SECONDS,
} from '../lib/webhook-crypto.js';
import { webhookUrl, webhookEvents, setWebhookInput, VALID_WEBHOOK_EVENTS } from '../lib/validation.js';

// ============================================================================
// WEBHOOK SECRET TESTS
// ============================================================================

describe('Webhook Secret Generation', () => {
  it('should generate a secret with correct format', () => {
    const secret = generateWebhookSecret();

    expect(secret).toBeDefined();
    expect(secret.startsWith('whsec_')).toBe(true);
    expect(secret.length).toBe(70); // whsec_ (6) + 64 hex chars
  });

  it('should generate unique secrets', () => {
    const secrets = new Set<string>();

    for (let i = 0; i < 100; i++) {
      secrets.add(generateWebhookSecret());
    }

    expect(secrets.size).toBe(100);
  });

  it('should validate correct secret format', () => {
    const validSecret = generateWebhookSecret();
    expect(isValidWebhookSecret(validSecret)).toBe(true);
  });

  it('should reject invalid secret formats', () => {
    expect(isValidWebhookSecret('')).toBe(false);
    expect(isValidWebhookSecret('invalid')).toBe(false);
    expect(isValidWebhookSecret('whsec_tooshort')).toBe(false);
    expect(isValidWebhookSecret('whsec_' + 'g'.repeat(64))).toBe(false); // g is not hex
    expect(isValidWebhookSecret('wrong_' + 'a'.repeat(64))).toBe(false); // wrong prefix
  });
});

// ============================================================================
// SIGNATURE TESTS
// ============================================================================

describe('Webhook Signature', () => {
  const testSecret = 'whsec_' + 'a'.repeat(64);
  const testPayload = JSON.stringify({ event: 'test', data: { id: '123' } });

  it('should sign a payload with timestamp', () => {
    const signature = signWebhookPayload(testPayload, testSecret);

    expect(signature).toBeDefined();
    expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
  });

  it('should produce consistent signatures for same timestamp', () => {
    const timestamp = 1234567890;
    const sig1 = signWebhookPayload(testPayload, testSecret, timestamp);
    const sig2 = signWebhookPayload(testPayload, testSecret, timestamp);

    expect(sig1).toBe(sig2);
  });

  it('should produce different signatures for different timestamps', () => {
    const sig1 = signWebhookPayload(testPayload, testSecret, 1000);
    const sig2 = signWebhookPayload(testPayload, testSecret, 2000);

    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different payloads', () => {
    const timestamp = 1234567890;
    const payload1 = JSON.stringify({ a: 1 });
    const payload2 = JSON.stringify({ a: 2 });

    const sig1 = signWebhookPayload(payload1, testSecret, timestamp);
    const sig2 = signWebhookPayload(payload2, testSecret, timestamp);

    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different secrets', () => {
    const timestamp = 1234567890;
    const secret1 = 'whsec_' + 'a'.repeat(64);
    const secret2 = 'whsec_' + 'b'.repeat(64);

    const sig1 = signWebhookPayload(testPayload, secret1, timestamp);
    const sig2 = signWebhookPayload(testPayload, secret2, timestamp);

    expect(sig1).not.toBe(sig2);
  });

  it('should work with secrets without prefix', () => {
    const secretWithPrefix = 'whsec_' + 'a'.repeat(64);
    const secretWithoutPrefix = 'a'.repeat(64);
    const timestamp = 1234567890;

    const sig1 = signWebhookPayload(testPayload, secretWithPrefix, timestamp);
    const sig2 = signWebhookPayload(testPayload, secretWithoutPrefix, timestamp);

    expect(sig1).toBe(sig2);
  });
});

// ============================================================================
// SIGNATURE PARSING TESTS
// ============================================================================

describe('Signature Parsing', () => {
  it('should parse valid signature', () => {
    const signature = 't=1234567890,v1=' + 'a'.repeat(64);
    const parsed = parseSignature(signature);

    expect(parsed).not.toBeNull();
    expect(parsed?.timestamp).toBe(1234567890);
    expect(parsed?.signature).toBe('a'.repeat(64));
  });

  it('should return null for invalid formats', () => {
    expect(parseSignature('')).toBeNull();
    expect(parseSignature('invalid')).toBeNull();
    expect(parseSignature('t=abc,v1=def')).toBeNull(); // t must be number
    expect(parseSignature('t=123')).toBeNull(); // missing v1
    expect(parseSignature('v1=abc')).toBeNull(); // missing t
  });
});

// ============================================================================
// SIGNATURE VERIFICATION TESTS
// ============================================================================

describe('Signature Verification', () => {
  const testSecret = 'whsec_' + 'a'.repeat(64);
  const testPayload = JSON.stringify({ event: 'test', data: { id: '123' } });

  it('should verify valid signature', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(testPayload, testSecret, timestamp);

    const result = verifyWebhookSignature(testPayload, signature, testSecret);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should reject expired signature', () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - SIGNATURE_MAX_AGE_SECONDS - 60;
    const signature = signWebhookPayload(testPayload, testSecret, oldTimestamp);

    const result = verifyWebhookSignature(testPayload, signature, testSecret);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('should reject future signature', () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + SIGNATURE_MAX_AGE_SECONDS + 60;
    const signature = signWebhookPayload(testPayload, testSecret, futureTimestamp);

    const result = verifyWebhookSignature(testPayload, signature, testSecret);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  it('should reject tampered payload', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(testPayload, testSecret, timestamp);
    const tamperedPayload = JSON.stringify({ event: 'tampered', data: { id: '999' } });

    const result = verifyWebhookSignature(tamperedPayload, signature, testSecret);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('mismatch');
  });

  it('should reject wrong secret', () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signWebhookPayload(testPayload, testSecret, timestamp);
    const wrongSecret = 'whsec_' + 'b'.repeat(64);

    const result = verifyWebhookSignature(testPayload, signature, wrongSecret);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('mismatch');
  });

  it('should reject invalid signature format', () => {
    const result = verifyWebhookSignature(testPayload, 'invalid', testSecret);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid signature format');
  });

  it('should allow custom max age', () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 120; // 2 minutes old
    const signature = signWebhookPayload(testPayload, testSecret, oldTimestamp);

    // Should fail with default 5 minute max age... wait, 120s is less than 300s
    // Let's use a smaller max age
    const shortResult = verifyWebhookSignature(testPayload, signature, testSecret, 60);
    expect(shortResult.valid).toBe(false);

    // Should pass with longer max age
    const longResult = verifyWebhookSignature(testPayload, signature, testSecret, 180);
    expect(longResult.valid).toBe(true);
  });
});

// ============================================================================
// HEADER GENERATION TESTS
// ============================================================================

describe('Webhook Headers', () => {
  const testSecret = 'whsec_' + 'a'.repeat(64);
  const testPayload = JSON.stringify({ event: 'test' });

  it('should generate all required headers', () => {
    const headers = generateWebhookHeaders(testPayload, testSecret, 'SEND_SCRAP', 'delivery-123');

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['User-Agent']).toBe('Moltverse-Webhook/1.0');
    expect(headers[SIGNATURE_HEADER]).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(headers[TIMESTAMP_HEADER]).toMatch(/^\d+$/);
    expect(headers[EVENT_TYPE_HEADER]).toBe('SEND_SCRAP');
    expect(headers[DELIVERY_ID_HEADER]).toBe('delivery-123');
  });

  it('should generate verifiable signature', () => {
    const headers = generateWebhookHeaders(testPayload, testSecret, 'ADD_FRIEND', 'delivery-456');

    const result = verifyWebhookSignature(testPayload, headers[SIGNATURE_HEADER], testSecret);

    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// URL VALIDATION TESTS (SSRF Prevention)
// ============================================================================

describe('Webhook URL Validation', () => {
  // Valid URLs
  it('should accept valid HTTPS URLs', () => {
    const validUrls = [
      'https://example.com/webhook',
      'https://api.myservice.com/hooks/agent',
      'https://hooks.zapier.com/hooks/catch/123456/abc123',
      'https://webhook.site/unique-id',
    ];

    for (const url of validUrls) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be valid`).toBe(true);
    }
  });

  // Invalid URLs - Localhost variants
  it('should reject localhost URLs', () => {
    const localhostUrls = [
      'https://localhost/webhook',
      'https://localhost:8080/webhook',
      'http://localhost/webhook',
      'https://127.0.0.1/webhook',
      'https://127.0.0.1:3000/webhook',
    ];

    for (const url of localhostUrls) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be rejected`).toBe(false);
    }
  });

  // Invalid URLs - Private IPv4 ranges
  it('should reject private IPv4 addresses', () => {
    const privateIps = [
      'https://10.0.0.1/webhook',           // 10.0.0.0/8
      'https://10.255.255.255/webhook',
      'https://172.16.0.1/webhook',         // 172.16.0.0/12
      'https://172.31.255.255/webhook',
      'https://192.168.0.1/webhook',        // 192.168.0.0/16
      'https://192.168.1.100/webhook',
    ];

    for (const url of privateIps) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be rejected`).toBe(false);
    }
  });

  // Invalid URLs - Link-local and special ranges
  it('should reject link-local and special IP ranges', () => {
    const specialIps = [
      'https://169.254.1.1/webhook',        // Link-local
      'https://169.254.169.254/webhook',    // AWS metadata
      'https://0.0.0.0/webhook',            // Invalid
      'https://224.0.0.1/webhook',          // Multicast
      'https://255.255.255.255/webhook',    // Broadcast
    ];

    for (const url of specialIps) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be rejected`).toBe(false);
    }
  });

  // Invalid URLs - Carrier-grade NAT
  it('should reject carrier-grade NAT addresses', () => {
    const cgnatIps = [
      'https://100.64.0.1/webhook',
      'https://100.100.100.100/webhook',
      'https://100.127.255.255/webhook',
    ];

    for (const url of cgnatIps) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be rejected`).toBe(false);
    }
  });

  // Invalid URLs - IPv6 private addresses
  it('should reject private IPv6 addresses', () => {
    const privateIpv6 = [
      'https://[::1]/webhook',              // Loopback
      'https://[fe80::1]/webhook',          // Link-local
      'https://[fc00::1]/webhook',          // Unique local
      'https://[fd00::1]/webhook',          // Unique local
    ];

    for (const url of privateIpv6) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be rejected`).toBe(false);
    }
  });

  // Invalid URLs - Internal domains
  it('should reject internal domain patterns', () => {
    const internalDomains = [
      'https://myservice.local/webhook',
      'https://internal.local/webhook',
      'https://app.localhost/webhook',
      'https://service.internal/webhook',
    ];

    for (const url of internalDomains) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be rejected`).toBe(false);
    }
  });

  // Invalid URLs - Our own infrastructure
  it('should reject Moltverse infrastructure URLs', () => {
    const moltverseUrls = [
      'https://moltverse-api-production.up.railway.app/webhook',
      'https://moltverse.vercel.app/webhook',
      'https://anything-moltverse.railway.app/webhook',
      'https://moltverse.social/webhook',
      'https://api.moltverse.social/webhook',
      'https://anything.moltverse.social/webhook',
    ];

    for (const url of moltverseUrls) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be rejected`).toBe(false);
    }
  });

  // Invalid URLs - Non-HTTP protocols
  it('should reject non-HTTP protocols', () => {
    const invalidProtocols = [
      'ftp://example.com/webhook',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
    ];

    for (const url of invalidProtocols) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be rejected`).toBe(false);
    }
  });

  // Invalid URLs - Malformed
  it('should reject malformed URLs', () => {
    const malformedUrls = [
      '',
      'not-a-url',
      'http://',
      'https://',
      '://example.com',
    ];

    for (const url of malformedUrls) {
      const result = webhookUrl.safeParse(url);
      expect(result.success, `Expected ${url} to be rejected`).toBe(false);
    }
  });

  // URL length limit
  it('should reject URLs over 2048 characters', () => {
    const longPath = 'a'.repeat(2100);
    const longUrl = `https://example.com/${longPath}`;

    const result = webhookUrl.safeParse(longUrl);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// EVENT TYPE VALIDATION TESTS
// ============================================================================

describe('Webhook Event Validation', () => {
  it('should accept valid event types', () => {
    const validEvents = ['SEND_SCRAP', 'ADD_FRIEND', 'JOIN_CLUSTER'];
    const result = webhookEvents.safeParse(validEvents);

    expect(result.success).toBe(true);
  });

  it('should accept all valid event types', () => {
    const result = webhookEvents.safeParse([...VALID_WEBHOOK_EVENTS]);
    expect(result.success).toBe(true);
  });

  it('should reject empty event array', () => {
    const result = webhookEvents.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('should reject invalid event types', () => {
    const result = webhookEvents.safeParse(['INVALID_EVENT']);
    expect(result.success).toBe(false);
  });

  it('should reject duplicate events', () => {
    const result = webhookEvents.safeParse(['SEND_SCRAP', 'SEND_SCRAP']);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// SET WEBHOOK INPUT VALIDATION TESTS
// ============================================================================

describe('Set Webhook Input Validation', () => {
  it('should accept valid input', () => {
    const input = {
      url: 'https://example.com/webhook',
      events: ['SEND_SCRAP', 'ADD_FRIEND'],
    };

    const result = setWebhookInput.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('should reject missing URL', () => {
    const input = {
      events: ['SEND_SCRAP'],
    };

    const result = setWebhookInput.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject missing events', () => {
    const input = {
      url: 'https://example.com/webhook',
    };

    const result = setWebhookInput.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject invalid URL', () => {
    const input = {
      url: 'https://localhost/webhook',
      events: ['SEND_SCRAP'],
    };

    const result = setWebhookInput.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should reject invalid events', () => {
    const input = {
      url: 'https://example.com/webhook',
      events: ['NOT_A_REAL_EVENT'],
    };

    const result = setWebhookInput.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// IP ADDRESS NORMALIZATION TESTS
// ============================================================================

import { normalizeIPAddress } from '../lib/validation.js';

describe('IP Address Normalization', () => {
  describe('standard decimal notation', () => {
    it('should return same IP for standard format', () => {
      expect(normalizeIPAddress('127.0.0.1')).toBe('127.0.0.1');
      expect(normalizeIPAddress('192.168.1.1')).toBe('192.168.1.1');
      expect(normalizeIPAddress('10.0.0.1')).toBe('10.0.0.1');
      expect(normalizeIPAddress('8.8.8.8')).toBe('8.8.8.8');
    });

    it('should handle "0" octets correctly', () => {
      expect(normalizeIPAddress('0.0.0.0')).toBe('0.0.0.0');
      expect(normalizeIPAddress('192.168.0.1')).toBe('192.168.0.1');
    });
  });

  describe('octal notation', () => {
    it('should convert octal loopback (0177.0.0.1)', () => {
      // 0177 in octal = 127 in decimal
      expect(normalizeIPAddress('0177.0.0.1')).toBe('127.0.0.1');
    });

    it('should convert full octal address', () => {
      // 0177.0.0.01 = 127.0.0.1
      expect(normalizeIPAddress('0177.0.0.01')).toBe('127.0.0.1');
    });

    it('should convert octal private ranges', () => {
      // 012.0.0.1 = 10.0.0.1
      expect(normalizeIPAddress('012.0.0.1')).toBe('10.0.0.1');
      // 0300.0250.01.01 = 192.168.1.1
      expect(normalizeIPAddress('0300.0250.01.01')).toBe('192.168.1.1');
    });

    it('should handle mixed octal and decimal', () => {
      expect(normalizeIPAddress('0177.0.0.1')).toBe('127.0.0.1');
      expect(normalizeIPAddress('127.0.0.01')).toBe('127.0.0.1');
    });
  });

  describe('hexadecimal notation', () => {
    it('should convert hex loopback (0x7f.0.0.1)', () => {
      // 0x7f = 127
      expect(normalizeIPAddress('0x7f.0.0.1')).toBe('127.0.0.1');
    });

    it('should convert full hex address', () => {
      expect(normalizeIPAddress('0x7f.0x0.0x0.0x1')).toBe('127.0.0.1');
    });

    it('should handle uppercase hex', () => {
      expect(normalizeIPAddress('0x7F.0x0.0x0.0x1')).toBe('127.0.0.1');
    });

    it('should convert hex private ranges', () => {
      // 0x0a = 10
      expect(normalizeIPAddress('0x0a.0.0.1')).toBe('10.0.0.1');
      // 0xc0.0xa8.0x01.0x01 = 192.168.1.1
      expect(normalizeIPAddress('0xc0.0xa8.0x01.0x01')).toBe('192.168.1.1');
    });
  });

  describe('decimal (single number) notation', () => {
    it('should convert decimal loopback (2130706433)', () => {
      // 2130706433 = 127.0.0.1 (127*256^3 + 0*256^2 + 0*256 + 1)
      expect(normalizeIPAddress('2130706433')).toBe('127.0.0.1');
    });

    it('should convert decimal private ranges', () => {
      // 167772161 = 10.0.0.1
      expect(normalizeIPAddress('167772161')).toBe('10.0.0.1');
      // 3232235777 = 192.168.1.1
      expect(normalizeIPAddress('3232235777')).toBe('192.168.1.1');
    });

    it('should handle boundary values', () => {
      // 0 = 0.0.0.0
      expect(normalizeIPAddress('0')).toBe('0.0.0.0');
      // 4294967295 = 255.255.255.255
      expect(normalizeIPAddress('4294967295')).toBe('255.255.255.255');
    });

    it('should return null for values > 4294967295', () => {
      expect(normalizeIPAddress('4294967296')).toBeNull();
      expect(normalizeIPAddress('99999999999')).toBeNull();
    });
  });

  describe('mixed notations', () => {
    it('should handle mix of octal, hex, and decimal', () => {
      // 0x7f.0.0.01 = 127.0.0.1 (hex first octet, octal last)
      expect(normalizeIPAddress('0x7f.0.0.01')).toBe('127.0.0.1');
    });
  });

  describe('invalid inputs', () => {
    it('should return null for non-IP strings', () => {
      expect(normalizeIPAddress('localhost')).toBeNull();
      expect(normalizeIPAddress('example.com')).toBeNull();
      expect(normalizeIPAddress('')).toBeNull();
      expect(normalizeIPAddress('not-an-ip')).toBeNull();
    });

    it('should return null for wrong number of octets', () => {
      expect(normalizeIPAddress('127.0.0')).toBeNull();
      expect(normalizeIPAddress('127.0.0.1.1')).toBeNull();
      expect(normalizeIPAddress('127')).not.toBeNull(); // This is valid decimal
    });

    it('should return null for out-of-range octets', () => {
      expect(normalizeIPAddress('256.0.0.1')).toBeNull();
      expect(normalizeIPAddress('127.0.0.256')).toBeNull();
      expect(normalizeIPAddress('-1.0.0.1')).toBeNull();
    });

    it('should return null for invalid octal digits', () => {
      // 08 is invalid octal (8 is not an octal digit)
      expect(normalizeIPAddress('08.0.0.1')).toBeNull();
      expect(normalizeIPAddress('09.0.0.1')).toBeNull();
    });

    it('should return null for IPv6 addresses', () => {
      expect(normalizeIPAddress('::1')).toBeNull();
      expect(normalizeIPAddress('fe80::1')).toBeNull();
    });

    it('should handle whitespace', () => {
      expect(normalizeIPAddress(' 127.0.0.1 ')).toBe('127.0.0.1');
      expect(normalizeIPAddress('  2130706433  ')).toBe('127.0.0.1');
    });
  });
});

// ============================================================================
// WEBHOOK URL VALIDATION WITH NORMALIZED IPs
// ============================================================================

describe('Webhook URL Validation - IP Normalization Bypass Prevention', () => {
  it('should reject octal notation for localhost', () => {
    // 0177.0.0.1 = 127.0.0.1
    const result = webhookUrl.safeParse('https://0177.0.0.1/webhook');
    expect(result.success).toBe(false);
  });

  it('should reject hex notation for localhost', () => {
    // 0x7f.0.0.1 = 127.0.0.1
    const result = webhookUrl.safeParse('https://0x7f.0.0.1/webhook');
    expect(result.success).toBe(false);
  });

  it('should reject decimal notation for localhost', () => {
    // 2130706433 = 127.0.0.1
    const result = webhookUrl.safeParse('https://2130706433/webhook');
    expect(result.success).toBe(false);
  });

  it('should reject octal notation for private IPs', () => {
    // 012.0.0.1 = 10.0.0.1
    const result = webhookUrl.safeParse('https://012.0.0.1/webhook');
    expect(result.success).toBe(false);
  });

  it('should reject hex notation for private IPs', () => {
    // 0xc0.0xa8.0x01.0x01 = 192.168.1.1
    const result = webhookUrl.safeParse('https://0xc0.0xa8.0x01.0x01/webhook');
    expect(result.success).toBe(false);
  });

  it('should reject decimal notation for private IPs', () => {
    // 3232235777 = 192.168.1.1
    const result = webhookUrl.safeParse('https://3232235777/webhook');
    expect(result.success).toBe(false);
  });
});
