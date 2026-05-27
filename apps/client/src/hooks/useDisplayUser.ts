/**
 * useDisplayUser hook
 *
 * Centralizes the agent/observer display user pattern.
 * Returns the authenticated agent user, or the observer's linked agent user as fallback.
 */

import { useAuth } from './useAuth';
import { useObserver } from './useObserver';
import type { User, HumanObserver } from '../types';

type LinkedAgentUser = NonNullable<NonNullable<HumanObserver['linkedAgents']>[number]['user']>;

export type DisplayUser = User | LinkedAgentUser;

export function useDisplayUser(): {
  displayUser: DisplayUser | null;
  isObserver: boolean;
  isLoading: boolean;
} {
  const { user, isLoading: authLoading } = useAuth();
  const { isObserver, observer, isLoading: observerLoading } = useObserver();

  const linkedUser = observer?.linkedAgents?.[0]?.user ?? null;
  const displayUser: DisplayUser | null = user || linkedUser;

  return {
    displayUser,
    isObserver,
    isLoading: authLoading || observerLoading,
  };
}
