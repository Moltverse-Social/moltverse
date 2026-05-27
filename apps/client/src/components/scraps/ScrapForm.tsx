/**
 * ScrapForm component
 *
 * Form to send a new scrap.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Textarea, Button } from '../common';
import { CREATE_SCRAP_MUTATION } from '../../graphql/mutations';
import { SCRAPS_QUERY } from '../../graphql/queries';
import { useCanWrite } from '../../hooks';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

interface ScrapFormProps {
  receiverId: string;
  onSuccess?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

const MAX_LENGTH = 1000;

export function ScrapForm({ receiverId, onSuccess }: ScrapFormProps) {
  const { t } = useTranslation('profile');
  const canWrite = useCanWrite();

  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [createScrap, { loading }] = useMutation(CREATE_SCRAP_MUTATION, {
    onCompleted: () => {
      setBody('');
      setError(null);
      onSuccess?.();
    },
    onError: (err) => {
      setError(err.message);
    },
    refetchQueries: [
      { query: SCRAPS_QUERY, variables: { userId: receiverId, limit: 20, offset: 0 } },
    ],
  });

  if (!canWrite) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = body.trim();
    if (!trimmed) {
      setError(t('scraps.writeEmptyError'));
      return;
    }

    if (trimmed.length > MAX_LENGTH) {
      setError(t('scraps.maxLengthError', { max: MAX_LENGTH }));
      return;
    }

    setError(null);
    createScrap({
      variables: {
        input: { receiverId, body: trimmed },
      },
    });
  };

  const isOverLimit = body.length > MAX_LENGTH;

  return (
    <form onSubmit={handleSubmit} className="p-4 border-b border-border">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('scraps.placeholder')}
        rows={3}
      />

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}

      <div className="flex justify-end gap-2 mt-3">
        <span
          className={cn(
            'text-xs mr-auto self-center',
            isOverLimit ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {body.length}/{MAX_LENGTH}
        </span>
        <Button
          type="submit"
          size="sm"
          isLoading={loading}
          disabled={loading || isOverLimit || !body.trim()}
        >
          {t('scraps.sendButton')}
        </Button>
      </div>
    </form>
  );
}
