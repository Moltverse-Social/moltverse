/**
 * PendingTestimonialItem component
 *
 * Displays a pending testimonial with approve/reject buttons.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { Avatar, Button } from '../common';
import {
  APPROVE_TESTIMONIAL_MUTATION,
  REJECT_TESTIMONIAL_MUTATION,
} from '../../graphql/mutations';
import { PENDING_TESTIMONIALS_QUERY } from '../../graphql/queries';
import type { Testimonial } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PendingTestimonialItemProps {
  testimonial: Testimonial;
  onHandled?: () => void;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PendingTestimonialItem({
  testimonial,
  onHandled,
}: PendingTestimonialItemProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const refetchQueries = [{ query: PENDING_TESTIMONIALS_QUERY }];

  const [approveTestimonial, { loading: approving }] = useMutation(
    APPROVE_TESTIMONIAL_MUTATION,
    {
      variables: { id: testimonial.id },
      refetchQueries,
      onCompleted: () => onHandled?.(),
      onError: (err) => setError(err.message),
    }
  );

  const [rejectTestimonial, { loading: rejecting }] = useMutation(
    REJECT_TESTIMONIAL_MUTATION,
    {
      variables: { id: testimonial.id },
      refetchQueries,
      onCompleted: () => onHandled?.(),
      onError: (err) => setError(err.message),
    }
  );

  const isLoading = approving || rejecting;

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border last:border-b-0">
      <div className="flex items-center gap-3">
        <Link to={`/profile/${testimonial.sender.id}`} className="flex-shrink-0">
          <Avatar
            src={testimonial.sender.profilePicture}
            name={testimonial.sender.name}
            size="md"
          />
        </Link>

        <div className="flex-1 min-w-0">
          <Link
            to={`/profile/${testimonial.sender.id}`}
            className="block text-sm font-semibold text-secondary hover:underline"
          >
            {testimonial.sender.name}
          </Link>
          <span className="text-xs text-muted-foreground">{formatDate(testimonial.createdAt)}</span>
        </div>
      </div>

      <p className="m-0 p-3 text-sm text-foreground whitespace-pre-wrap break-words italic bg-muted rounded">
        <span className="text-secondary text-lg font-bold">"</span>
        {' '}{testimonial.body}{' '}
        <span className="text-secondary text-lg font-bold">"</span>
      </p>

      {error && <span className="text-xs text-red-500">{error}</span>}

      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => approveTestimonial()}
          isLoading={approving}
          disabled={isLoading}
        >
          {t('profile:testimonials.approve')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => rejectTestimonial()}
          isLoading={rejecting}
          disabled={isLoading}
        >
          {t('profile:testimonials.reject')}
        </Button>
      </div>
    </div>
  );
}
