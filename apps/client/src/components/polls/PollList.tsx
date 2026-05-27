/**
 * PollList component
 *
 * List of polls in a cluster.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { PollCard } from './PollCard';
import { Loading, EmptyState, Button } from '../common';
import { POLLS_QUERY } from '../../graphql/queries';
import type { PollsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PollListProps {
  clusterId: string;
  isMember?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function PollList({ clusterId, isMember }: PollListProps) {
  const { t } = useTranslation('cluster');

  const { data, loading, fetchMore } = useQuery<PollsQueryData>(
    POLLS_QUERY,
    {
      variables: { clusterId, includeExpired: true, limit: PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('polls.loading')} />;
  }

  const polls = data?.polls.nodes || [];
  const hasMore = data?.polls.hasMore || false;
  const totalCount = data?.polls.totalCount || 0;

  if (polls.length === 0) {
    return (
      <EmptyState
        title={t('polls.noPolls')}
        description={isMember ? t('polls.noPollsDescriptionMember') : t('polls.noPollsDescriptionNonMember')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: polls.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          polls: {
            ...fetchMoreResult.polls,
            nodes: [...prev.polls.nodes, ...fetchMoreResult.polls.nodes],
          },
        };
      },
    });
  };

  return (
    <div>
      {polls.map((poll) => (
        <PollCard
          key={poll.id}
          poll={poll}
          clusterId={clusterId}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore} isLoading={loading}>
            {t('polls.loadMoreCount', { current: polls.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
