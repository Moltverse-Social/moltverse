/**
 * Cloudinary URL validation tests
 *
 * Tests for:
 * - isCloudinaryUrl function
 * - validateImageUrl function (throws GraphQLError for invalid URLs)
 */

import { describe, it, expect } from 'vitest';
import { GraphQLError } from 'graphql';
import { isCloudinaryUrl, validateImageUrl } from '../lib/cloudinary.js';

// ============================================================================
// isCloudinaryUrl TESTS
// ============================================================================

describe('isCloudinaryUrl', () => {
  describe('valid Cloudinary URLs', () => {
    it('should accept res.cloudinary.com URLs', () => {
      const validUrls = [
        'https://res.cloudinary.com/dz2fe5xcb/image/upload/v1234567890/moltverse/profiles/avatar.jpg',
        'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        'https://res.cloudinary.com/cloudname/video/upload/v1/video.mp4',
        'https://res.cloudinary.com/test/raw/upload/document.pdf',
      ];

      for (const url of validUrls) {
        expect(isCloudinaryUrl(url), `Expected ${url} to be valid`).toBe(true);
      }
    });

    it('should accept subdomain.cloudinary.com URLs', () => {
      const validUrls = [
        'https://api.cloudinary.com/v1_1/demo/image/upload',
        'https://upload.cloudinary.com/something',
      ];

      for (const url of validUrls) {
        expect(isCloudinaryUrl(url), `Expected ${url} to be valid`).toBe(true);
      }
    });

    it('should accept HTTP Cloudinary URLs (non-secure)', () => {
      expect(isCloudinaryUrl('http://res.cloudinary.com/demo/image/upload/sample.jpg')).toBe(true);
    });

    it('should accept URLs with transformations', () => {
      const url = 'https://res.cloudinary.com/demo/image/upload/w_200,h_200,c_fill/sample.jpg';
      expect(isCloudinaryUrl(url)).toBe(true);
    });

    it('should accept URLs with special characters in path', () => {
      const url = 'https://res.cloudinary.com/demo/image/upload/folder%2Fimage.jpg';
      expect(isCloudinaryUrl(url)).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('should reject non-Cloudinary URLs', () => {
      const invalidUrls = [
        'https://example.com/image.jpg',
        'https://imgur.com/abc123.png',
        'https://i.imgur.com/abc123.png',
        'https://images.unsplash.com/photo.jpg',
        'https://cdn.example.com/image.jpg',
        'https://evil.com/image.jpg',
      ];

      for (const url of invalidUrls) {
        expect(isCloudinaryUrl(url), `Expected ${url} to be rejected`).toBe(false);
      }
    });

    it('should reject tracking pixels and suspicious URLs', () => {
      const trackingUrls = [
        'https://pixel.tracker.com/1x1.gif',
        'https://tracking.example.com/pixel.png',
        'https://analytics.evil.com/img.jpg',
      ];

      for (const url of trackingUrls) {
        expect(isCloudinaryUrl(url), `Expected ${url} to be rejected`).toBe(false);
      }
    });

    it('should reject URLs that look like Cloudinary but are not', () => {
      const spoofUrls = [
        'https://res.cloudinary.com.evil.com/image.jpg',
        'https://fake-res.cloudinary.com/image.jpg',
        'https://cloudinary.com.attacker.com/image.jpg',
        'https://res-cloudinary.com/image.jpg',
      ];

      for (const url of spoofUrls) {
        expect(isCloudinaryUrl(url), `Expected ${url} to be rejected`).toBe(false);
      }
    });

    it('should reject malformed URLs', () => {
      const malformedUrls = [
        '',
        'not-a-url',
        'javascript:alert(1)',
        'data:image/png;base64,abc123',
        'file:///etc/passwd',
        '//res.cloudinary.com/image.jpg', // protocol-relative
      ];

      for (const url of malformedUrls) {
        expect(isCloudinaryUrl(url), `Expected ${url} to be rejected`).toBe(false);
      }
    });

    it('should reject data URIs', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(isCloudinaryUrl(dataUri)).toBe(false);
    });
  });
});

// ============================================================================
// validateImageUrl TESTS
// ============================================================================

describe('validateImageUrl', () => {
  describe('valid inputs', () => {
    it('should accept valid Cloudinary URLs without throwing', () => {
      const validUrls = [
        'https://res.cloudinary.com/dz2fe5xcb/image/upload/v1234567890/moltverse/profiles/avatar.jpg',
        'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      ];

      for (const url of validUrls) {
        expect(() => validateImageUrl(url, 'test field')).not.toThrow();
      }
    });

    it('should accept null without throwing', () => {
      expect(() => validateImageUrl(null, 'test field')).not.toThrow();
    });

    it('should accept undefined without throwing', () => {
      expect(() => validateImageUrl(undefined, 'test field')).not.toThrow();
    });

    it('should accept empty string as falsy without throwing', () => {
      // Empty string is falsy in JS, so it should not throw
      expect(() => validateImageUrl('', 'test field')).not.toThrow();
    });
  });

  describe('invalid inputs - should throw GraphQLError', () => {
    it('should throw for non-Cloudinary URLs', () => {
      const invalidUrls = [
        'https://example.com/image.jpg',
        'https://imgur.com/abc123.png',
        'https://evil.com/tracking-pixel.gif',
      ];

      for (const url of invalidUrls) {
        expect(() => validateImageUrl(url, 'profile picture')).toThrow(GraphQLError);
      }
    });

    it('should include field name in error message', () => {
      try {
        validateImageUrl('https://evil.com/image.jpg', 'cover URL');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GraphQLError);
        expect((error as GraphQLError).message).toContain('cover URL');
        expect((error as GraphQLError).message).toContain('Only Cloudinary URLs are accepted');
      }
    });

    it('should set error code to BAD_USER_INPUT', () => {
      try {
        validateImageUrl('https://evil.com/image.jpg', 'test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GraphQLError);
        expect((error as GraphQLError).extensions?.code).toBe('BAD_USER_INPUT');
      }
    });

    it('should throw for tracking pixels', () => {
      expect(() => validateImageUrl('https://pixel.tracker.com/1x1.gif', 'image')).toThrow(GraphQLError);
    });

    it('should throw for data URIs', () => {
      const dataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(() => validateImageUrl(dataUri, 'image')).toThrow(GraphQLError);
    });

    it('should throw for javascript URLs', () => {
      expect(() => validateImageUrl('javascript:alert(1)', 'image')).toThrow(GraphQLError);
    });
  });

  describe('field name variations', () => {
    it('should include correct field name for profile picture', () => {
      try {
        validateImageUrl('https://evil.com/img.jpg', 'profile picture');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as GraphQLError).message).toBe('Invalid profile picture. Only Cloudinary URLs are accepted.');
      }
    });

    it('should include correct field name for event picture', () => {
      try {
        validateImageUrl('https://evil.com/img.jpg', 'event picture');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as GraphQLError).message).toBe('Invalid event picture. Only Cloudinary URLs are accepted.');
      }
    });

    it('should include correct field name for post picture', () => {
      try {
        validateImageUrl('https://evil.com/img.jpg', 'post picture');
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as GraphQLError).message).toBe('Invalid post picture. Only Cloudinary URLs are accepted.');
      }
    });
  });
});
