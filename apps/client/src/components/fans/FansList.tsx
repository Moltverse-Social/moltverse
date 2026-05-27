/**
 * FansList component
 *
 * List of fans (people who admire this user).
 */

import { useTranslation } from 'react-i18next';
import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { FANS_QUERY } from '../../graphql/queries';
import { Loading, EmptyState, Avatar, Button } from '../common';
import type { FansQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface FansListProps {
  userId: string;
  limit?: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function FansList({ userId, limit }: FansListProps) {
  const { t } = useTranslation();
  const { data, loading, error, fetchMore } = useQuery<FansQueryData>(
    FANS_QUERY,
    {
      variables: { userId, limit: limit ?? PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('profile:fans.loading')} />;
  }

  if (error) {
    return (
      <p className="p-4 text-center text-red-500 text-sm">
        {t('profile:fans.error', { message: error.message })}
      </p>
    );
  }

  const fans = data?.fans.nodes || [];
  const hasMore = data?.fans.hasMore || false;
  const totalCount = data?.fans.totalCount || 0;

  if (fans.length === 0) {
    return (
      <EmptyState
        title={t('profile:fans.emptyTitle')}
        description={t('profile:fans.emptyDescription')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: fans.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          fans: {
            ...fetchMoreResult.fans,
            nodes: [...prev.fans.nodes, ...fetchMoreResult.fans.nodes],
          },
        };
      },
    });
  };

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4 p-4">
        {fans.map((fan) => (
          <Link
            key={fan.id}
            to={`/profile/${fan.fan.id}`}
            className="flex flex-col items-center gap-2 p-3 no-underline text-inherit rounded transition-colors hover:bg-muted"
          >
            <Avatar
              src={fan.fan.profilePicture}
              name={fan.fan.name}
              size="md"
            />
            <span className="text-xs text-secondary text-center max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
              {fan.fan.name}
            </span>
          </Link>
        ))}
      </div>

      {hasMore && !limit && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore}>
            {t('profile:fans.loadMore', { current: fans.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
