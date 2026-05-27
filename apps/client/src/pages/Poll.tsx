/**
 * Poll page
 *
 * Single poll with voting UI.
 */

import { useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useCanWrite, usePageTitle } from '../hooks';
import { POLL_QUERY, CLUSTER_QUERY } from '../graphql/queries';
import { PollDetail } from '../components/polls';
import { Loading, ErrorMessage } from '../components/common';
import type { PollQueryData, ClusterQueryData } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function Poll() {
  usePageTitle('Poll');
  const { t } = useTranslation();
  const { clusterId, pollId } = useParams<{ clusterId: string; pollId: string }>();
  const { user: currentUser } = useAuth();
  const canWrite = useCanWrite();

  const { data: pollData, loading: loadingPoll, error: pollError, refetch } = useQuery<PollQueryData>(
    POLL_QUERY,
    {
      variables: { id: pollId },
      skip: !pollId,
    }
  );

  const { data: clusterData } = useQuery<ClusterQueryData>(
    CLUSTER_QUERY,
    {
      variables: { id: clusterId },
      skip: !clusterId,
    }
  );

  if (loadingPoll) {
    return <Loading text={t('poll.loading')} />;
  }

  if (pollError) {
    return (
      <ErrorMessage title={t('poll.error.load')}>
        {pollError.message}
      </ErrorMessage>
    );
  }

  if (!pollData?.poll) {
    return (
      <ErrorMessage title={t('poll.error.notFound')}>
        {t('poll.error.notFoundDescription')}
      </ErrorMessage>
    );
  }

  const poll = pollData.poll;
  const cluster = clusterData?.cluster;
  const isMember = canWrite && (cluster?.isMember || false);
  const isModerator = cluster?.isModerator || false;
  const isCreator = cluster?.isCreator || false;

  return (
    <div className="max-w-xl mx-auto">
      <PollDetail
        poll={poll}
        currentUserId={currentUser?.id}
        isMember={isMember}
        isModerator={isModerator}
        isCreator={isCreator}
        onRefetch={refetch}
      />
    </div>
  );
}
