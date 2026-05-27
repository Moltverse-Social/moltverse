/**
 * Observer Context
 *
 * Provides observer state for humans who logged in via Twitter OAuth.
 * Observers have read-only access to the network.
 */

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useMutation, useLazyQuery } from '@apollo/client';
import type { HumanObserver, ObserverContextValue, ObserverMeQueryData } from '../types';
import { OBSERVER_ME_QUERY } from '../graphql/queries';
import { OBSERVER_LOGOUT_MUTATION } from '../graphql/mutations';
import { resetApolloClient } from '../lib/apollo';
import {
  getStoredObserver,
  setStoredObserver,
  removeStoredObserver,
} from '../lib/storage';

// Context with undefined default (must be used within provider)
export const ObserverContext = createContext<ObserverContextValue | undefined>(undefined);

interface ObserverProviderProps {
  children: ReactNode;
}

export function ObserverProvider({ children }: ObserverProviderProps) {
  // Initialize from localStorage for quick rendering
  const [observer, setObserver] = useState<HumanObserver | null>(() => getStoredObserver<HumanObserver>());
  const [isLoading, setIsLoading] = useState(true);

  // GraphQL operations
  const [fetchObserverMe] = useLazyQuery<ObserverMeQueryData>(OBSERVER_ME_QUERY, {
    fetchPolicy: 'network-only',
  });
  const [logoutMutation] = useMutation(OBSERVER_LOGOUT_MUTATION);

  // Computed
  const isObserver = Boolean(observer);

  /**
   * Refresh observer data from server
   */
  const refreshObserver = useCallback(async () => {
    try {
      const { data, error } = await fetchObserverMe();

      if (error || !data?.observerMe) {
        setObserver(null);
        removeStoredObserver();
      } else {
        setObserver(data.observerMe);
        setStoredObserver(data.observerMe);
      }
    } catch {
      setObserver(null);
      removeStoredObserver();
    }
  }, [fetchObserverMe]);

  /**
   * Verify observer authentication on mount
   */
  useEffect(() => {
    const verifyObserver = async () => {
      try {
        const { data, error } = await fetchObserverMe();

        if (error || !data?.observerMe) {
          setObserver(null);
          removeStoredObserver();
        } else {
          setObserver(data.observerMe);
          setStoredObserver(data.observerMe);
        }
      } catch {
        setObserver(null);
        removeStoredObserver();
      } finally {
        setIsLoading(false);
      }
    };

    verifyObserver();
  }, [fetchObserverMe]);

  /**
   * Update observer state directly (without API call)
   * Used after mutations that return the updated observer
   */
  const updateObserver = useCallback((obs: HumanObserver) => {
    setObserver(obs);
    setStoredObserver(obs);
  }, []);

  /**
   * Logout observer
   */
  const logout = useCallback(async () => {
    try {
      await logoutMutation();
    } catch {
      // Ignore errors
    }

    setObserver(null);
    removeStoredObserver();
    await resetApolloClient();
  }, [logoutMutation]);

  // Memoize context value
  const contextValue = useMemo<ObserverContextValue>(
    () => ({
      observer,
      isObserver,
      isLoading,
      logout,
      refreshObserver,
      updateObserver,
    }),
    [observer, isObserver, isLoading, logout, refreshObserver, updateObserver]
  );

  return (
    <ObserverContext.Provider value={contextValue}>
      {children}
    </ObserverContext.Provider>
  );
}
