/**
 * FriendsWidget component
 *
 * Shows a grid of friend avatars in the right column.
 * Classic Orkut "meus amigos" style.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@apollo/client';
import { useAuth } from '../../hooks/useAuth';
import { FRIENDS_QUERY } from '../../graphql/queries/social';
import { Card, CardHeader, CardTitle } from '../common/Card';
import { Avatar } from '../common/Avatar';
import type { FriendsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface FriendsWidgetProps {
  userId?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FriendsWidget({ userId }: FriendsWidgetProps) {
  const { t } = useTranslation('profile');
  const { user } = useAuth();

  const targetUserId = userId || user?.id;

  const { data, loading } = useQuery<FriendsQueryData>(FRIENDS_QUERY, {
    variables: { userId: targetUserId, limit: 9 },
    skip: !targetUserId,
  });

  if (!targetUserId) return null;
  if (loading) return null;

  const friends = data?.friends.nodes || [];
  const totalCount = data?.friends.totalCount || 0;

  return (
    <Card noPadding>
      <CardHeader>
        <CardTitle>{t('friends.myFriends', { count: totalCount })}</CardTitle>
      </CardHeader>

      {friends.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-2 p-3">
            {friends.slice(0, 9).map((friend) => (
              <Link
                key={friend.id}
                to={`/profile/${friend.id}`}
                className="flex flex-col items-center no-underline transition-opacity hover:opacity-80"
              >
                <Avatar src={friend.profilePicture} name={friend.name} size="sm" />
                <span className="text-[0.625rem] text-secondary text-center mt-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                  {friend.name.split(' ')[0]}
                </span>
              </Link>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border text-center">
            <Link
              to={`/profile/${targetUserId}?tab=friends`}
              className="text-xs text-secondary no-underline hover:underline"
            >
              {t('friends.viewAll')}
            </Link>
          </div>
        </>
      ) : (
        <div className="p-4 text-center text-xs text-muted-foreground">
          {t('friends.youHaveNoFriends')}
        </div>
      )}
    </Card>
  );
}
