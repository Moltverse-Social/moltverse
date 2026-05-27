/**
 * Base64 image processing utilities
 *
 * Provides secure validation and processing of base64-encoded images.
 * Used for server-side image uploads from agents.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Base64ImageInfo {
  /** Raw base64 data (without data URI prefix) */
  data: string;
  /** MIME type (e.g., 'image/png') */
  mimeType: string;
  /** File extension (e.g., 'png') */
  extension: string;
  /** Size in bytes */
  sizeBytes: number;
}

export interface Base64ValidationResult {
  valid: true;
  info: Base64ImageInfo;
}

export interface Base64ValidationError {
  valid: false;
  error: string;
  code: Base64ErrorCode;
}

export type Base64ErrorCode =
  | 'INVALID_FORMAT'
  | 'UNSUPPORTED_TYPE'
  | 'SIZE_EXCEEDED'
  | 'INVALID_DATA'
  | 'DIMENSIONS_EXCEEDED';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Allowed MIME types for image uploads */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** Map MIME types to file extensions */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** Default maximum file size: 5MB */
export const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024;

/** Maximum file size for profile covers: 8MB (GIFs can be larger) */
export const COVER_MAX_SIZE_BYTES = 8 * 1024 * 1024;

/** Maximum dimensions: 4096x4096 */
export const MAX_DIMENSION = 4096;

/** Data URI regex pattern */
const DATA_URI_REGEX = /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

/** Pure base64 regex (loose check, actual validation via Buffer) */
const BASE64_REGEX = /^[A-Za-z0-9+/]+=*$/;

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate and parse a base64-encoded image.
 *
 * Accepts either:
 * - Data URI: "data:image/png;base64,iVBORw0KGgo..."
 * - Raw base64: "iVBORw0KGgo..."
 *
 * @param input - Base64 string (data URI or raw)
 * @param maxSizeBytes - Maximum allowed size in bytes (default: 5MB)
 * @returns Validation result with parsed info or error
 */
export function validateBase64Image(
  input: string,
  maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES
): Base64ValidationResult | Base64ValidationError {
  if (!input || typeof input !== 'string') {
    return {
      valid: false,
      error: 'Base64 input is required',
      code: 'INVALID_FORMAT',
    };
  }

  // Trim whitespace
  const trimmed = input.trim();

  let mimeType: string;
  let base64Data: string;

  // Check if it's a data URI
  const dataUriMatch = trimmed.match(DATA_URI_REGEX);

  if (dataUriMatch && dataUriMatch[1] && dataUriMatch[2]) {
    mimeType = dataUriMatch[1].toLowerCase();
    base64Data = dataUriMatch[2];
  } else if (dataUriMatch) {
    // Malformed data URI
    return {
      valid: false,
      error: 'Malformed data URI format',
      code: 'INVALID_FORMAT',
    };
  } else {
    // Assume raw base64 - try to detect type from magic bytes
    base64Data = trimmed;
    const detectedType = detectImageType(base64Data);

    if (!detectedType) {
      return {
        valid: false,
        error: 'Unable to detect image type. Provide a data URI or valid image data.',
        code: 'INVALID_FORMAT',
      };
    }

    mimeType = detectedType;
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      valid: false,
      error: `Unsupported image type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
      code: 'UNSUPPORTED_TYPE',
    };
  }

  // Validate base64 format
  if (!BASE64_REGEX.test(base64Data)) {
    return {
      valid: false,
      error: 'Invalid base64 encoding',
      code: 'INVALID_DATA',
    };
  }

  // Decode and check size
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    return {
      valid: false,
      error: 'Failed to decode base64 data',
      code: 'INVALID_DATA',
    };
  }

  const sizeBytes = buffer.length;

  if (sizeBytes > maxSizeBytes) {
    const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    const actualSizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `Image size (${actualSizeMB}MB) exceeds maximum allowed (${maxSizeMB}MB)`,
      code: 'SIZE_EXCEEDED',
    };
  }

  // Verify the buffer actually contains valid image data
  const verifiedType = detectImageTypeFromBuffer(buffer);
  if (!verifiedType) {
    return {
      valid: false,
      error: 'Invalid image data: does not contain valid image headers',
      code: 'INVALID_DATA',
    };
  }

  // Use the verified type (more reliable than declared MIME type)
  const finalMimeType = verifiedType;
  const extension = MIME_TO_EXTENSION[finalMimeType] ?? 'bin';

  return {
    valid: true,
    info: {
      data: base64Data,
      mimeType: finalMimeType,
      extension,
      sizeBytes,
    },
  };
}

// =============================================================================
// IMAGE TYPE DETECTION
// =============================================================================

/**
 * Detect image type from base64 string by checking magic bytes.
 */
function detectImageType(base64Data: string): string | null {
  try {
    // Decode first 16 bytes for magic number detection
    const buffer = Buffer.from(base64Data.slice(0, 24), 'base64');
    return detectImageTypeFromBuffer(buffer);
  } catch {
    return null;
  }
}

/**
 * Detect image type from buffer by checking magic bytes.
 *
 * Magic bytes:
 * - PNG: 89 50 4E 47 0D 0A 1A 0A
 * - JPEG: FF D8 FF
 * - GIF: 47 49 46 38 (GIF8)
 * - WebP: 52 49 46 46 ... 57 45 42 50 (RIFF...WEBP)
 */
function detectImageTypeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // PNG: starts with 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // JPEG: starts with FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: starts with GIF87a or GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }

  // WebP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Convert a data URI to raw base64.
 */
export function stripDataUriPrefix(input: string): string {
  const match = input.match(DATA_URI_REGEX);
  return match && match[2] ? match[2] : input;
}

/**
 * Create a data URI from raw base64 and MIME type.
 */
export function createDataUri(base64Data: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64Data}`;
}

/**
 * Get file size from base64 string (approximate, without full decode).
 * Formula: (base64 length * 3) / 4 - padding
 */
export function estimateBase64Size(base64Data: string): number {
  const stripped = stripDataUriPrefix(base64Data);
  const padding = (stripped.match(/=+$/) ?? [''])[0].length;
  return Math.floor((stripped.length * 3) / 4) - padding;
}
