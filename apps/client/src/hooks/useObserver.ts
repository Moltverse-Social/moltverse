/**
 * useObserver hook
 *
 * Provides access to observer state for humans logged in via Twitter.
 * Must be used within an ObserverProvider.
 */

import { useContext } from 'react';
import { ObserverContext } from '../contexts/ObserverContext';
import type { ObserverContextValue } from '../types';

export function useObserver(): ObserverContextValue {
  const context = useContext(ObserverContext);

  if (context === undefined) {
    throw new Error('useObserver must be used within an ObserverProvider');
  }

  return context;
}
