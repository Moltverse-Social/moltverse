/**
 * EventForm component
 *
 * Form to create a new event.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Input, Textarea, Button } from '../common';
import { CREATE_EVENT_MUTATION } from '../../graphql/mutations';
import { EVENTS_QUERY } from '../../graphql/queries';
import { useCanWrite } from '../../hooks';
import type { CreateEventMutationData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface EventFormProps {
  clusterId: string;
  onCreated?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EventForm({ clusterId, onCreated }: EventFormProps) {
  const { t } = useTranslation(['cluster', 'forms']);
  const canWrite = useCanWrite();

  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [picture, setPicture] = useState('');

  const [createEvent, { loading }] = useMutation<CreateEventMutationData>(
    CREATE_EVENT_MUTATION,
    {
      onCompleted: () => {
        setTitle('');
        setDescription('');
        setEventDate('');
        setEventTime('');
        setLocation('');
        setPicture('');
        setIsExpanded(false);
        onCreated?.();
      },
      refetchQueries: [
        { query: EVENTS_QUERY, variables: { clusterId, upcoming: false, limit: 20, offset: 0 } },
      ],
    }
  );

  if (!canWrite) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !eventDate || !eventTime) return;

    const dateTimeString = `${eventDate}T${eventTime}:00`;

    createEvent({
      variables: {
        input: {
          clusterId,
          title: title.trim(),
          description: description.trim() || undefined,
          eventDate: dateTimeString,
          location: location.trim() || undefined,
          picture: picture.trim() || undefined,
        },
      },
    });
  };

  if (!isExpanded) {
    return (
      <button
        className="px-2 py-2 text-sm text-secondary bg-transparent border-none cursor-pointer text-left hover:underline"
        onClick={() => setIsExpanded(true)}
      >
        {t('cluster:events.createNew')}
      </button>
    );
  }

  const isValid = title.trim() && eventDate && eventTime;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('forms:event.titlePlaceholder')}
        required
      />

      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('forms:event.descriptionPlaceholder')}
        rows={3}
      />

      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <Input
          type="date"
          label={t('forms:event.date')}
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          required
        />
        <Input
          type="time"
          label={t('forms:event.time')}
          value={eventTime}
          onChange={(e) => setEventTime(e.target.value)}
          required
        />
      </div>

      <Input
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder={t('forms:event.locationPlaceholder')}
      />

      <Input
        value={picture}
        onChange={(e) => setPicture(e.target.value)}
        placeholder={t('forms:event.picturePlaceholder')}
      />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(false)}
        >
          {t('forms:event.cancel')}
        </Button>
        <Button type="submit" size="sm" isLoading={loading} disabled={!isValid}>
          {t('forms:event.submit')}
        </Button>
      </div>
    </form>
  );
}
