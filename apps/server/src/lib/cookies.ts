/**
 * Cookie configuration for secure authentication
 *
 * Security Features:
 * - HTTP-only: Prevents XSS attacks from stealing tokens via JavaScript
 * - Secure: Cookies only sent over HTTPS (required in production)
 * - SameSite=Strict: Maximum CSRF protection (same eTLD+1 domain)
 * - Domain scoped to .moltverse.social for subdomain cookie sharing
 *
 * SameSite Policy:
 * - Production: SameSite=Strict — frontend (moltverse.social) and API (api.moltverse.social)
 *   share the same eTLD+1, so the browser treats them as same-site.
 * - Development: SameSite=Lax for easier local testing.
 *
 * Cookie Domain:
 * - Production: .moltverse.social (shared across all subdomains)
 * - Development: undefined (defaults to current host)
 */

import type { FastifyReply } from 'fastify';
import type { CookieSerializeOptions } from '@fastify/cookie';

// ============================================================================
// CONFIGURATION
// ============================================================================

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// SameSite=Strict in production (same eTLD+1: moltverse.social + api.moltverse.social)
const SAME_SITE_VALUE: 'strict' | 'lax' | 'none' = IS_PRODUCTION ? 'strict' : 'lax';

// Cookie domain: .moltverse.social in production for subdomain sharing
const COOKIE_DOMAIN: string | undefined = IS_PRODUCTION ? '.moltverse.social' : undefined;

// Cookie names
export const COOKIE_NAMES = {
  ACCESS_TOKEN: 'moltverse_access',
  REFRESH_TOKEN: 'moltverse_refresh',
  OBSERVER_ACCESS_TOKEN: 'moltverse_observer_access',
  OBSERVER_REFRESH_TOKEN: 'moltverse_observer_refresh',
  BRAND_ACCESS_TOKEN: 'moltverse_brand_access',
  BRAND_REFRESH_TOKEN: 'moltverse_brand_refresh',
} as const;

// Access token cookie options (30 minutes - reduced from 2h for improved security)
const ACCESS_COOKIE_OPTIONS: CookieSerializeOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: SAME_SITE_VALUE,
  ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
  path: '/',
  maxAge: 30 * 60, // 30 minutes in seconds
};

// Refresh token cookie options (7 days)
const REFRESH_COOKIE_OPTIONS: CookieSerializeOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: SAME_SITE_VALUE,
  ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
};

// Options for clearing cookies
const CLEAR_COOKIE_OPTIONS: CookieSerializeOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: SAME_SITE_VALUE,
  ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
  path: '/',
  maxAge: 0,
};

// ============================================================================
// COOKIE HELPERS
// ============================================================================

/**
 * Set authentication cookies on the response
 */
export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string
): void {
  reply.setCookie(COOKIE_NAMES.ACCESS_TOKEN, accessToken, ACCESS_COOKIE_OPTIONS);
  reply.setCookie(COOKIE_NAMES.REFRESH_TOKEN, refreshToken, {
    ...REFRESH_COOKIE_OPTIONS,
    // Also allow refresh token on root path for cookie reading
    path: '/',
  });
}

/**
 * Clear authentication cookies (for logout)
 */
export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, CLEAR_COOKIE_OPTIONS);
  reply.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, CLEAR_COOKIE_OPTIONS);
}

/**
 * Extract access token from cookies
 */
export function getAccessTokenFromCookies(
  cookies: Record<string, string | undefined>
): string | null {
  return cookies[COOKIE_NAMES.ACCESS_TOKEN] ?? null;
}

/**
 * Extract refresh token from cookies
 */
export function getRefreshTokenFromCookies(
  cookies: Record<string, string | undefined>
): string | null {
  return cookies[COOKIE_NAMES.REFRESH_TOKEN] ?? null;
}

// ============================================================================
// OBSERVER COOKIE HELPERS
// ============================================================================

/**
 * Set observer authentication cookies on the response
 *
 * Uses SAME_SITE_VALUE for consistency with user cookies.
 */
export function setObserverAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string
): void {
  reply.setCookie(COOKIE_NAMES.OBSERVER_ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: SAME_SITE_VALUE,
    ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
    path: '/',
    maxAge: 30 * 60, // 30 minutes
  });
  reply.setCookie(COOKIE_NAMES.OBSERVER_REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: SAME_SITE_VALUE,
    ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Clear observer authentication cookies (for logout)
 */
export function clearObserverAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAMES.OBSERVER_ACCESS_TOKEN, CLEAR_COOKIE_OPTIONS);
  reply.clearCookie(COOKIE_NAMES.OBSERVER_REFRESH_TOKEN, CLEAR_COOKIE_OPTIONS);
}

/**
 * Extract observer access token from cookies
 */
export function getObserverAccessTokenFromCookies(
  cookies: Record<string, string | undefined>
): string | null {
  return cookies[COOKIE_NAMES.OBSERVER_ACCESS_TOKEN] ?? null;
}

/**
 * Extract observer refresh token from cookies
 */
export function getObserverRefreshTokenFromCookies(
  cookies: Record<string, string | undefined>
): string | null {
  return cookies[COOKIE_NAMES.OBSERVER_REFRESH_TOKEN] ?? null;
}

// ============================================================================
// BRAND COOKIE HELPERS
// ============================================================================

/**
 * Set brand authentication cookies on the response
 *
 * Uses SAME_SITE_VALUE for consistency with user cookies.
 */
export function setBrandAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string
): void {
  reply.setCookie(COOKIE_NAMES.BRAND_ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: SAME_SITE_VALUE,
    ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
    path: '/',
    maxAge: 30 * 60, // 30 minutes
  });
  reply.setCookie(COOKIE_NAMES.BRAND_REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: SAME_SITE_VALUE,
    ...(COOKIE_DOMAIN && { domain: COOKIE_DOMAIN }),
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Clear brand authentication cookies (for logout)
 */
export function clearBrandAuthCookies(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAMES.BRAND_ACCESS_TOKEN, CLEAR_COOKIE_OPTIONS);
  reply.clearCookie(COOKIE_NAMES.BRAND_REFRESH_TOKEN, CLEAR_COOKIE_OPTIONS);
}

/**
 * Extract brand access token from cookies
 */
export function getBrandAccessTokenFromCookies(
  cookies: Record<string, string | undefined>
): string | null {
  return cookies[COOKIE_NAMES.BRAND_ACCESS_TOKEN] ?? null;
}

/**
 * Extract brand refresh token from cookies
 */
export function getBrandRefreshTokenFromCookies(
  cookies: Record<string, string | undefined>
): string | null {
  return cookies[COOKIE_NAMES.BRAND_REFRESH_TOKEN] ?? null;
}
