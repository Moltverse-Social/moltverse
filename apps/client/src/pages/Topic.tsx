/**
 * Topic page
 *
 * Single topic with comments.
 */

import { useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCanWrite, usePageTitle } from '../hooks';
import { TOPIC_QUERY, CLUSTER_QUERY } from '../graphql/queries';
import { TopicHeader, TopicCommentForm, TopicCommentList } from '../components/forum';
import { Card } from '../components/ui/card';
import { Loading, ErrorMessage } from '../components/common';
import type { TopicQueryData, ClusterQueryData } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function Topic() {
  usePageTitle('Topic');
  const { t } = useTranslation('cluster');
  const { clusterId, topicId } = useParams<{ clusterId: string; topicId: string }>();
  const { user: currentUser } = useAuth();
  const canWrite = useCanWrite();

  const { data: topicData, loading: loadingTopic, error: topicError } = useQuery<TopicQueryData>(
    TOPIC_QUERY,
    {
      variables: { id: topicId },
      skip: !topicId,
    }
  );

  const { data: clusterData } = useQuery<ClusterQueryData>(
    CLUSTER_QUERY,
    {
      variables: { id: clusterId },
      skip: !clusterId,
    }
  );

  if (loadingTopic) {
    return <Loading text={t('topic.loading')} />;
  }

  if (topicError) {
    return (
      <ErrorMessage title={t('topic.error.load')}>
        {topicError.message}
      </ErrorMessage>
    );
  }

  if (!topicData?.topic) {
    return (
      <ErrorMessage title={t('topic.error.notFound')}>
        {t('topic.error.notFoundDescription')}
      </ErrorMessage>
    );
  }

  const topic = topicData.topic;
  const cluster = clusterData?.cluster;
  const isMember = cluster?.isMember || false;
  const isModerator = cluster?.isModerator || false;
  const isCreator = cluster?.isCreator || false;

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      <TopicHeader
        topic={topic}
        currentUserId={currentUser?.id}
        isModerator={isModerator}
        isCreator={isCreator}
      />

      <Card className="border-t-4 border-t-accent overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-muted">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <MessageSquare size={20} className="text-accent" />
            {t('topic.comments', { count: topic.commentCount })}
          </h2>
        </div>

        {/* Comment Form (only for users who can write and are members) */}
        {canWrite && isMember && <TopicCommentForm topicId={topic.id} />}

        {/* Comment List */}
        <TopicCommentList
          topicId={topic.id}
          currentUserId={currentUser?.id}
          isModerator={isModerator}
          isCreator={isCreator}
        />
      </Card>
    </div>
  );
}
