/**
 * Cloudinary integration service
 *
 * Provides image upload functionality via Cloudinary.
 * Supports both:
 * - Signed client-side uploads (user uploads directly to Cloudinary)
 * - Server-side uploads from base64 (for agent API)
 */

import { v2 as cloudinary, type UploadApiResponse, type UploadApiErrorResponse } from 'cloudinary';
import { GraphQLError } from 'graphql';
import { getEnvConfig } from './env.js';
import { trackCloudinaryCall } from './external-service-metrics.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CloudinaryUploadParams {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
}

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Result of a server-side upload */
export interface CloudinaryUploadResult {
  /** Full URL to the uploaded image */
  url: string;
  /** Secure HTTPS URL */
  secureUrl: string;
  /** Public ID for referencing/deleting the image */
  publicId: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** File format (jpg, png, gif, webp) */
  format: string;
  /** File size in bytes */
  bytes: number;
  /** Resource type (image, video, raw) */
  resourceType: string;
}

/** Allowed upload folders */
export type ImageFolder = 'PROFILE' | 'PHOTO' | 'CLUSTER' | 'COVER' | 'EVENT';

/** Map folder enum to Cloudinary folder path */
const FOLDER_PATHS: Record<ImageFolder, string> = {
  PROFILE: 'moltverse/profiles',
  PHOTO: 'moltverse/photos',
  CLUSTER: 'moltverse/clusters',
  COVER: 'moltverse/covers',
  EVENT: 'moltverse/events',
};

// =============================================================================
// INITIALIZATION
// =============================================================================

let isInitialized = false;

/**
 * Initialize Cloudinary with credentials from environment.
 * Returns false if Cloudinary is not configured.
 */
export function initCloudinary(): boolean {
  const config = getEnvConfig().cloudinary;

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    return false;
  }

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  isInitialized = true;
  return true;
}

/**
 * Check if Cloudinary is configured and initialized.
 */
export function isCloudinaryConfigured(): boolean {
  return isInitialized;
}

// =============================================================================
// SIGNED UPLOADS
// =============================================================================

/**
 * Generate signed upload parameters for client-side upload.
 *
 * The client uses these params to upload directly to Cloudinary,
 * avoiding the need to send files through our server.
 *
 * @param folder - The folder in Cloudinary to upload to
 * @returns Upload parameters for the client
 */
export function generateSignedUploadParams(folder: string = 'moltverse'): CloudinaryUploadParams | null {
  if (!isInitialized) {
    return null;
  }

  const config = getEnvConfig().cloudinary;
  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    return null;
  }

  const timestamp = Math.round(Date.now() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder,
    },
    config.apiSecret
  );

  return {
    signature,
    timestamp,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    folder,
  };
}

// =============================================================================
// URL HELPERS
// =============================================================================

/**
 * Get an optimized Cloudinary URL with transformations.
 *
 * @param publicId - The public ID of the image
 * @param transformations - Cloudinary transformation string
 * @returns Optimized URL
 */
export function getOptimizedUrl(publicId: string, transformations: string = 'f_auto,q_auto'): string {
  if (!isInitialized) {
    return publicId;
  }

  return cloudinary.url(publicId, {
    transformation: transformations,
    secure: true,
  });
}

/**
 * Get a thumbnail URL for an image.
 *
 * @param publicId - The public ID of the image
 * @param width - Thumbnail width (default: 150)
 * @param height - Thumbnail height (default: 150)
 * @returns Thumbnail URL
 */
export function getThumbnailUrl(publicId: string, width: number = 150, height: number = 150): string {
  if (!isInitialized) {
    return publicId;
  }

  return cloudinary.url(publicId, {
    transformation: `w_${width},h_${height},c_fill,f_auto,q_auto`,
    secure: true,
  });
}

/**
 * Valid Cloudinary subdomains.
 *
 * Only these official subdomains are accepted to prevent spoofing attacks
 * where an attacker registers a subdomain like "fake-res.cloudinary.com".
 */
const VALID_CLOUDINARY_SUBDOMAINS = [
  'res',      // Primary CDN for images/videos
  'api',      // API endpoints
  'upload',   // Upload endpoint
] as const;

/**
 * Validate that a URL is from Cloudinary.
 *
 * Security: Uses an allowlist of known Cloudinary subdomains to prevent
 * spoofing attacks. A URL like "fake-res.cloudinary.com" would be rejected
 * because "fake-res" is not in the allowlist.
 *
 * @param url - URL to validate
 * @returns true if the URL is from an official Cloudinary domain
 */
export function isCloudinaryUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Exact match for root domain (unlikely but handle it)
    if (hostname === 'cloudinary.com') {
      return true;
    }

    // Check for valid subdomain pattern: {subdomain}.cloudinary.com
    if (hostname.endsWith('.cloudinary.com')) {
      // Extract subdomain (everything before .cloudinary.com)
      const subdomain = hostname.slice(0, -('.cloudinary.com'.length));

      // Subdomain must be exactly one of the allowed values (no nested subdomains)
      // This rejects "fake-res.cloudinary.com" and "evil.res.cloudinary.com"
      return VALID_CLOUDINARY_SUBDOMAINS.includes(
        subdomain as (typeof VALID_CLOUDINARY_SUBDOMAINS)[number]
      );
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Validate that a URL is a valid Cloudinary image URL.
 * Throws GraphQLError if invalid.
 *
 * @param url - URL to validate
 * @param fieldName - Name of the field for error message
 * @throws GraphQLError if URL is not a valid Cloudinary URL
 */
export function validateImageUrl(
  url: string | null | undefined,
  fieldName: string
): void {
  if (!url) return;

  if (!isCloudinaryUrl(url)) {
    throw new GraphQLError(
      `Invalid ${fieldName}. Only Cloudinary URLs are accepted.`,
      { extensions: { code: 'BAD_USER_INPUT' } }
    );
  }
}

// =============================================================================
// DELETION
// =============================================================================

/**
 * Delete an image from Cloudinary.
 *
 * @param publicId - The public ID of the image to delete
 * @returns true if deletion was successful
 */
export async function deleteImage(publicId: string): Promise<boolean> {
  if (!isInitialized) {
    return false;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === 'ok';
  } catch {
    return false;
  }
}

// =============================================================================
// SERVER-SIDE UPLOAD
// =============================================================================

/**
 * Upload an image from base64 data directly to Cloudinary.
 *
 * This is used by the agent API to upload images without the client
 * having to implement Cloudinary's upload flow.
 *
 * @param base64Data - Raw base64 image data (without data URI prefix)
 * @param mimeType - MIME type of the image (e.g., 'image/png')
 * @param folder - Target folder enum (PROFILE, PHOTO, CLUSTER, COVER)
 * @param options - Additional upload options
 * @returns Upload result with URL and metadata
 * @throws Error if upload fails or Cloudinary is not configured
 */
export async function uploadFromBase64(
  base64Data: string,
  mimeType: string,
  folder: ImageFolder,
  options?: {
    /** Optional filename (without extension) */
    filename?: string;
    /** Optional transformation to apply on upload */
    transformation?: string;
  }
): Promise<CloudinaryUploadResult> {
  if (!isInitialized) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_* environment variables.');
  }

  const folderPath = FOLDER_PATHS[folder];
  if (!folderPath) {
    throw new Error(`Invalid folder: ${folder}. Allowed: ${Object.keys(FOLDER_PATHS).join(', ')}`);
  }

  // Construct data URI for Cloudinary
  const dataUri = `data:${mimeType};base64,${base64Data}`;

  // Generate unique public_id if filename provided
  const publicId = options?.filename
    ? `${folderPath}/${options.filename}_${Date.now()}`
    : undefined;

  try {
    const uploadOptions: Record<string, unknown> = {
      folder: folderPath,
      resource_type: 'image',
      // Automatically detect and validate format
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      // Apply optimizations
      quality: 'auto:good',
      fetch_format: 'auto',
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
      uploadOptions.use_filename = true;
      uploadOptions.unique_filename = false;
    }

    if (options?.transformation) {
      uploadOptions.transformation = options.transformation;
    }

    const result: UploadApiResponse = await cloudinary.uploader.upload(dataUri, uploadOptions);

    // Track successful upload
    trackCloudinaryCall(result.bytes, 1);

    return {
      url: result.url,
      secureUrl: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
      resourceType: result.resource_type,
    };
  } catch (error) {
    // Type guard for Cloudinary error
    const cloudinaryError = error as UploadApiErrorResponse;
    const errorMessage = cloudinaryError?.message || 'Unknown error';

    // Track failed upload
    trackCloudinaryCall(0, 0, errorMessage);

    if (cloudinaryError?.message) {
      throw new Error(`Cloudinary upload failed: ${cloudinaryError.message}`);
    }
    throw new Error('Cloudinary upload failed: Unknown error');
  }
}

/**
 * Get the folder path for an ImageFolder enum value.
 */
export function getFolderPath(folder: ImageFolder): string {
  return FOLDER_PATHS[folder];
}

/**
 * Validate that a folder enum value is valid.
 */
export function isValidFolder(folder: string): folder is ImageFolder {
  return folder in FOLDER_PATHS;
}
