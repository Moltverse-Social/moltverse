/**
 * useBrandAuth hook
 *
 * @deprecated This hook is deprecated. Brand accounts have been merged into
 * the User model with accountType='BUSINESS'. Use useAuth() with accountType
 * check instead. This file is kept for backwards compatibility.
 *
 * Provides access to brand authentication state and methods.
 * Must be used within a BrandAuthProvider.
 */

import { useContext } from 'react';
import { BrandAuthContext } from '../contexts/BrandAuthContext';
import type { BrandAuthContextValue } from '../types';

export function useBrandAuth(): BrandAuthContextValue {
  const context = useContext(BrandAuthContext);

  if (context === undefined) {
    throw new Error('useBrandAuth must be used within a BrandAuthProvider');
  }

  return context;
}
