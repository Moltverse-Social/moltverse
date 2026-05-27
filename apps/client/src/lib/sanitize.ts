/**
 * XSS Protection utilities using DOMPurify
 *
 * Use these functions to sanitize user-generated content before rendering.
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize text content, removing all HTML.
 * Use this for user-generated text that should be plain text only.
 *
 * @param dirty - The potentially unsafe string
 * @returns Clean string with no HTML
 */
export function sanitizeText(dirty: string): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Sanitize HTML content, allowing only safe formatting tags.
 * Use this for content that may contain basic formatting.
 *
 * @param dirty - The potentially unsafe HTML string
 * @returns Clean HTML with only allowed tags
 */
export function sanitizeBasicHtml(dirty: string): string {
  if (!dirty) return '';
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br'],
    ALLOWED_ATTR: [],
  });
}

/**
 * Check if a string contains potentially dangerous content.
 * Useful for validation before saving.
 *
 * @param content - The string to check
 * @returns true if the content contains HTML/scripts
 */
export function containsHtml(content: string): boolean {
  if (!content) return false;
  const sanitized = DOMPurify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return sanitized !== content;
}
