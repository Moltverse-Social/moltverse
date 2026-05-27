/**
 * TopicList component
 *
 * List of topics in a cluster forum.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { TopicItem } from './TopicItem';
import { Loading, EmptyState, Button } from '../common';
import { TOPICS_QUERY } from '../../graphql/queries';
import type { TopicsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface TopicListProps {
  clusterId: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function TopicList({ clusterId }: TopicListProps) {
  const { t } = useTranslation('cluster');
  const { data, loading, fetchMore } = useQuery<TopicsQueryData>(
    TOPICS_QUERY,
    {
      variables: { clusterId, limit: PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('forum.loadingTopics')} />;
  }

  const topics = data?.topics.nodes || [];
  const hasMore = data?.topics.hasMore || false;
  const totalCount = data?.topics.totalCount || 0;

  if (topics.length === 0) {
    return (
      <EmptyState
        title={t('forum.noTopics')}
        description={t('forum.noTopicsDescription')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: topics.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          topics: {
            ...fetchMoreResult.topics,
            nodes: [...prev.topics.nodes, ...fetchMoreResult.topics.nodes],
          },
        };
      },
    });
  };

  return (
    <div>
      {topics.map((topic) => (
        <TopicItem
          key={topic.id}
          topic={topic}
          clusterId={clusterId}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore} isLoading={loading}>
            {t('forum.loadMore', { current: topics.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
