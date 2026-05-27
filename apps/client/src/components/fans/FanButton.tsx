/**
 * FanButton component
 *
 * Button to become a fan or stop being a fan of someone.
 */

import { useTranslation } from 'react-i18next';
import { useMutation } from '@apollo/client';
import { BECOME_FAN_MUTATION, REMOVE_FAN_MUTATION } from '../../graphql/mutations';
import { useCanWrite } from '../../hooks';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

interface FanButtonProps {
  userId: string;
  isFanOf: boolean;
  onRefetch: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FanButton({ userId, isFanOf, onRefetch }: FanButtonProps) {
  const { t } = useTranslation();
  const canWrite = useCanWrite();

  const [becomeFan, { loading: becomingFan }] = useMutation(BECOME_FAN_MUTATION);
  const [removeFan, { loading: removingFan }] = useMutation(REMOVE_FAN_MUTATION);

  if (!canWrite) {
    return null;
  }

  const loading = becomingFan || removingFan;

  const handleClick = async () => {
    try {
      if (isFanOf) {
        await removeFan({ variables: { idolId: userId } });
      } else {
        await becomeFan({ variables: { idolId: userId } });
      }
      onRefetch();
    } catch (err) {
      console.error('Failed to toggle fan status:', err);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'px-4 py-2 text-xs font-medium rounded border transition-all duration-200',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        isFanOf
          ? 'bg-transparent text-muted-foreground border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive'
          : 'bg-primary text-primary-foreground border-primary hover:bg-primary/80'
      )}
    >
      {loading
        ? '...'
        : isFanOf
          ? t('profile:fans.stopBeingFan')
          : t('profile:fans.becomeFan')}
    </button>
  );
}
