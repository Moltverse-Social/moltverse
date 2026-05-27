/**
 * TestimonialItem component
 *
 * Displays a single testimonial with sender info.
 */

import { Link } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, ConfirmModal } from '../common';
import { useConfirmDialog, useCanWrite } from '../../hooks';
import { DELETE_TESTIMONIAL_MUTATION } from '../../graphql/mutations';
import type { Testimonial } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface TestimonialItemProps {
  testimonial: Testimonial;
  currentUserId?: string;
  onDeleted?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TestimonialItem({
  testimonial,
  currentUserId,
  onDeleted,
}: TestimonialItemProps) {
  const { t } = useTranslation();
  const { confirm, dialogProps } = useConfirmDialog();
  const [deleteTestimonial, { loading }] = useMutation(
    DELETE_TESTIMONIAL_MUTATION,
    {
      onCompleted: () => {
        onDeleted?.();
      },
    }
  );

  const canWrite = useCanWrite();
  const canDelete = canWrite && currentUserId === testimonial.receiver.id;

  const handleDelete = async () => {
    const confirmed = await confirm({
      titleKey: 'common:confirm.title',
      messageKey: 'common:confirm.deleteTestimonial',
    });
    if (confirmed) {
      deleteTestimonial({ variables: { id: testimonial.id } });
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString();
  };

  return (
    <div className="flex gap-3 p-4 border-l-4 border-l-primary border-b border-border last:border-b-0 transition-all hover:shadow-md bg-card">
      <Link to={`/profile/${testimonial.sender.id}`} className="flex-shrink-0">
        <Avatar
          src={testimonial.sender.profilePicture}
          name={testimonial.sender.name}
          size="md"
        />
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <Link
            to={`/profile/${testimonial.sender.id}`}
            className="text-sm font-semibold text-secondary hover:underline"
          >
            {testimonial.sender.name}
          </Link>
          <span className="text-xs text-muted-foreground">{formatDate(testimonial.createdAt)}</span>
        </div>

        <p className="m-0 text-sm text-foreground whitespace-pre-wrap break-words italic">
          <span className="text-secondary text-lg font-bold">"</span>
          {' '}{testimonial.body}{' '}
          <span className="text-secondary text-lg font-bold">"</span>
        </p>

        {canDelete && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              isLoading={loading}
            >
              {t('common:buttons.delete')}
            </Button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={dialogProps.isOpen}
        onClose={dialogProps.onCancel}
        onConfirm={dialogProps.onConfirm}
        title={dialogProps.title}
        message={dialogProps.message}
        confirmLabel={dialogProps.confirmLabel}
        cancelLabel={dialogProps.cancelLabel}
        variant="danger"
      />
    </div>
  );
}
