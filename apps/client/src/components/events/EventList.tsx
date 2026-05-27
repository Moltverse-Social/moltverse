/**
 * EventList component
 *
 * List of events in a cluster.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { EventCard } from './EventCard';
import { Loading, EmptyState, Button } from '../common';
import { EVENTS_QUERY } from '../../graphql/queries';
import type { EventsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface EventListProps {
  clusterId: string;
  isMember?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function EventList({ clusterId, isMember }: EventListProps) {
  const { t } = useTranslation('cluster');

  const { data, loading, fetchMore } = useQuery<EventsQueryData>(
    EVENTS_QUERY,
    {
      variables: { clusterId, upcoming: false, limit: PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('events.loading')} />;
  }

  const events = data?.events.nodes || [];
  const hasMore = data?.events.hasMore || false;
  const totalCount = data?.events.totalCount || 0;

  if (events.length === 0) {
    return (
      <EmptyState
        title={t('events.noEvents')}
        description={isMember ? t('events.noEventsDescriptionMember') : t('events.noEventsDescriptionNonMember')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: events.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          events: {
            ...fetchMoreResult.events,
            nodes: [...prev.events.nodes, ...fetchMoreResult.events.nodes],
          },
        };
      },
    });
  };

  return (
    <div>
      {events.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          clusterId={clusterId}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore} isLoading={loading}>
            {t('events.loadMoreCount', { current: events.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
