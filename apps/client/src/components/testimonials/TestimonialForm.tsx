/**
 * TestimonialForm component
 *
 * Form to write a testimonial (only for friends).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@apollo/client';
import { Textarea, Button } from '../common';
import { CREATE_TESTIMONIAL_MUTATION } from '../../graphql/mutations';
import { useCanWrite } from '../../hooks';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

interface TestimonialFormProps {
  receiverId: string;
  isFriend: boolean;
  onSuccess?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

const MAX_LENGTH = 1000;

export function TestimonialForm({
  receiverId,
  isFriend,
  onSuccess,
}: TestimonialFormProps) {
  const { t } = useTranslation();
  const canWrite = useCanWrite();

  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [createTestimonial, { loading }] = useMutation(
    CREATE_TESTIMONIAL_MUTATION,
    {
      onCompleted: () => {
        setBody('');
        setError(null);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 5000);
        onSuccess?.();
      },
      onError: (err) => {
        setError(err.message);
        setSuccess(false);
      },
    }
  );

  if (!canWrite) {
    return null;
  }

  if (!isFriend) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground italic border-b border-border">
        {t('profile:testimonials.onlyFriends')}
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = body.trim();
    if (!trimmed) {
      setError(t('profile:testimonials.errorEmpty'));
      return;
    }

    if (trimmed.length > MAX_LENGTH) {
      setError(t('profile:testimonials.errorMaxLength', { max: MAX_LENGTH }));
      return;
    }

    setError(null);
    createTestimonial({
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
        placeholder={t('profile:testimonials.placeholder')}
        rows={4}
      />

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {success && (
        <p className="mt-2 text-xs text-green-600">
          {t('profile:testimonials.successMessage')}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {t('profile:testimonials.hint')}
      </p>

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
          {t('profile:testimonials.write')}
        </Button>
      </div>
    </form>
  );
}
