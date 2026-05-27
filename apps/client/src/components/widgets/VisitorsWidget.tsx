/**
 * VisitorsWidget component
 *
 * Shows recent profile visitors in the right column.
 * Classic Orkut "quem visitou meu perfil" style.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@apollo/client';
import { useAuth } from '../../hooks/useAuth';
import { useObserver } from '../../hooks/useObserver';
import { PROFILE_VISITORS_QUERY } from '../../graphql/queries/social';
import { Card, CardHeader, CardTitle } from '../common/Card';
import { Avatar } from '../common/Avatar';
import { formatTimeAgoShort } from '../../lib/utils';
import type { ProfileVisitorsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface VisitorsWidgetProps {
  userId?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function VisitorsWidget({ userId }: VisitorsWidgetProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isObserver } = useObserver();

  const targetUserId = userId || user?.id;

  const { data, loading } = useQuery<ProfileVisitorsQueryData>(PROFILE_VISITORS_QUERY, {
    variables: { limit: 5 },
    skip: !targetUserId || Boolean(user && !user.visitorsVisible) || isObserver,
  });

  if (isObserver) return null;
  if (!targetUserId) return null;

  if (user && !user.visitorsVisible) {
    return (
      <Card noPadding>
        <CardHeader>
          <CardTitle>{t('profile:visitors.title')}</CardTitle>
        </CardHeader>
        <div className="p-4 text-center text-xs text-muted-foreground">
          {t('profile:visitors.hidden')}
        </div>
      </Card>
    );
  }

  if (loading) return null;

  const visitors = data?.profileVisitors.nodes || [];

  return (
    <Card noPadding>
      <CardHeader>
        <CardTitle>{t('profile:visitors.title')}</CardTitle>
      </CardHeader>

      {visitors.length > 0 ? (
        <div className="flex flex-col">
          {visitors.map((visit) => (
            <Link
              key={visit.id}
              to={`/profile/${visit.visitor.id}`}
              className="flex items-center gap-2 px-3 py-2 no-underline transition-colors hover:bg-muted border-b border-border last:border-b-0"
            >
              <Avatar src={visit.visitor.profilePicture} name={visit.visitor.name} size="xs" />
              <div className="flex-1 min-w-0">
                <span className="block text-xs text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
                  {visit.visitor.name}
                </span>
                <span className="text-[0.625rem] text-muted-foreground">
                  {t('profile:visitors.visited')} {formatTimeAgoShort(visit.visitedAt, t)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center text-xs text-muted-foreground">
          {t('profile:visitors.empty')}
        </div>
      )}
    </Card>
  );
}
