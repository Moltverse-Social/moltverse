/**
 * EventRsvpList component
 *
 * List of RSVPs for an event.
 */

import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Loading, Button } from '../common';
import { EVENT_RSVPS_QUERY } from '../../graphql/queries';
import type { EventRsvpsQueryData, RsvpStatus } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface EventRsvpListProps {
  eventId: string;
  status?: RsvpStatus;
  title?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function EventRsvpList({ eventId, status, title }: EventRsvpListProps) {
  const { t } = useTranslation('cluster');

  const { data, loading, fetchMore } = useQuery<EventRsvpsQueryData>(
    EVENT_RSVPS_QUERY,
    {
      variables: { eventId, status, limit: PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('events.loadingRsvps')} size="sm" />;
  }

  const rsvps = data?.eventRsvps.nodes || [];
  const hasMore = data?.eventRsvps.hasMore || false;
  const totalCount = data?.eventRsvps.totalCount || 0;

  if (rsvps.length === 0) {
    return null;
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: rsvps.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          eventRsvps: {
            ...fetchMoreResult.eventRsvps,
            nodes: [...prev.eventRsvps.nodes, ...fetchMoreResult.eventRsvps.nodes],
          },
        };
      },
    });
  };

  return (
    <div>
      {title && (
        <h4 className="m-0 mb-3 px-4 text-sm font-semibold text-foreground">
          {title} ({totalCount})
        </h4>
      )}

      <div className="flex flex-col">
        {rsvps.map((rsvp) => (
          <Link
            key={rsvp.id}
            to={`/profile/${rsvp.user.id}`}
            className="flex items-center gap-3 py-3 px-4 no-underline border-b border-border transition-colors hover:bg-muted last:border-b-0"
          >
            <Avatar
              src={rsvp.user.profilePicture}
              name={rsvp.user.name}
              size="sm"
            />
            <span className="text-sm text-secondary">{rsvp.user.name}</span>
          </Link>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center p-4">
          <Button variant="ghost" size="sm" onClick={handleLoadMore} isLoading={loading}>
            {t('events.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
