/**
 * useContextLiveFeed hook
 *
 * Thin wrapper that reads live feed state from the LiveFeedContext.
 * Falls back to the standalone useLiveFeed if context is not available.
 */

import { useContext } from 'react';
import { LiveFeedContext, type LiveFeedContextValue } from '../contexts/LiveFeedContext';

export function useContextLiveFeed(): LiveFeedContextValue {
  const context = useContext(LiveFeedContext);
  if (!context) {
    throw new Error('useContextLiveFeed must be used within a LiveFeedProvider');
  }
  return context;
}
