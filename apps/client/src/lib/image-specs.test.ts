/**
 * Tests for image-specs.ts
 */

import { describe, it, expect } from 'vitest';
import {
  IMAGE_SPECS,
  getImageSpec,
  formatFileSize,
  getCloudinaryTransformation,
  type ImagePreset,
} from './image-specs';

describe('IMAGE_SPECS', () => {
  const presets: ImagePreset[] = ['profile', 'cover', 'cluster', 'photo', 'event'];

  it('should have all required presets', () => {
    presets.forEach((preset) => {
      expect(IMAGE_SPECS[preset]).toBeDefined();
    });
  });

  it('should have valid maxSizeBytes for each preset', () => {
    presets.forEach((preset) => {
      const spec = IMAGE_SPECS[preset];
      expect(spec.maxSizeBytes).toBeGreaterThan(0);
      expect(spec.maxSizeMB).toBe(spec.maxSizeBytes / (1024 * 1024));
    });
  });

  it('should have valid dimensions for each preset', () => {
    presets.forEach((preset) => {
      const spec = IMAGE_SPECS[preset];
      expect(spec.width).toBeGreaterThan(0);
      expect(spec.height).toBeGreaterThan(0);
      expect(spec.minWidth).toBeGreaterThan(0);
      expect(spec.minHeight).toBeGreaterThan(0);
      expect(spec.minWidth).toBeLessThanOrEqual(spec.width);
      expect(spec.minHeight).toBeLessThanOrEqual(spec.height);
    });
  });

  it('should have valid Cloudinary folders', () => {
    presets.forEach((preset) => {
      const spec = IMAGE_SPECS[preset];
      expect(spec.folder).toMatch(/^moltverse\//);
    });
  });

  it('should have valid accept strings', () => {
    presets.forEach((preset) => {
      const spec = IMAGE_SPECS[preset];
      expect(spec.accept).toMatch(/^image\//);
      expect(spec.acceptedTypes.length).toBeGreaterThan(0);
    });
  });
});

describe('getImageSpec', () => {
  it('should return the correct spec for each preset', () => {
    expect(getImageSpec('profile')).toBe(IMAGE_SPECS.profile);
    expect(getImageSpec('cover')).toBe(IMAGE_SPECS.cover);
    expect(getImageSpec('cluster')).toBe(IMAGE_SPECS.cluster);
    expect(getImageSpec('photo')).toBe(IMAGE_SPECS.photo);
    expect(getImageSpec('event')).toBe(IMAGE_SPECS.event);
  });
});

describe('formatFileSize', () => {
  it('should format bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500B');
  });

  it('should format kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1.0KB');
    expect(formatFileSize(1536)).toBe('1.5KB');
  });

  it('should format megabytes correctly', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0MB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5MB');
  });
});

describe('getCloudinaryTransformation', () => {
  it('should return transformation string for profile', () => {
    const transform = getCloudinaryTransformation('profile');
    expect(transform).toContain('w_400');
    expect(transform).toContain('h_400');
    expect(transform).toContain('c_fill');
  });

  it('should return transformation string for cover', () => {
    const transform = getCloudinaryTransformation('cover');
    expect(transform).toContain('w_1200');
    expect(transform).toContain('h_160');
    expect(transform).toContain('c_fill');
  });

  it('should return transformation string for photo', () => {
    const transform = getCloudinaryTransformation('photo');
    expect(transform).toContain('c_limit');
    expect(transform).toContain('w_1920');
  });
});

describe('Preset specifications', () => {
  describe('profile', () => {
    const spec = IMAGE_SPECS.profile;

    it('should be 400x400px square', () => {
      expect(spec.width).toBe(400);
      expect(spec.height).toBe(400);
      expect(spec.aspectRatio).toBe(1);
    });

    it('should have 500KB max size', () => {
      expect(spec.maxSizeBytes).toBe(512 * 1024);
    });

    it('should not allow GIFs', () => {
      expect(spec.allowGif).toBe(false);
      expect(spec.acceptedTypes).not.toContain('image/gif');
    });
  });

  describe('cover', () => {
    const spec = IMAGE_SPECS.cover;

    it('should be 1200x160px', () => {
      expect(spec.width).toBe(1200);
      expect(spec.height).toBe(160);
      expect(spec.aspectRatio).toBe(7.5);
    });

    it('should have 2MB max size', () => {
      expect(spec.maxSizeBytes).toBe(2 * 1024 * 1024);
    });

    it('should allow GIFs', () => {
      expect(spec.allowGif).toBe(true);
      expect(spec.acceptedTypes).toContain('image/gif');
    });
  });

  describe('cluster', () => {
    const spec = IMAGE_SPECS.cluster;

    it('should be 400x400px square', () => {
      expect(spec.width).toBe(400);
      expect(spec.height).toBe(400);
      expect(spec.aspectRatio).toBe(1);
    });

    it('should have 500KB max size', () => {
      expect(spec.maxSizeBytes).toBe(512 * 1024);
    });
  });

  describe('photo', () => {
    const spec = IMAGE_SPECS.photo;

    it('should have no aspect ratio restriction', () => {
      expect(spec.aspectRatio).toBe(0);
    });

    it('should have 5MB max size', () => {
      expect(spec.maxSizeBytes).toBe(5 * 1024 * 1024);
    });

    it('should allow GIFs', () => {
      expect(spec.allowGif).toBe(true);
    });
  });

  describe('event', () => {
    const spec = IMAGE_SPECS.event;

    it('should be 800x400px (2:1)', () => {
      expect(spec.width).toBe(800);
      expect(spec.height).toBe(400);
      expect(spec.aspectRatio).toBe(2);
    });

    it('should have 1MB max size', () => {
      expect(spec.maxSizeBytes).toBe(1024 * 1024);
    });
  });
});
