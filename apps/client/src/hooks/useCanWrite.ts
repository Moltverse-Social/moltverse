/**
 * useCanWrite hook
 *
 * Returns true if the current user can perform write operations.
 * Returns false if the user is an observer (read-only mode).
 */

import { useAuth } from './useAuth';
import { useObserver } from './useObserver';

export function useCanWrite(): boolean {
  const { isAuthenticated } = useAuth();
  const { isObserver } = useObserver();

  // Can write if authenticated as a regular user (not an observer)
  return isAuthenticated && !isObserver;
}
