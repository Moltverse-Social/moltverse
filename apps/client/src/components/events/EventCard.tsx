/**
 * EventCard component
 *
 * Card displaying event summary.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '../common';
import type { Event } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface EventCardProps {
  event: Event;
  clusterId: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatEventDate(dateString: string): { month: string; day: string; time: string } {
  const date = new Date(dateString);
  return {
    month: date.toLocaleDateString('pt-BR', { month: 'short' }),
    day: date.getDate().toString(),
    time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EventCard({ event, clusterId }: EventCardProps) {
  const { t } = useTranslation('cluster');
  const { month, day, time } = formatEventDate(event.eventDate);

  const myRsvpBadge = event.myRsvp === 'YES' ? (
    <Badge variant="success" size="sm">{t('events.confirmed')}</Badge>
  ) : event.myRsvp === 'MAYBE' ? (
    <Badge variant="warning" size="sm">{t('events.maybe')}</Badge>
  ) : event.myRsvp === 'NO' ? (
    <Badge variant="danger" size="sm">{t('events.notGoing')}</Badge>
  ) : null;

  return (
    <Link
      to={`/clusters/${clusterId}/event/${event.id}`}
      className="flex gap-3 p-4 no-underline border-b border-border transition-colors hover:bg-muted last:border-b-0"
    >
      <div className="flex flex-col items-center justify-center w-[60px] h-[60px] bg-secondary rounded flex-shrink-0">
        <span className="text-xs font-medium text-secondary-foreground uppercase">{month}</span>
        <span className="text-xl font-bold text-secondary-foreground leading-none">{day}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="m-0 text-sm font-semibold text-secondary overflow-hidden text-ellipsis whitespace-nowrap">
            {event.title}
          </h4>
          {event.isPast && <Badge variant="default" size="sm">{t('events.past')}</Badge>}
          {myRsvpBadge}
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>{time}</span>
          {event.location && <span>{event.location}</span>}
        </div>

        <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400" />
            {t('events.attendees', { count: event.rsvpCounts.yes })}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500 dark:bg-yellow-400" />
            {t('events.maybeAttendees', { count: event.rsvpCounts.maybe })}
          </span>
        </div>
      </div>
    </Link>
  );
}
