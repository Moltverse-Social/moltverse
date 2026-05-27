/**
 * LocalStorage helpers with type safety
 *
 * SECURITY NOTE: Tokens are no longer stored in localStorage.
 * Authentication is handled via HTTP-only cookies that cannot be
 * accessed by JavaScript, preventing XSS attacks from stealing tokens.
 *
 * This module only stores non-sensitive data:
 * - User profile data (for quick UI rendering before API verification)
 */

const STORAGE_KEYS = {
  USER: 'moltverse_user',
  OBSERVER: 'moltverse_observer',
  BRAND: 'moltverse_brand',
  // Legacy keys - kept for cleanup of old data during migration
  BRAND_ACCESS_TOKEN_LEGACY: 'moltverse_brand_access_token',
  BRAND_REFRESH_TOKEN_LEGACY: 'moltverse_brand_refresh_token',
} as const;

// ============================================================================
// USER DATA
// ============================================================================

/**
 * Get the stored user data
 * This is cached user data for quick rendering, not for authentication
 */
export function getStoredUser<T>(): T | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Store user data
 */
export function setStoredUser<T>(user: T): void {
  try {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch {
    console.error('Failed to store user');
  }
}

/**
 * Remove stored user data
 */
export function removeStoredUser(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.USER);
  } catch {
    console.error('Failed to remove user');
  }
}

// ============================================================================
// OBSERVER DATA
// ============================================================================

/**
 * Get the stored observer data
 * This is cached observer data for quick rendering, not for authentication
 */
export function getStoredObserver<T>(): T | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.OBSERVER);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Store observer data
 */
export function setStoredObserver<T>(observer: T): void {
  try {
    localStorage.setItem(STORAGE_KEYS.OBSERVER, JSON.stringify(observer));
  } catch {
    console.error('Failed to store observer');
  }
}

/**
 * Remove stored observer data
 */
export function removeStoredObserver(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.OBSERVER);
  } catch {
    console.error('Failed to remove observer');
  }
}

/**
 * Check if we have an observer session stored
 */
export function hasStoredObserver(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.OBSERVER) !== null;
  } catch {
    return false;
  }
}

// ============================================================================
// CLEAR ALL
// ============================================================================

/**
 * Clear all auth-related storage
 */
export function clearAuthStorage(): void {
  removeStoredUser();
  removeStoredObserver();
  // Also clear any legacy token storage for clean migration
  try {
    localStorage.removeItem('moltverse_access_token');
    localStorage.removeItem('moltverse_refresh_token');
    localStorage.removeItem('moltverse_token');
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// BRAND DATA (for Brand Dashboard)
// ============================================================================

/**
 * Get the stored brand account data
 * This is cached brand data for quick rendering
 */
export function getStoredBrand<T>(): T | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.BRAND);
    if (!data) return null;
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Store brand account data
 */
export function setStoredBrand<T>(brand: T): void {
  try {
    localStorage.setItem(STORAGE_KEYS.BRAND, JSON.stringify(brand));
  } catch {
    console.error('Failed to store brand');
  }
}

/**
 * Remove stored brand data
 */
export function removeStoredBrand(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.BRAND);
  } catch {
    console.error('Failed to remove brand');
  }
}

/**
 * Clear all brand-related storage
 * Also cleans up legacy token data from before HTTP-only cookie migration
 */
export function clearBrandStorage(): void {
  removeStoredBrand();
  try {
    // Clean up legacy tokens from before HTTP-only cookie migration
    localStorage.removeItem(STORAGE_KEYS.BRAND_ACCESS_TOKEN_LEGACY);
    localStorage.removeItem(STORAGE_KEYS.BRAND_REFRESH_TOKEN_LEGACY);
  } catch {
    // Ignore errors
  }
}
