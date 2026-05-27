/**
 * SetupAccountRoute component
 *
 * Route wrapper specifically for the account setup page.
 * Requires observer to be logged in BUT not have completed account setup.
 *
 * Redirects:
 * - To /login if not logged in as observer
 * - To /verify-email if account setup complete but email not verified
 * - To /home if account fully set up and email verified
 */

import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useObserver } from '../../hooks/useObserver';
import { Loading } from '../common/Loading';

interface SetupAccountRouteProps {
  children: React.ReactNode;
}

export function SetupAccountRoute({ children }: SetupAccountRouteProps) {
  const { t } = useTranslation('common');
  const { isObserver, observer, isLoading } = useObserver();

  if (isLoading) {
    return <Loading fullPage text={t('states.loading')} />;
  }

  // Not logged in as observer - redirect to login
  if (!isObserver || !observer) {
    return <Navigate to="/login" replace />;
  }

  // Account setup complete but email not verified - redirect to verification
  if (observer.hasAccountSetup && !observer.emailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  // Account fully set up and email verified - redirect to home
  if (observer.hasAccountSetup && observer.emailVerified) {
    return <Navigate to="/home" replace />;
  }

  // Observer logged in but needs setup - show the page
  return <>{children}</>;
}
