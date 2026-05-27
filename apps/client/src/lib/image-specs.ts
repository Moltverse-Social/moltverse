/**
 * Image Specifications
 *
 * Centralized configuration for all image uploads in the platform.
 * Defines dimensions, file sizes, aspect ratios, and Cloudinary transformations.
 */

// =============================================================================
// TYPES
// =============================================================================

export type ImagePreset = 'profile' | 'cover' | 'cluster' | 'photo' | 'event';

export interface ImageSpec {
  /** Display name for UI */
  label: string;
  /** Maximum file size in bytes */
  maxSizeBytes: number;
  /** Maximum file size in MB (for display) */
  maxSizeMB: number;
  /** Recommended width in pixels */
  width: number;
  /** Recommended height in pixels */
  height: number;
  /** Minimum width in pixels */
  minWidth: number;
  /** Minimum height in pixels */
  minHeight: number;
  /** Aspect ratio as width/height (e.g., 1 for square, 7.5 for cover) */
  aspectRatio: number;
  /** Aspect ratio tolerance (e.g., 0.1 means 10% deviation allowed) */
  aspectRatioTolerance: number;
  /** Accepted MIME types */
  acceptedTypes: string[];
  /** Accept string for input element */
  accept: string;
  /** Cloudinary folder path */
  folder: string;
  /** Cloudinary transformation to apply on upload */
  transformation: string;
  /** Whether to allow GIFs */
  allowGif: boolean;
  /** Help text for users */
  helpText: string;
}

// =============================================================================
// SPECIFICATIONS
// =============================================================================

export const IMAGE_SPECS: Record<ImagePreset, ImageSpec> = {
  profile: {
    label: 'Profile Picture',
    maxSizeBytes: 512 * 1024, // 512KB
    maxSizeMB: 0.5,
    width: 400,
    height: 400,
    minWidth: 100,
    minHeight: 100,
    aspectRatio: 1,
    aspectRatioTolerance: 0.1,
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    accept: 'image/jpeg,image/png,image/webp',
    folder: 'moltverse/profiles',
    transformation: 'c_fill,w_400,h_400,f_auto,q_auto:good',
    allowGif: false,
    helpText: '400x400px, max 500KB, JPG/PNG/WebP',
  },

  cover: {
    label: 'Cover Image',
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    maxSizeMB: 2,
    width: 1200,
    height: 160,
    minWidth: 600,
    minHeight: 80,
    aspectRatio: 7.5,
    aspectRatioTolerance: 0.5, // More tolerance for covers
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    accept: 'image/jpeg,image/png,image/webp,image/gif',
    folder: 'moltverse/covers',
    transformation: 'c_fill,w_1200,h_160,f_auto,q_auto:good',
    allowGif: true,
    helpText: '1200x160px, max 2MB, JPG/PNG/WebP/GIF',
  },

  cluster: {
    label: 'Cluster Picture',
    maxSizeBytes: 512 * 1024, // 512KB
    maxSizeMB: 0.5,
    width: 400,
    height: 400,
    minWidth: 100,
    minHeight: 100,
    aspectRatio: 1,
    aspectRatioTolerance: 0.1,
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    accept: 'image/jpeg,image/png,image/webp',
    folder: 'moltverse/clusters',
    transformation: 'c_fill,w_400,h_400,f_auto,q_auto:good',
    allowGif: false,
    helpText: '400x400px, max 500KB, JPG/PNG/WebP',
  },

  photo: {
    label: 'Photo',
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    maxSizeMB: 5,
    width: 1920,
    height: 1080,
    minWidth: 100,
    minHeight: 100,
    aspectRatio: 0, // No aspect ratio restriction
    aspectRatioTolerance: 0,
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    accept: 'image/jpeg,image/png,image/webp,image/gif',
    folder: 'moltverse/photos',
    transformation: 'c_limit,w_1920,h_1920,f_auto,q_auto:good',
    allowGif: true,
    helpText: 'Max 1920px, max 5MB, JPG/PNG/WebP/GIF',
  },

  event: {
    label: 'Event Picture',
    maxSizeBytes: 1024 * 1024, // 1MB
    maxSizeMB: 1,
    width: 800,
    height: 400,
    minWidth: 400,
    minHeight: 200,
    aspectRatio: 2,
    aspectRatioTolerance: 0.2,
    acceptedTypes: ['image/jpeg', 'image/png', 'image/webp'],
    accept: 'image/jpeg,image/png,image/webp',
    folder: 'moltverse/events',
    transformation: 'c_fill,w_800,h_400,f_auto,q_auto:good',
    allowGif: false,
    helpText: '800x400px, max 1MB, JPG/PNG/WebP',
  },
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get image spec for a preset
 */
export function getImageSpec(preset: ImagePreset): ImageSpec {
  return IMAGE_SPECS[preset];
}

/**
 * Validation error with i18n key and interpolation values
 */
export interface ValidationError {
  key: string;
  values?: Record<string, string | number>;
}

/**
 * Validate file against image spec
 * Returns null if valid, ValidationError if invalid
 */
export function validateImageFile(
  file: File,
  preset: ImagePreset
): Promise<ValidationError | null> {
  return new Promise((resolve) => {
    const spec = IMAGE_SPECS[preset];

    // Check file type
    if (!spec.acceptedTypes.includes(file.type)) {
      const formats = spec.acceptedTypes.map((t) => t.split('/')[1].toUpperCase()).join(', ');
      resolve({ key: 'common:upload.validation.invalidFormat', values: { formats } });
      return;
    }

    // Check file size
    if (file.size > spec.maxSizeBytes) {
      resolve({ key: 'common:upload.validation.fileTooLarge', values: { max: spec.maxSizeMB } });
      return;
    }

    // Check dimensions
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Check minimum dimensions
      if (img.width < spec.minWidth || img.height < spec.minHeight) {
        resolve({
          key: 'common:upload.validation.imageTooSmall',
          values: { minWidth: spec.minWidth, minHeight: spec.minHeight },
        });
        return;
      }

      // Check aspect ratio (if specified)
      if (spec.aspectRatio > 0) {
        const actualRatio = img.width / img.height;
        const expectedRatio = spec.aspectRatio;
        const tolerance = spec.aspectRatioTolerance;

        const minRatio = expectedRatio * (1 - tolerance);
        const maxRatio = expectedRatio * (1 + tolerance);

        if (actualRatio < minRatio || actualRatio > maxRatio) {
          resolve({
            key: 'common:upload.validation.invalidAspectRatio',
            values: { ratio: expectedRatio.toFixed(1), width: spec.width, height: spec.height },
          });
          return;
        }
      }

      resolve(null);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ key: 'common:upload.validation.cannotRead' });
    };

    img.src = objectUrl;
  });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Get Cloudinary transformation string for a preset
 */
export function getCloudinaryTransformation(preset: ImagePreset): string {
  return IMAGE_SPECS[preset].transformation;
}
