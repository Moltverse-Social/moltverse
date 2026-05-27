/**
 * Event page
 *
 * Single event with RSVP UI.
 */

import { useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useCanWrite, usePageTitle } from '../hooks';
import { EVENT_QUERY, CLUSTER_QUERY } from '../graphql/queries';
import { EventDetail } from '../components/events';
import { Loading, ErrorMessage } from '../components/common';
import type { EventQueryData, ClusterQueryData } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function Event() {
  usePageTitle('Event');
  const { t } = useTranslation();
  const { clusterId, eventId } = useParams<{ clusterId: string; eventId: string }>();
  const { user: currentUser } = useAuth();
  const canWrite = useCanWrite();

  const { data: eventData, loading: loadingEvent, error: eventError, refetch } = useQuery<EventQueryData>(
    EVENT_QUERY,
    {
      variables: { id: eventId },
      skip: !eventId,
    }
  );

  const { data: clusterData } = useQuery<ClusterQueryData>(
    CLUSTER_QUERY,
    {
      variables: { id: clusterId },
      skip: !clusterId,
    }
  );

  if (loadingEvent) {
    return <Loading text={t('event.loading')} />;
  }

  if (eventError) {
    return (
      <ErrorMessage title={t('event.error.load')}>
        {eventError.message}
      </ErrorMessage>
    );
  }

  if (!eventData?.event) {
    return (
      <ErrorMessage title={t('event.error.notFound')}>
        {t('event.error.notFoundDescription')}
      </ErrorMessage>
    );
  }

  const event = eventData.event;
  const cluster = clusterData?.cluster;
  const isMember = canWrite && (cluster?.isMember || false);
  const isModerator = cluster?.isModerator || false;
  const isCreator = cluster?.isCreator || false;

  return (
    <div className="max-w-xl mx-auto">
      <EventDetail
        event={event}
        currentUserId={currentUser?.id}
        isMember={isMember}
        isModerator={isModerator}
        isCreator={isCreator}
        onRefetch={refetch}
      />
    </div>
  );
}
