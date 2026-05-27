/**
 * Brand Auth Context
 *
 * @deprecated This context is deprecated. Brand accounts have been merged into
 * the User model with accountType='BUSINESS'. Authentication should now use
 * the standard User/Observer auth with accountType check. This file is kept
 * for backwards compatibility during migration of the campaign dashboard.
 *
 * Provides authentication state for brand accounts (advertisers).
 * Uses HTTP-only cookies for secure token storage (not localStorage).
 *
 * Separate from User/Observer auth systems.
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type {
  BrandAccount,
  BrandAuthContextValue,
  BrandRegisterInput,
} from '../types';
import {
  brandLogin as apiBrandLogin,
  brandRegister as apiBrandRegister,
  brandLogout as apiBrandLogout,
  brandRefresh as apiBrandRefresh,
  brandGetMe,
} from '../lib/brand-api';
import {
  getStoredBrand,
  setStoredBrand,
  clearBrandStorage,
} from '../lib/storage';

// =============================================================================
// CONTEXT
// =============================================================================

// Context with undefined default (must be used within provider)
export const BrandAuthContext = createContext<BrandAuthContextValue | undefined>(
  undefined
);

// =============================================================================
// PROVIDER
// =============================================================================

interface BrandAuthProviderProps {
  children: ReactNode;
}

export function BrandAuthProvider({ children }: BrandAuthProviderProps) {
  // Initialize brand from localStorage for quick rendering
  // Tokens are now in HTTP-only cookies (not accessible from JS)
  const [brand, setBrand] = useState<BrandAccount | null>(() =>
    getStoredBrand<BrandAccount>()
  );
  const [isLoading, setIsLoading] = useState(true);

  // Prevent concurrent refresh calls
  const isRefreshing = useRef(false);

  // Computed - brand present means authenticated (tokens in cookies)
  const isAuthenticated = Boolean(brand);

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Clear all auth state
   */
  const clearAuth = useCallback(() => {
    setBrand(null);
    clearBrandStorage();
  }, []);

  // ==========================================================================
  // REFRESH TOKEN
  // ==========================================================================

  /**
   * Refresh the access token using the refresh token cookie.
   * Returns true if successful, false otherwise.
   */
  const refreshAuth = useCallback(async (): Promise<boolean> => {
    if (isRefreshing.current) return false;

    isRefreshing.current = true;

    try {
      const result = await apiBrandRefresh();

      if (result?.success) {
        return true;
      }

      // Refresh failed, clear auth
      clearAuth();
      return false;
    } catch {
      clearAuth();
      return false;
    } finally {
      isRefreshing.current = false;
    }
  }, [clearAuth]);

  // ==========================================================================
  // VERIFY ON MOUNT
  // ==========================================================================

  useEffect(() => {
    const verifyAuth = async () => {
      // Try to get current brand profile (using cookie auth)
      try {
        const result = await brandGetMe();

        if (result) {
          setBrand(result.brand);
          setStoredBrand(result.brand);
          setIsLoading(false);
          return;
        }

        // Access token expired, try refresh
        const refreshed = await refreshAuth();

        if (refreshed) {
          // Retry getting profile with new token
          const retryResult = await brandGetMe();
          if (retryResult) {
            setBrand(retryResult.brand);
            setStoredBrand(retryResult.brand);
          } else {
            clearAuth();
          }
        } else {
          clearAuth();
        }
      } catch {
        clearAuth();
      } finally {
        setIsLoading(false);
      }
    };

    verifyAuth();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================================================
  // AUTH ACTIONS
  // ==========================================================================

  /**
   * Login brand account
   * Tokens are set as HTTP-only cookies by the server
   */
  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const result = await apiBrandLogin(email, password);

    setBrand(result.brand);
    setStoredBrand(result.brand);
  }, []);

  /**
   * Register brand account
   * Tokens are set as HTTP-only cookies by the server
   */
  const register = useCallback(async (data: BrandRegisterInput): Promise<void> => {
    const result = await apiBrandRegister(data);

    setBrand(result.brand);
    setStoredBrand(result.brand);
  }, []);

  /**
   * Logout brand account
   * Server will clear the HTTP-only cookies
   */
  const logout = useCallback(async (): Promise<void> => {
    await apiBrandLogout();
    clearAuth();
  }, [clearAuth]);

  /**
   * Update brand in state (after profile update)
   */
  const updateBrand = useCallback((updatedBrand: BrandAccount) => {
    setBrand(updatedBrand);
    setStoredBrand(updatedBrand);
  }, []);

  // ==========================================================================
  // CONTEXT VALUE
  // ==========================================================================

  const contextValue = useMemo<BrandAuthContextValue>(
    () => ({
      brand,
      isAuthenticated,
      isLoading,
      login,
      register,
      logout,
      refreshAuth,
      updateBrand,
    }),
    [
      brand,
      isAuthenticated,
      isLoading,
      login,
      register,
      logout,
      refreshAuth,
      updateBrand,
    ]
  );

  return (
    <BrandAuthContext.Provider value={contextValue}>
      {children}
    </BrandAuthContext.Provider>
  );
}
