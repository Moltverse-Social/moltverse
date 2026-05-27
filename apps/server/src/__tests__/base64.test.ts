/**
 * Base64 image validation tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateBase64Image,
  stripDataUriPrefix,
  createDataUri,
  estimateBase64Size,
  ALLOWED_MIME_TYPES,
  DEFAULT_MAX_SIZE_BYTES,
} from '../lib/base64.js';

// =============================================================================
// TEST DATA
// =============================================================================

// Minimal valid PNG (1x1 transparent pixel)
const VALID_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Minimal valid JPEG (1x1 red pixel)
const VALID_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQA/AL+AB//Z';

// Minimal valid GIF (1x1 transparent)
const VALID_GIF_BASE64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Minimal valid WebP (1x1)
const VALID_WEBP_BASE64 = 'UklGRiYAAABXRUJQVlA4IBoAAAAwAQCdASoBAAEAAQAcJYgCdAEO/hOMAAD++E0AAA==';

// Invalid base64 (not an image)
const INVALID_IMAGE_BASE64 = Buffer.from('This is not an image').toString('base64');

// =============================================================================
// TESTS
// =============================================================================

describe('validateBase64Image', () => {
  describe('Valid images', () => {
    it('should validate PNG with data URI', () => {
      const input = `data:image/png;base64,${VALID_PNG_BASE64}`;
      const result = validateBase64Image(input);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.info.mimeType).toBe('image/png');
        expect(result.info.extension).toBe('png');
        expect(result.info.sizeBytes).toBeGreaterThan(0);
      }
    });

    it('should validate PNG with raw base64', () => {
      const result = validateBase64Image(VALID_PNG_BASE64);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.info.mimeType).toBe('image/png');
      }
    });

    it('should validate JPEG', () => {
      const input = `data:image/jpeg;base64,${VALID_JPEG_BASE64}`;
      const result = validateBase64Image(input);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.info.mimeType).toBe('image/jpeg');
        expect(result.info.extension).toBe('jpg');
      }
    });

    it('should validate GIF', () => {
      const input = `data:image/gif;base64,${VALID_GIF_BASE64}`;
      const result = validateBase64Image(input);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.info.mimeType).toBe('image/gif');
        expect(result.info.extension).toBe('gif');
      }
    });

    it('should validate WebP', () => {
      const input = `data:image/webp;base64,${VALID_WEBP_BASE64}`;
      const result = validateBase64Image(input);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.info.mimeType).toBe('image/webp');
        expect(result.info.extension).toBe('webp');
      }
    });

    it('should handle whitespace in input', () => {
      const input = `  data:image/png;base64,${VALID_PNG_BASE64}  `;
      const result = validateBase64Image(input);

      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid inputs', () => {
    it('should reject empty input', () => {
      const result = validateBase64Image('');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_FORMAT');
      }
    });

    it('should reject null/undefined', () => {
      const result = validateBase64Image(null as unknown as string);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_FORMAT');
      }
    });

    it('should reject unsupported MIME types', () => {
      const input = `data:application/pdf;base64,${VALID_PNG_BASE64}`;
      const result = validateBase64Image(input);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('UNSUPPORTED_TYPE');
        expect(result.error).toContain('application/pdf');
      }
    });

    it('should reject invalid base64 encoding', () => {
      const input = 'data:image/png;base64,not-valid-base64!!!';
      const result = validateBase64Image(input);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_DATA');
      }
    });

    it('should reject data that is not an image', () => {
      const result = validateBase64Image(INVALID_IMAGE_BASE64);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_FORMAT');
      }
    });
  });

  describe('Size limits', () => {
    it('should accept image within size limit', () => {
      const result = validateBase64Image(VALID_PNG_BASE64, DEFAULT_MAX_SIZE_BYTES);

      expect(result.valid).toBe(true);
    });

    it('should reject image exceeding size limit', () => {
      // Create a "large" image by repeating base64 data (not a real image but tests size check)
      // Actually, we need to test with the real validation flow
      const result = validateBase64Image(VALID_PNG_BASE64, 10); // 10 bytes limit

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('SIZE_EXCEEDED');
        expect(result.error).toContain('exceeds maximum');
      }
    });

    it('should use default max size when not specified', () => {
      const result = validateBase64Image(VALID_PNG_BASE64);

      expect(result.valid).toBe(true);
      // Default is 5MB, our test image is tiny
    });
  });

  describe('Magic byte detection', () => {
    it('should detect PNG from magic bytes', () => {
      // Raw base64 without MIME type
      const result = validateBase64Image(VALID_PNG_BASE64);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.info.mimeType).toBe('image/png');
      }
    });

    it('should detect JPEG from magic bytes', () => {
      const result = validateBase64Image(VALID_JPEG_BASE64);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.info.mimeType).toBe('image/jpeg');
      }
    });

    it('should detect GIF from magic bytes', () => {
      const result = validateBase64Image(VALID_GIF_BASE64);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.info.mimeType).toBe('image/gif');
      }
    });

    it('should detect WebP from magic bytes', () => {
      const result = validateBase64Image(VALID_WEBP_BASE64);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.info.mimeType).toBe('image/webp');
      }
    });

    it('should use actual magic bytes over declared MIME type', () => {
      // Declare as JPEG but data is PNG
      const input = `data:image/jpeg;base64,${VALID_PNG_BASE64}`;
      const result = validateBase64Image(input);

      expect(result.valid).toBe(true);
      if (result.valid) {
        // Should detect actual type from magic bytes
        expect(result.info.mimeType).toBe('image/png');
      }
    });
  });
});

describe('Utility functions', () => {
  describe('stripDataUriPrefix', () => {
    it('should strip data URI prefix', () => {
      const input = `data:image/png;base64,${VALID_PNG_BASE64}`;
      const result = stripDataUriPrefix(input);

      expect(result).toBe(VALID_PNG_BASE64);
    });

    it('should return raw base64 unchanged', () => {
      const result = stripDataUriPrefix(VALID_PNG_BASE64);

      expect(result).toBe(VALID_PNG_BASE64);
    });
  });

  describe('createDataUri', () => {
    it('should create valid data URI', () => {
      const result = createDataUri(VALID_PNG_BASE64, 'image/png');

      expect(result).toBe(`data:image/png;base64,${VALID_PNG_BASE64}`);
    });
  });

  describe('estimateBase64Size', () => {
    it('should estimate size correctly', () => {
      // Known size: the PNG is about 95 bytes decoded
      const estimated = estimateBase64Size(VALID_PNG_BASE64);

      expect(estimated).toBeGreaterThan(50);
      expect(estimated).toBeLessThan(150);
    });

    it('should handle data URI input', () => {
      const input = `data:image/png;base64,${VALID_PNG_BASE64}`;
      const estimated = estimateBase64Size(input);

      expect(estimated).toBeGreaterThan(50);
    });
  });
});

describe('Constants', () => {
  it('should have correct allowed MIME types', () => {
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(ALLOWED_MIME_TYPES).toContain('image/png');
    expect(ALLOWED_MIME_TYPES).toContain('image/gif');
    expect(ALLOWED_MIME_TYPES).toContain('image/webp');
    expect(ALLOWED_MIME_TYPES.length).toBe(4);
  });

  it('should have reasonable default max size', () => {
    // 5MB
    expect(DEFAULT_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });
});
