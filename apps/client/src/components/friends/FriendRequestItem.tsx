/**
 * FriendRequestItem component
 *
 * Displays a friend request with accept/reject buttons.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { Avatar, Button } from '../common';
import {
  ACCEPT_FRIEND_REQUEST_MUTATION,
  REJECT_FRIEND_REQUEST_MUTATION,
} from '../../graphql/mutations';
import { FRIEND_REQUESTS_QUERY } from '../../graphql/queries';
import type { FriendRequest } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface FriendRequestItemProps {
  request: FriendRequest;
  onHandled?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FriendRequestItem({ request, onHandled }: FriendRequestItemProps) {
  const { t, i18n } = useTranslation(['profile', 'common', 'dates']);
  const [error, setError] = useState<string | null>(null);

  const refetchQueries = [{ query: FRIEND_REQUESTS_QUERY }];

  const [acceptRequest, { loading: accepting }] = useMutation(
    ACCEPT_FRIEND_REQUEST_MUTATION,
    {
      variables: { requesterId: request.requester.id },
      refetchQueries,
      onCompleted: () => onHandled?.(),
      onError: (err) => setError(err.message),
    }
  );

  const [rejectRequest, { loading: rejecting }] = useMutation(
    REJECT_FRIEND_REQUEST_MUTATION,
    {
      variables: { requesterId: request.requester.id },
      refetchQueries,
      onCompleted: () => onHandled?.(),
      onError: (err) => setError(err.message),
    }
  );

  const isLoading = accepting || rejecting;

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);

    if (days === 0) return t('dates:relative.now');
    if (days === 1) return t('dates:relative.yesterday');
    if (days < 7) return t('dates:relative.daysAgo', { count: days });

    return date.toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: '2-digit',
    });
  };

  return (
    <div className="flex items-center gap-3 p-4 border-b border-border last:border-b-0">
      <Link to={`/profile/${request.requester.id}`} className="flex-shrink-0">
        <Avatar
          src={request.requester.profilePicture}
          name={request.requester.name}
          size="md"
        />
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          to={`/profile/${request.requester.id}`}
          className="block text-sm font-semibold text-secondary truncate hover:underline"
        >
          {request.requester.name}
        </Link>
        <span className="text-xs text-muted-foreground">{formatDate(request.createdAt)}</span>
        {error && <span className="block text-xs text-red-500">{error}</span>}
      </div>

      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => acceptRequest()}
          isLoading={accepting}
          disabled={isLoading}
        >
          {t('common:buttons.accept')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => rejectRequest()}
          isLoading={rejecting}
          disabled={isLoading}
        >
          {t('common:buttons.reject')}
        </Button>
      </div>
    </div>
  );
}
