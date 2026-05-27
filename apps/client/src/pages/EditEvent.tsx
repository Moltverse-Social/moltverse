/**
 * EditEvent page
 *
 * Edit an existing event.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { EVENT_QUERY, CLUSTER_QUERY } from '../graphql/queries';
import { UPDATE_EVENT_MUTATION } from '../graphql/mutations';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Button } from '../components/ui/button';
import { Loading, ErrorMessage, ImageUpload } from '../components/common';
import type { EventQueryData, ClusterQueryData, UpdateEventMutationData } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

export function EditEvent() {
  usePageTitle('Edit Event');
  const { t } = useTranslation(['cluster', 'forms', 'common']);
  const navigate = useNavigate();
  const { clusterId, eventId } = useParams<{ clusterId: string; eventId: string }>();
  const { user: currentUser } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [picture, setPicture] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: eventData, loading: loadingEvent, error: eventError } = useQuery<EventQueryData>(
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

  const [updateEvent, { loading: updating }] = useMutation<UpdateEventMutationData>(
    UPDATE_EVENT_MUTATION,
    {
      onCompleted: () => {
        navigate(`/clusters/${clusterId}/event/${eventId}`);
      },
      onError: (err) => {
        setError(err.message);
      },
    }
  );

  // Populate form with existing data
  useEffect(() => {
    if (eventData?.event) {
      const event = eventData.event;
      setTitle(event.title);
      setDescription(event.description || '');
      setLocation(event.location || '');
      setPicture(event.picture || '');

      // Parse eventDate to separate date and time
      if (event.eventDate) {
        const date = new Date(event.eventDate);
        setEventDate(date.toISOString().split('T')[0]);
        setEventTime(date.toTimeString().slice(0, 5));
      }
    }
  }, [eventData]);

  if (loadingEvent) {
    return <Loading text={t('common:states.loading')} />;
  }

  if (eventError) {
    return (
      <ErrorMessage title={t('cluster:events.error.load')}>
        {eventError.message}
      </ErrorMessage>
    );
  }

  if (!eventData?.event) {
    return (
      <ErrorMessage title={t('cluster:events.error.notFound')}>
        {t('cluster:events.error.notFoundDescription')}
      </ErrorMessage>
    );
  }

  const event = eventData.event;
  const cluster = clusterData?.cluster;
  const isCreator = event.creator.id === currentUser?.id;
  const isModerator = cluster?.isModerator || false;
  const canEdit = isCreator || isModerator || cluster?.isCreator;

  if (!canEdit) {
    return (
      <ErrorMessage title={t('common:errors.unauthorized')}>
        {t('cluster:events.error.cannotEdit')}
      </ErrorMessage>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !eventDate || !eventTime) {
      setError(t('forms:event.requiredFields'));
      return;
    }

    setError(null);
    const dateTimeString = `${eventDate}T${eventTime}:00`;

    updateEvent({
      variables: {
        id: eventId,
        input: {
          title: title.trim(),
          description: description.trim() || null,
          eventDate: dateTimeString,
          location: location.trim() || null,
          picture: picture.trim() || null,
        },
      },
    });
  };

  const handleCancel = () => {
    navigate(`/clusters/${clusterId}/event/${eventId}`);
  };

  const isValid = title.trim() && eventDate && eventTime;

  return (
    <div className="max-w-xl mx-auto">
      <Card className="border-t-4 border-t-primary overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-muted">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <CalendarClock size={24} className="text-primary" />
            {t('cluster:events.edit')}
          </h1>
        </div>

        {/* Form */}
        <CardContent className="p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium text-foreground">
                {t('forms:event.title')} *
              </label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('forms:event.titlePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium text-foreground">
                {t('forms:event.description')}
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('forms:event.descriptionPlaceholder')}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="eventDate" className="text-sm font-medium text-foreground">
                  {t('forms:event.date')} *
                </label>
                <Input
                  id="eventDate"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="eventTime" className="text-sm font-medium text-foreground">
                  {t('forms:event.time')} *
                </label>
                <Input
                  id="eventTime"
                  type="time"
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="location" className="text-sm font-medium text-foreground">
                {t('forms:event.location')}
              </label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t('forms:event.locationPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <ImageUpload
                preset="event"
                currentUrl={picture || undefined}
                onUpload={(url) => setPicture(url)}
                label={t('forms:event.picture')}
              />
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleCancel}>
                {t('common:buttons.cancel')}
              </Button>
              <Button
                type="submit"
                className="bg-primary hover:bg-primary/90"
                disabled={!isValid || updating}
              >
                {updating ? t('common:states.loading') : t('common:buttons.save')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
