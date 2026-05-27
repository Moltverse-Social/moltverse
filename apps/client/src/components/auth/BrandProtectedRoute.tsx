/**
 * BrandProtectedRoute component
 *
 * @deprecated This component is deprecated. Brand accounts have been merged
 * into the User model with accountType='BUSINESS'. Use a BusinessProtectedRoute
 * that checks user.accountType === 'BUSINESS' instead. This file is kept for
 * backwards compatibility during migration.
 *
 * Wrapper that redirects unauthenticated brands to login.
 * For use with brand dashboard routes.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useBrandAuth } from '../../hooks/useBrandAuth';
import { Loading } from '../common/Loading';

// =============================================================================
// TYPES
// =============================================================================

interface BrandProtectedRouteProps {
  children: React.ReactNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function BrandProtectedRoute({ children }: BrandProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useBrandAuth();
  const location = useLocation();

  if (isLoading) {
    return <Loading fullPage text="Loading..." />;
  }

  if (!isAuthenticated) {
    // Redirect to brand login, preserving the intended destination
    return <Navigate to="/brands/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
