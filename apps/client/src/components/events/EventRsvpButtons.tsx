/**
 * EventRsvpButtons component
 *
 * RSVP buttons (YES/MAYBE/NO) for events.
 */

import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { RSVP_EVENT_MUTATION, CANCEL_RSVP_MUTATION } from '../../graphql/mutations';
import { useCanWrite } from '../../hooks';
import { cn } from '../../lib/cn';
import type { RsvpEventMutationData, CancelRsvpMutationData, RsvpStatus } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface EventRsvpButtonsProps {
  eventId: string;
  currentRsvp: string | null;
  isPast: boolean;
  isMember: boolean;
  onRefetch?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function EventRsvpButtons({
  eventId,
  currentRsvp,
  isPast,
  isMember,
  onRefetch,
}: EventRsvpButtonsProps) {
  const { t } = useTranslation('cluster');
  const canWrite = useCanWrite();

  const [rsvpEvent, { loading: rsvping }] = useMutation<RsvpEventMutationData>(
    RSVP_EVENT_MUTATION,
    {
      onCompleted: () => onRefetch?.(),
    }
  );

  const [cancelRsvp, { loading: cancelling }] = useMutation<CancelRsvpMutationData>(
    CANCEL_RSVP_MUTATION,
    {
      variables: { eventId },
      onCompleted: () => onRefetch?.(),
    }
  );

  if (!canWrite) {
    return null;
  }

  const handleRsvp = (status: RsvpStatus) => {
    if (currentRsvp === status) return;

    rsvpEvent({
      variables: { eventId, status },
    });
  };

  const handleCancel = () => {
    cancelRsvp();
  };

  const isDisabled = !isMember || isPast || rsvping || cancelling;

  const buttonBase = 'px-4 py-2 text-sm font-medium rounded border-2 cursor-pointer transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        className={cn(
          buttonBase,
          currentRsvp === 'YES'
            ? 'bg-green-500 dark:bg-green-600 text-white border-green-500 dark:border-green-600'
            : 'bg-transparent text-foreground border-border hover:border-green-500 hover:text-green-500 dark:hover:border-green-400 dark:hover:text-green-400'
        )}
        onClick={() => handleRsvp('YES')}
        disabled={isDisabled}
      >
        {t('events.going')}
      </button>

      <button
        className={cn(
          buttonBase,
          currentRsvp === 'MAYBE'
            ? 'bg-amber-500 dark:bg-amber-600 text-white border-amber-500 dark:border-amber-600'
            : 'bg-transparent text-foreground border-border hover:border-amber-500 hover:text-amber-500 dark:hover:border-amber-400 dark:hover:text-amber-400'
        )}
        onClick={() => handleRsvp('MAYBE')}
        disabled={isDisabled}
      >
        {t('events.maybe')}
      </button>

      <button
        className={cn(
          buttonBase,
          currentRsvp === 'NO'
            ? 'bg-red-500 dark:bg-red-600 text-white border-red-500 dark:border-red-600'
            : 'bg-transparent text-foreground border-border hover:border-red-500 hover:text-red-500 dark:hover:border-red-400 dark:hover:text-red-400'
        )}
        onClick={() => handleRsvp('NO')}
        disabled={isDisabled}
      >
        {t('events.notGoing')}
      </button>

      {currentRsvp && !isPast && isMember && (
        <button
          className="px-2 py-2 text-xs text-muted-foreground bg-transparent border-none cursor-pointer hover:text-destructive hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {t('events.cancelResponse')}
        </button>
      )}
    </div>
  );
}
