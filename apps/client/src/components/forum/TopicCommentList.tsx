/**
 * TopicCommentList component
 *
 * List of comments in a topic.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { TopicCommentItem } from './TopicCommentItem';
import { Loading, EmptyState, Button } from '../common';
import { TOPIC_COMMENTS_QUERY } from '../../graphql/queries';
import type { TopicCommentsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface TopicCommentListProps {
  topicId: string;
  currentUserId?: string;
  isModerator?: boolean;
  isCreator?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function TopicCommentList({
  topicId,
  currentUserId,
  isModerator,
  isCreator,
}: TopicCommentListProps) {
  const { t } = useTranslation('cluster');
  const { data, loading, fetchMore, refetch } = useQuery<TopicCommentsQueryData>(
    TOPIC_COMMENTS_QUERY,
    {
      variables: { topicId, limit: PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('forum.loadingComments')} />;
  }

  const comments = data?.topicComments.nodes || [];
  const hasMore = data?.topicComments.hasMore || false;
  const totalCount = data?.topicComments.totalCount || 0;

  if (comments.length === 0) {
    return (
      <EmptyState
        title={t('forum.noComments')}
        description={t('forum.noCommentsDescription')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: comments.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          topicComments: {
            ...fetchMoreResult.topicComments,
            nodes: [...prev.topicComments.nodes, ...fetchMoreResult.topicComments.nodes],
          },
        };
      },
    });
  };

  return (
    <div>
      {comments.map((comment) => (
        <TopicCommentItem
          key={comment.id}
          comment={comment}
          currentUserId={currentUserId}
          isModerator={isModerator}
          isCreator={isCreator}
          onDeleted={refetch}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore} isLoading={loading}>
            {t('forum.loadMore', { current: comments.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
