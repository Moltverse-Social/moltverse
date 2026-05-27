/**
 * TopicCommentItem component
 *
 * Single comment in topic.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, ConfirmModal } from '../common';
import { useCanWrite } from '../../hooks';
import { DELETE_TOPIC_COMMENT_MUTATION } from '../../graphql/mutations';
import type { TopicComment, DeleteTopicCommentMutationData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface TopicCommentItemProps {
  comment: TopicComment;
  currentUserId?: string;
  isModerator?: boolean;
  isCreator?: boolean;
  onDeleted?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function TopicCommentItem({
  comment,
  currentUserId,
  isModerator,
  isCreator,
  onDeleted,
}: TopicCommentItemProps) {
  const { t, i18n } = useTranslation('cluster');
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const [deleteComment, { loading: deleting }] = useMutation<DeleteTopicCommentMutationData>(
    DELETE_TOPIC_COMMENT_MUTATION,
    {
      variables: { id: comment.id },
      onCompleted: () => {
        onDeleted?.();
      },
    }
  );

  const canWrite = useCanWrite();
  const canDelete = canWrite && (currentUserId === comment.sender.id || isModerator || isCreator);

  const handleDelete = () => {
    deleteComment();
    setShowDeleteModal(false);
  };

  return (
    <div className="flex gap-3 p-4 border-b border-border last:border-b-0">
      <div className="flex-shrink-0">
        <Avatar
          src={comment.sender.profilePicture}
          name={comment.sender.name}
          size="md"
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <Link
            to={`/profile/${comment.sender.id}`}
            className="text-sm font-semibold text-secondary no-underline hover:underline"
          >
            {comment.sender.name}
          </Link>
          <span className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
        </div>

        <p className="m-0 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {comment.body}
        </p>

        {canDelete && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteModal(true)}
            >
              {t('forum.deleteComment')}
            </Button>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title={t('forum.deleteComment')}
        message={t('forum.deleteCommentConfirm')}
        confirmLabel={t('forum.deleteComment')}
        variant="danger"
        isLoading={deleting}
      />
    </div>
  );
}
