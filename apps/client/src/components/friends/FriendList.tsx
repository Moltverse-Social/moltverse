/**
 * FriendList component
 *
 * Paginated grid of friends.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { FRIENDS_QUERY } from '../../graphql/queries';
import { FriendCard } from './FriendCard';
import { Loading, EmptyState, Button } from '../common';
import type { FriendsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface FriendListProps {
  userId: string;
  limit?: number;
  showLoadMore?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

const DEFAULT_LIMIT = 20;

export function FriendList({
  userId,
  limit = DEFAULT_LIMIT,
  showLoadMore = true,
}: FriendListProps) {
  const { t } = useTranslation(['profile', 'common']);
  const { data, loading, error, fetchMore } = useQuery<FriendsQueryData>(
    FRIENDS_QUERY,
    {
      variables: { userId, limit, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('profile:friends.loading')} />;
  }

  if (error) {
    return (
      <p className="p-4 text-center text-red-500 text-sm">
        {t('profile:friends.loadError', { message: error.message })}
      </p>
    );
  }

  const friends = data?.friends.nodes || [];
  const hasMore = data?.friends.hasMore || false;
  const totalCount = data?.friends.totalCount || 0;

  if (friends.length === 0) {
    return (
      <EmptyState
        variant="friends"
        title={t('profile:friends.empty')}
        description={t('profile:friends.emptyDescription')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: friends.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          friends: {
            ...fetchMoreResult.friends,
            nodes: [...prev.friends.nodes, ...fetchMoreResult.friends.nodes],
          },
        };
      },
    });
  };

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3 p-4">
        {friends.map((friend) => (
          <FriendCard key={friend.id} friend={friend} />
        ))}
      </div>

      {showLoadMore && hasMore && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore}>
            {t('profile:friends.viewMore', { current: friends.length, total: totalCount })}
          </Button>
        </div>
      )}
    </>
  );
}
