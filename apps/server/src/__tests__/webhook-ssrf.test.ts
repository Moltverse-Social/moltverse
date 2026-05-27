/**
 * DNS Rebinding and SSRF Protection Tests
 *
 * Tests for webhook delivery DNS rebinding protection functions:
 * - isPrivateIPv4: Detects private/internal IPv4 addresses
 * - isPrivateIPv6: Detects private/internal IPv6 addresses
 * - verifyHostnameResolvesToPublicIP: DNS resolution with private IP detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dns from 'dns/promises';
import { __testExports } from '../lib/webhook-dispatcher.js';

const { isPrivateIPv4, isPrivateIPv6, verifyHostnameResolvesToPublicIP } = __testExports;

// ============================================================================
// isPrivateIPv4 TESTS
// ============================================================================

describe('isPrivateIPv4', () => {
  describe('loopback addresses (127.0.0.0/8)', () => {
    it('should detect 127.0.0.1 as private', () => {
      expect(isPrivateIPv4('127.0.0.1')).toBe(true);
    });

    it('should detect 127.255.255.255 as private', () => {
      expect(isPrivateIPv4('127.255.255.255')).toBe(true);
    });

    it('should detect 127.0.0.0 as private', () => {
      expect(isPrivateIPv4('127.0.0.0')).toBe(true);
    });
  });

  describe('private class A (10.0.0.0/8)', () => {
    it('should detect 10.0.0.1 as private', () => {
      expect(isPrivateIPv4('10.0.0.1')).toBe(true);
    });

    it('should detect 10.255.255.255 as private', () => {
      expect(isPrivateIPv4('10.255.255.255')).toBe(true);
    });
  });

  describe('private class B (172.16.0.0/12)', () => {
    it('should detect 172.16.0.1 as private', () => {
      expect(isPrivateIPv4('172.16.0.1')).toBe(true);
    });

    it('should detect 172.31.255.255 as private', () => {
      expect(isPrivateIPv4('172.31.255.255')).toBe(true);
    });

    it('should NOT detect 172.15.0.1 as private (outside range)', () => {
      expect(isPrivateIPv4('172.15.0.1')).toBe(false);
    });

    it('should NOT detect 172.32.0.1 as private (outside range)', () => {
      expect(isPrivateIPv4('172.32.0.1')).toBe(false);
    });
  });

  describe('private class C (192.168.0.0/16)', () => {
    it('should detect 192.168.0.1 as private', () => {
      expect(isPrivateIPv4('192.168.0.1')).toBe(true);
    });

    it('should detect 192.168.255.255 as private', () => {
      expect(isPrivateIPv4('192.168.255.255')).toBe(true);
    });

    it('should NOT detect 192.167.0.1 as private', () => {
      expect(isPrivateIPv4('192.167.0.1')).toBe(false);
    });
  });

  describe('link-local (169.254.0.0/16)', () => {
    it('should detect 169.254.0.1 as private', () => {
      expect(isPrivateIPv4('169.254.0.1')).toBe(true);
    });

    it('should detect 169.254.169.254 (AWS metadata) as private', () => {
      expect(isPrivateIPv4('169.254.169.254')).toBe(true);
    });
  });

  describe('invalid/this network (0.0.0.0/8)', () => {
    it('should detect 0.0.0.0 as private', () => {
      expect(isPrivateIPv4('0.0.0.0')).toBe(true);
    });

    it('should detect 0.255.255.255 as private', () => {
      expect(isPrivateIPv4('0.255.255.255')).toBe(true);
    });
  });

  describe('carrier-grade NAT (100.64.0.0/10)', () => {
    it('should detect 100.64.0.1 as private', () => {
      expect(isPrivateIPv4('100.64.0.1')).toBe(true);
    });

    it('should detect 100.127.255.255 as private', () => {
      expect(isPrivateIPv4('100.127.255.255')).toBe(true);
    });

    it('should NOT detect 100.63.0.1 as private (outside range)', () => {
      expect(isPrivateIPv4('100.63.0.1')).toBe(false);
    });

    it('should NOT detect 100.128.0.1 as private (outside range)', () => {
      expect(isPrivateIPv4('100.128.0.1')).toBe(false);
    });
  });

  describe('multicast and reserved (224.0.0.0/4+)', () => {
    it('should detect 224.0.0.1 as private', () => {
      expect(isPrivateIPv4('224.0.0.1')).toBe(true);
    });

    it('should detect 239.255.255.255 as private', () => {
      expect(isPrivateIPv4('239.255.255.255')).toBe(true);
    });

    it('should detect 240.0.0.1 (reserved) as private', () => {
      expect(isPrivateIPv4('240.0.0.1')).toBe(true);
    });

    it('should detect 255.255.255.255 (broadcast) as private', () => {
      expect(isPrivateIPv4('255.255.255.255')).toBe(true);
    });
  });

  describe('public IP addresses', () => {
    it('should NOT detect 8.8.8.8 (Google DNS) as private', () => {
      expect(isPrivateIPv4('8.8.8.8')).toBe(false);
    });

    it('should NOT detect 1.1.1.1 (Cloudflare DNS) as private', () => {
      expect(isPrivateIPv4('1.1.1.1')).toBe(false);
    });

    it('should NOT detect 142.250.190.78 (google.com) as private', () => {
      expect(isPrivateIPv4('142.250.190.78')).toBe(false);
    });

    it('should NOT detect 203.0.113.1 (TEST-NET-3) as private', () => {
      // TEST-NET-3 is documentation range, not blocked
      expect(isPrivateIPv4('203.0.113.1')).toBe(false);
    });
  });

  describe('malformed inputs', () => {
    it('should return false for empty string', () => {
      expect(isPrivateIPv4('')).toBe(false);
    });

    it('should return false for invalid IP', () => {
      expect(isPrivateIPv4('not-an-ip')).toBe(false);
    });

    it('should return false for IP with wrong number of parts', () => {
      expect(isPrivateIPv4('192.168.1')).toBe(false);
    });

    it('should return false for IP with out-of-range octets', () => {
      expect(isPrivateIPv4('256.1.1.1')).toBe(false);
    });

    it('should return false for IP with negative octets', () => {
      expect(isPrivateIPv4('-1.0.0.1')).toBe(false);
    });

    it('should return false for IPv6 address', () => {
      expect(isPrivateIPv4('::1')).toBe(false);
    });
  });
});

// ============================================================================
// isPrivateIPv6 TESTS
// ============================================================================

describe('isPrivateIPv6', () => {
  describe('loopback (::1)', () => {
    it('should detect ::1 as private', () => {
      expect(isPrivateIPv6('::1')).toBe(true);
    });

    it('should detect ::1 with uppercase as private', () => {
      expect(isPrivateIPv6('::1')).toBe(true);
    });
  });

  describe('unspecified (::)', () => {
    it('should detect :: as private', () => {
      expect(isPrivateIPv6('::')).toBe(true);
    });
  });

  describe('link-local (fe80::/10)', () => {
    it('should detect fe80::1 as private', () => {
      expect(isPrivateIPv6('fe80::1')).toBe(true);
    });

    it('should detect fe80:0:0:0:0:0:0:1 as private', () => {
      expect(isPrivateIPv6('fe80:0:0:0:0:0:0:1')).toBe(true);
    });

    it('should detect fe90::1 as private', () => {
      expect(isPrivateIPv6('fe90::1')).toBe(true);
    });

    it('should detect feaf::1 as private', () => {
      expect(isPrivateIPv6('feaf::1')).toBe(true);
    });

    it('should detect feb0::1 as private', () => {
      expect(isPrivateIPv6('feb0::1')).toBe(true);
    });
  });

  describe('unique local (fc00::/7)', () => {
    it('should detect fc00::1 as private', () => {
      expect(isPrivateIPv6('fc00::1')).toBe(true);
    });

    it('should detect fd00::1 as private', () => {
      expect(isPrivateIPv6('fd00::1')).toBe(true);
    });

    it('should detect fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff as private', () => {
      expect(isPrivateIPv6('fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff')).toBe(true);
    });
  });

  describe('multicast (ff00::/8)', () => {
    it('should detect ff00::1 as private', () => {
      expect(isPrivateIPv6('ff00::1')).toBe(true);
    });

    it('should detect ff02::1 (all-nodes) as private', () => {
      expect(isPrivateIPv6('ff02::1')).toBe(true);
    });
  });

  describe('IPv4-mapped IPv6 (::ffff:x.x.x.x)', () => {
    it('should detect ::ffff:127.0.0.1 as private', () => {
      expect(isPrivateIPv6('::ffff:127.0.0.1')).toBe(true);
    });

    it('should detect ::ffff:192.168.1.1 as private', () => {
      expect(isPrivateIPv6('::ffff:192.168.1.1')).toBe(true);
    });

    it('should detect ::ffff:10.0.0.1 as private', () => {
      expect(isPrivateIPv6('::ffff:10.0.0.1')).toBe(true);
    });

    it('should NOT detect ::ffff:8.8.8.8 as private', () => {
      expect(isPrivateIPv6('::ffff:8.8.8.8')).toBe(false);
    });
  });

  describe('public IPv6 addresses', () => {
    it('should NOT detect 2001:4860:4860::8888 (Google DNS) as private', () => {
      expect(isPrivateIPv6('2001:4860:4860::8888')).toBe(false);
    });

    it('should NOT detect 2606:4700:4700::1111 (Cloudflare DNS) as private', () => {
      expect(isPrivateIPv6('2606:4700:4700::1111')).toBe(false);
    });

    it('should NOT detect 2607:f8b0:4004:800::200e (google.com) as private', () => {
      expect(isPrivateIPv6('2607:f8b0:4004:800::200e')).toBe(false);
    });
  });

  describe('case sensitivity', () => {
    it('should handle uppercase addresses', () => {
      expect(isPrivateIPv6('FE80::1')).toBe(true);
    });

    it('should handle mixed case addresses', () => {
      expect(isPrivateIPv6('Fe80::1')).toBe(true);
    });
  });
});

// ============================================================================
// verifyHostnameResolvesToPublicIP TESTS
// ============================================================================

describe('verifyHostnameResolvesToPublicIP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('public IPs - should pass', () => {
    it('should pass for hostname resolving to public IPv4', async () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue({ code: 'ENODATA' });

      await expect(verifyHostnameResolvesToPublicIP('example.com')).resolves.toBeUndefined();
    });

    it('should pass for hostname resolving to public IPv6', async () => {
      vi.spyOn(dns, 'resolve4').mockRejectedValue({ code: 'ENODATA' });
      vi.spyOn(dns, 'resolve6').mockResolvedValue(['2001:4860:4860::8888']);

      await expect(verifyHostnameResolvesToPublicIP('example.com')).resolves.toBeUndefined();
    });

    it('should pass for hostname resolving to both public IPv4 and IPv6', async () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['142.250.190.78']);
      vi.spyOn(dns, 'resolve6').mockResolvedValue(['2607:f8b0:4004:800::200e']);

      await expect(verifyHostnameResolvesToPublicIP('google.com')).resolves.toBeUndefined();
    });
  });

  describe('private IPs - should throw', () => {
    it('should throw for hostname resolving to loopback IPv4', async () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['127.0.0.1']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue({ code: 'ENODATA' });

      await expect(verifyHostnameResolvesToPublicIP('evil.com'))
        .rejects.toThrow('DNS rebinding attack detected');
    });

    it('should throw for hostname resolving to private IPv4', async () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['192.168.1.1']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue({ code: 'ENODATA' });

      await expect(verifyHostnameResolvesToPublicIP('internal.com'))
        .rejects.toThrow('DNS rebinding attack detected');
    });

    it('should throw for hostname resolving to loopback IPv6', async () => {
      vi.spyOn(dns, 'resolve4').mockRejectedValue({ code: 'ENODATA' });
      vi.spyOn(dns, 'resolve6').mockResolvedValue(['::1']);

      await expect(verifyHostnameResolvesToPublicIP('localhost-v6.com'))
        .rejects.toThrow('DNS rebinding attack detected');
    });

    it('should throw for hostname resolving to link-local IPv6', async () => {
      vi.spyOn(dns, 'resolve4').mockRejectedValue({ code: 'ENODATA' });
      vi.spyOn(dns, 'resolve6').mockResolvedValue(['fe80::1']);

      await expect(verifyHostnameResolvesToPublicIP('link-local.com'))
        .rejects.toThrow('DNS rebinding attack detected');
    });
  });

  describe('mixed public/private IPs - should throw', () => {
    it('should throw if any IPv4 is private', async () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8', '127.0.0.1']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue({ code: 'ENODATA' });

      await expect(verifyHostnameResolvesToPublicIP('mixed.com'))
        .rejects.toThrow('DNS rebinding attack detected');
    });

    it('should throw if any IPv6 is private', async () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8']);
      vi.spyOn(dns, 'resolve6').mockResolvedValue(['2001:4860:4860::8888', '::1']);

      await expect(verifyHostnameResolvesToPublicIP('mixed-v6.com'))
        .rejects.toThrow('DNS rebinding attack detected');
    });

    it('should include all private IPs in error message', async () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['127.0.0.1', '10.0.0.1']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue({ code: 'ENODATA' });

      await expect(verifyHostnameResolvesToPublicIP('multi-private.com'))
        .rejects.toThrow(/127\.0\.0\.1.*10\.0\.0\.1|10\.0\.0\.1.*127\.0\.0\.1/);
    });
  });

  describe('DNS errors', () => {
    it('should pass when no A or AAAA records exist (ENODATA)', async () => {
      vi.spyOn(dns, 'resolve4').mockRejectedValue({ code: 'ENODATA' });
      vi.spyOn(dns, 'resolve6').mockRejectedValue({ code: 'ENODATA' });

      // No records is OK - the HTTP request will fail anyway
      await expect(verifyHostnameResolvesToPublicIP('no-records.com')).resolves.toBeUndefined();
    });

    it('should pass when domain does not exist (ENOTFOUND)', async () => {
      vi.spyOn(dns, 'resolve4').mockRejectedValue({ code: 'ENOTFOUND' });
      vi.spyOn(dns, 'resolve6').mockRejectedValue({ code: 'ENOTFOUND' });

      // Domain not found is OK - the HTTP request will fail anyway
      await expect(verifyHostnameResolvesToPublicIP('nonexistent.invalid')).resolves.toBeUndefined();
    });

    it('should throw for other DNS errors', async () => {
      vi.spyOn(dns, 'resolve4').mockRejectedValue({ code: 'SERVFAIL' });
      vi.spyOn(dns, 'resolve6').mockRejectedValue({ code: 'ENODATA' });

      await expect(verifyHostnameResolvesToPublicIP('dns-error.com'))
        .rejects.toMatchObject({ code: 'SERVFAIL' });
    });
  });

  describe('edge cases', () => {
    it('should pass for multiple public IPv4 addresses', async () => {
      vi.spyOn(dns, 'resolve4').mockResolvedValue(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
      vi.spyOn(dns, 'resolve6').mockRejectedValue({ code: 'ENODATA' });

      await expect(verifyHostnameResolvesToPublicIP('cdn.com')).resolves.toBeUndefined();
    });

    it('should throw for IPv4-mapped IPv6 with private address', async () => {
      vi.spyOn(dns, 'resolve4').mockRejectedValue({ code: 'ENODATA' });
      vi.spyOn(dns, 'resolve6').mockResolvedValue(['::ffff:127.0.0.1']);

      await expect(verifyHostnameResolvesToPublicIP('mapped-local.com'))
        .rejects.toThrow('DNS rebinding attack detected');
    });
  });
});
