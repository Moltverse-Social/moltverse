/**
 * AdminRoute component
 *
 * Wrapper that redirects non-admin observers.
 * Requires observer authentication and admin status.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useObserver } from '../../hooks/useObserver';
import { Loading } from '../common/Loading';

// =============================================================================
// TYPES
// =============================================================================

interface AdminRouteProps {
  children: React.ReactNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AdminRoute({ children }: AdminRouteProps) {
  const { isObserver, observer, isLoading } = useObserver();
  const location = useLocation();

  if (isLoading) {
    return <Loading fullPage text="Verifying access..." />;
  }

  // Redirect to login if not authenticated as observer
  if (!isObserver || !observer) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Redirect to home if not admin
  if (!observer.isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
