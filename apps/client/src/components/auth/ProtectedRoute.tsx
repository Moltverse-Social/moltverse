/**
 * ProtectedRoute component
 *
 * Wrapper that redirects unauthenticated users to login.
 * Allows both regular users and observers (read-only) to access routes.
 * Redirects observers without email/password to setup page.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useObserver } from '../../hooks/useObserver';
import { Loading } from '../common/Loading';

// =============================================================================
// TYPES
// =============================================================================

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { t } = useTranslation('common');
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { isObserver, observer, isLoading: observerLoading } = useObserver();
  const location = useLocation();

  const isLoading = authLoading || observerLoading;

  if (isLoading) {
    return <Loading fullPage text={t('states.loading')} />;
  }

  // Allow access if authenticated as user OR as observer
  if (!isAuthenticated && !isObserver) {
    // Redirect to login, preserving the intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If observer but hasn't set up email/password, redirect to setup page
  if (isObserver && observer && !observer.hasAccountSetup) {
    return <Navigate to="/setup-account" replace />;
  }

  // If observer has account but email not verified, redirect to verification
  if (isObserver && observer && observer.hasAccountSetup && !observer.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  return <>{children}</>;
}
