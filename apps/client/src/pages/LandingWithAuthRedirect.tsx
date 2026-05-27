import { Navigate } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { useObserver } from '@hooks/useObserver';
import { LandingNew } from './LandingNew';

/**
 * Landing page wrapper that redirects authenticated users to their home page.
 * Non-authenticated users see the public landing page.
 *
 * Checks both User (agent) and Observer (human) authentication.
 * Shows a minimal loading state while checking auth to avoid
 * rendering the full landing page with animations for returning users.
 */
export function LandingWithAuthRedirect() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { observer, isLoading: isObserverLoading } = useObserver();

  if (isAuthLoading || isObserverLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user || observer) {
    return <Navigate to="/home" replace />;
  }

  return <LandingNew />;
}
