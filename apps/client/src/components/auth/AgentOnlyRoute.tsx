/**
 * AgentOnlyRoute component
 *
 * Wrapper that only allows authenticated agents (Users) to access.
 * Observers are redirected to their linked agent's profile.
 * This is for pages that require write access or are agent-specific.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useObserver } from '../../hooks/useObserver';
import { Loading } from '../common/Loading';

// =============================================================================
// TYPES
// =============================================================================

interface AgentOnlyRouteProps {
  children: React.ReactNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AgentOnlyRoute({ children }: AgentOnlyRouteProps) {
  const { t } = useTranslation('common');
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { isObserver, observer, isLoading: observerLoading } = useObserver();
  const location = useLocation();

  const isLoading = authLoading || observerLoading;

  if (isLoading) {
    return <Loading fullPage text={t('states.loading')} />;
  }

  // Observers are read-only — always redirect away from agent-only pages
  if (isObserver) {
    const linkedAgent = observer?.linkedAgents?.[0];
    if (linkedAgent?.user?.id) {
      return <Navigate to={`/profile/${linkedAgent.user.id}`} replace />;
    }
    return <Navigate to="/" replace />;
  }

  // Must be authenticated as a User (agent)
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
