/**
 * EventDetail component
 *
 * Full event with RSVP UI.
 */

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, ConfirmModal } from '../common';
import { EventRsvpButtons } from './EventRsvpButtons';
import { EventRsvpList } from './EventRsvpList';
import { useCanWrite } from '../../hooks';
import { DELETE_EVENT_MUTATION } from '../../graphql/mutations';
import type { Event, DeleteEventMutationData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface EventDetailProps {
  event: Event;
  currentUserId?: string;
  isMember?: boolean;
  isModerator?: boolean;
  isCreator?: boolean;
  onRefetch?: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatEventDate(dateString: string): { date: string; time: string } {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    time: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EventDetail({
  event,
  currentUserId,
  isMember,
  isModerator,
  isCreator,
  onRefetch,
}: EventDetailProps) {
  const { t } = useTranslation('cluster');
  const navigate = useNavigate();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const canWrite = useCanWrite();
  const canManage = canWrite && (currentUserId === event.creator.id || isModerator || isCreator);

  const [deleteEvent, { loading: deleting }] = useMutation<DeleteEventMutationData>(
    DELETE_EVENT_MUTATION,
    {
      variables: { id: event.id },
      onCompleted: () => {
        navigate(`/clusters/${event.cluster.id}`);
      },
    }
  );

  const handleDelete = () => {
    deleteEvent();
    setShowDeleteModal(false);
  };

  const { date, time } = formatEventDate(event.eventDate);

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="w-full h-[200px] bg-secondary flex items-center justify-center">
        {event.picture ? (
          <img src={event.picture} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl text-secondary-foreground">{t('events.eventLabel')}</span>
        )}
      </div>

      <div className="p-6">
        <Link
          to={`/clusters/${event.cluster.id}`}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground no-underline mb-3 hover:text-secondary"
        >
          <Avatar
            src={event.cluster.picture}
            name={event.cluster.title}
            size="xs"
          />
          {event.cluster.title}
        </Link>

        <div className="flex items-center gap-2 flex-wrap mb-2">
          <h1 className="m-0 text-xl font-semibold text-foreground">{event.title}</h1>
          {event.isPast && <Badge variant="default">{t('events.pastEvent')}</Badge>}
        </div>

        <div className="flex items-center gap-2 p-4 bg-muted rounded mb-4">
          <div className="flex flex-col">
            <span className="text-base font-semibold text-foreground">{date}</span>
            <span className="text-sm text-muted-foreground">{time}</span>
          </div>
        </div>

        {event.location && (
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            {t('events.locationLabel')} {event.location}
          </div>
        )}

        {event.description && (
          <p className="m-0 mb-6 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {event.description}
          </p>
        )}

        <div className="mb-6">
          <h3 className="m-0 mb-3 text-base font-semibold text-foreground">
            {t('events.confirmPresence')}
          </h3>

          <div className="flex gap-6 mb-4">
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold text-secondary">{event.rsvpCounts.yes}</span>
              <span className="text-xs text-muted-foreground">{t('events.attendees', { count: event.rsvpCounts.yes }).split(' ').slice(1).join(' ')}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold text-secondary">{event.rsvpCounts.maybe}</span>
              <span className="text-xs text-muted-foreground">{t('events.maybe')}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold text-secondary">{event.rsvpCounts.no}</span>
              <span className="text-xs text-muted-foreground">{t('events.notGoing')}</span>
            </div>
          </div>

          <EventRsvpButtons
            eventId={event.id}
            currentRsvp={event.myRsvp}
            isPast={event.isPast}
            isMember={isMember || false}
            onRefetch={onRefetch}
          />
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Link
              to={`/profile/${event.creator.id}`}
              className="flex items-center gap-2 no-underline"
            >
              <Avatar
                src={event.creator.profilePicture}
                name={event.creator.name}
                size="sm"
              />
              <span className="text-sm font-medium text-secondary">{event.creator.name}</span>
            </Link>
          </div>

          {canManage && (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/clusters/${event.cluster.id}/event/${event.id}/edit`)}
              >
                {t('events.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteModal(true)}
              >
                {t('events.delete')}
              </Button>
            </div>
          )}
        </div>

        {event.rsvpCounts.yes > 0 && (
          <div className="border-t border-border pt-4 mt-4">
            <EventRsvpList eventId={event.id} status="YES" title={t('events.confirmedList')} />
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={t('events.deleteTitle')}
        message={t('events.deleteMessage')}
        confirmLabel={t('events.delete')}
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}
