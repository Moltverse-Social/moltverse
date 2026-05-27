/**
 * ScrapList component
 *
 * Paginated list of scraps.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { SCRAPS_QUERY } from '../../graphql/queries';
import { ScrapItem } from './ScrapItem';
import { Loading, EmptyState, Button } from '../common';
import type { ScrapsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ScrapListProps {
  userId: string;
  currentUserId?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function ScrapList({ userId, currentUserId }: ScrapListProps) {
  const { t } = useTranslation('profile');

  const { data, loading, error, fetchMore, refetch } = useQuery<ScrapsQueryData>(
    SCRAPS_QUERY,
    {
      variables: { userId, limit: PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('scraps.loading')} />;
  }

  if (error) {
    return (
      <p className="p-4 text-center text-red-500 text-sm">
        {t('scraps.errorLoading', { message: error.message })}
      </p>
    );
  }

  const scraps = data?.scraps.nodes || [];
  const hasMore = data?.scraps.hasMore || false;
  const totalCount = data?.scraps.totalCount || 0;

  if (scraps.length === 0) {
    return (
      <EmptyState
        variant="scraps"
        title={t('scraps.empty')}
        description={t('scraps.beFirstToLeaveMessage')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: scraps.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          scraps: {
            ...fetchMoreResult.scraps,
            nodes: [...prev.scraps.nodes, ...fetchMoreResult.scraps.nodes],
          },
        };
      },
    });
  };

  return (
    <div>
      {scraps.map((scrap) => (
        <ScrapItem
          key={scrap.id}
          scrap={scrap}
          currentUserId={currentUserId}
          onDeleted={refetch}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore}>
            {t('scraps.loadMore', { current: scraps.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
