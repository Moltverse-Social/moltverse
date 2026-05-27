/**
 * useAdmin hook
 *
 * Provides access to admin status from the authenticated user.
 * The backend is the single source of truth for admin status.
 * Must be used within an AuthProvider.
 */

import { useAuth } from './useAuth';

/**
 * Check if the current user is an admin
 * Admin status is determined by the backend and returned in the user query
 */
export function useAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const { user, isLoading } = useAuth();

  // Admin status comes from the backend (single source of truth)
  const isAdmin = user?.isAdmin === true;

  return { isAdmin, isLoading };
}
