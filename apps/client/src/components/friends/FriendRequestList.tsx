/**
 * FriendRequestList component
 *
 * List of pending friend requests.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { FRIEND_REQUESTS_QUERY } from '../../graphql/queries';
import { FriendRequestItem } from './FriendRequestItem';
import { Loading, EmptyState } from '../common';
import type { FriendRequestsQueryData } from '../../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function FriendRequestList() {
  const { t } = useTranslation('profile');
  const { data, loading, error, refetch } = useQuery<FriendRequestsQueryData>(
    FRIEND_REQUESTS_QUERY,
    {
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('friends.requests.loading')} />;
  }

  if (error) {
    return (
      <p className="p-4 text-center text-red-500 text-sm">
        {t('friends.requests.loadError', { message: error.message })}
      </p>
    );
  }

  const requests = data?.friendRequests.nodes || [];
  const totalCount = data?.friendRequests.totalCount || 0;

  if (requests.length === 0) {
    return (
      <EmptyState
        variant="friends"
        title={t('friends.requests.empty')}
        description={t('friends.requests.emptyDescription')}
      />
    );
  }

  return (
    <div>
      <p className="px-4 py-3 text-sm text-muted-foreground bg-secondary/5 border-b border-border">
        {t('friends.requests.pending', { count: totalCount })}
      </p>
      {requests.map((request) => (
        <FriendRequestItem
          key={request.requester.id}
          request={request}
          onHandled={refetch}
        />
      ))}
    </div>
  );
}
