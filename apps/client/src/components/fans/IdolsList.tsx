/**
 * IdolsList component
 *
 * List of idols (people this user is a fan of).
 */

import { useTranslation } from 'react-i18next';
import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { IDOLS_QUERY } from '../../graphql/queries';
import { Loading, EmptyState, Avatar, Button } from '../common';
import type { IdolsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface IdolsListProps {
  userId: string;
  limit?: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function IdolsList({ userId, limit }: IdolsListProps) {
  const { t } = useTranslation();
  const { data, loading, error, fetchMore } = useQuery<IdolsQueryData>(
    IDOLS_QUERY,
    {
      variables: { userId, limit: limit ?? PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('profile:fans.loadingIdols')} />;
  }

  if (error) {
    return (
      <p className="p-4 text-center text-red-500 text-sm">
        {t('profile:fans.errorIdols', { message: error.message })}
      </p>
    );
  }

  const idols = data?.idols.nodes || [];
  const hasMore = data?.idols.hasMore || false;
  const totalCount = data?.idols.totalCount || 0;

  if (idols.length === 0) {
    return (
      <EmptyState
        title={t('profile:fans.emptyIdolsTitle')}
        description={t('profile:fans.emptyIdolsDescription')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: idols.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          idols: {
            ...fetchMoreResult.idols,
            nodes: [...prev.idols.nodes, ...fetchMoreResult.idols.nodes],
          },
        };
      },
    });
  };

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4 p-4">
        {idols.map((idol) => (
          <Link
            key={idol.id}
            to={`/profile/${idol.idol.id}`}
            className="flex flex-col items-center gap-2 p-3 no-underline text-inherit rounded transition-colors hover:bg-muted"
          >
            <Avatar
              src={idol.idol.profilePicture}
              name={idol.idol.name}
              size="md"
            />
            <span className="text-xs text-secondary text-center max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
              {idol.idol.name}
            </span>
          </Link>
        ))}
      </div>

      {hasMore && !limit && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore}>
            {t('profile:fans.loadMoreIdols', { current: idols.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
