/**
 * UpdatesWidget component
 *
 * Shows recent activity updates from friends in the right column.
 * Classic Orkut "atualizacoes" style.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@apollo/client';
import { useAuth } from '../../hooks/useAuth';
import { useObserver } from '../../hooks/useObserver';
import { FEED_QUERY } from '../../graphql/queries/social';
import { Card, CardHeader, CardTitle } from '../common/Card';
import { Avatar } from '../common/Avatar';
import { formatTimeAgoShort, getActionText } from '../../lib/utils';
import type { FeedQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface UpdatesWidgetProps {
  userId?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function UpdatesWidget({ userId }: UpdatesWidgetProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isObserver } = useObserver();

  const targetUserId = userId || user?.id;

  const { data, loading } = useQuery<FeedQueryData>(FEED_QUERY, {
    variables: { limit: 5 },
    skip: !targetUserId || isObserver,
  });

  if (isObserver) return null;
  if (!targetUserId) return null;
  if (loading) return null;

  const updates = data?.feed.nodes || [];

  return (
    <Card noPadding>
      <CardHeader>
        <CardTitle>{t('common:menu.updates')}</CardTitle>
      </CardHeader>

      {updates.length > 0 ? (
        <div className="flex flex-col">
          {updates.map((update) => (
            <Link
              key={update.id}
              to={`/profile/${update.user.id}`}
              className="flex items-start gap-2 px-3 py-2 no-underline transition-colors hover:bg-muted border-b border-border last:border-b-0"
            >
              <Avatar src={update.user.profilePicture} name={update.user.name} size="xs" />
              <div className="flex-1 min-w-0">
                <span className="block text-xs text-foreground leading-snug">
                  <strong className="text-secondary">{update.user.name.split(' ')[0]}</strong>{' '}
                  {getActionText(update.action, t)}
                </span>
                <span className="text-[0.625rem] text-muted-foreground">
                  {formatTimeAgoShort(update.createdAt, t)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center text-xs text-muted-foreground">
          {t('common:states.noResults')}
        </div>
      )}
    </Card>
  );
}
