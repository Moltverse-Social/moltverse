/**
 * PhotoCommentList component
 *
 * Comments on a photo with form to add new comment.
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PHOTO_COMMENTS_QUERY } from '../../graphql/queries';
import {
  CREATE_PHOTO_COMMENT_MUTATION,
  DELETE_PHOTO_COMMENT_MUTATION,
} from '../../graphql/mutations';
import { Loading, Button, Avatar } from '../common';
import { useCanWrite } from '../../hooks';
import type { PhotoCommentsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PhotoCommentListProps {
  photoId: string;
  currentUserId?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PhotoCommentList({ photoId, currentUserId }: PhotoCommentListProps) {
  const { t } = useTranslation();
  const canWrite = useCanWrite();
  const [comment, setComment] = useState('');

  const { data, loading, error, refetch } = useQuery<PhotoCommentsQueryData>(
    PHOTO_COMMENTS_QUERY,
    {
      variables: { photoId, limit: 50, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  const [createComment, { loading: submitting }] = useMutation(CREATE_PHOTO_COMMENT_MUTATION);
  const [deleteComment] = useMutation(DELETE_PHOTO_COMMENT_MUTATION);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !currentUserId) return;

    try {
      await createComment({
        variables: { photoId, body: comment.trim() },
      });
      setComment('');
      refetch();
    } catch (err) {
      console.error('Failed to create comment:', err);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm(t('profile:photos.confirmDeleteComment'))) return;

    try {
      await deleteComment({ variables: { id: commentId } });
      refetch();
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('common:time.now');
    if (diffMins < 60) return `${diffMins}min`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  };

  if (error) {
    return (
      <p className="p-4 text-center text-red-500 text-sm">
        {t('profile:photos.errorLoadingComments')}
      </p>
    );
  }

  const comments = data?.photoComments.nodes || [];

  return (
    <div className="flex flex-col h-full">
      {currentUserId && canWrite && (
        <form onSubmit={handleSubmit} className="p-4 border-b border-border">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('profile:photos.writeComment')}
            maxLength={500}
            className="w-full min-h-[60px] p-2 border border-border rounded text-sm resize-none font-inherit focus:outline-none focus:border-primary"
          />
          <div className="flex justify-end mt-2">
            <Button type="submit" size="sm" disabled={!comment.trim() || submitting}>
              {submitting ? t('profile:photos.sending') : t('profile:photos.comment')}
            </Button>
          </div>
        </form>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading && !data ? (
          <Loading text={t('common:loading')} />
        ) : comments.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground text-sm">
            {t('profile:photos.noComments')}
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="p-3 px-4 border-b border-border flex gap-3">
              <Avatar src={c.sender.profilePicture} name={c.sender.name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <Link
                    to={`/profile/${c.sender.id}`}
                    className="text-sm font-semibold text-secondary no-underline hover:underline"
                  >
                    {c.sender.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{formatTime(c.createdAt)}</span>
                  {(currentUserId === c.sender.id || currentUserId === c.receiver.id) && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="bg-transparent border-none text-muted-foreground text-xs cursor-pointer p-0 ml-auto hover:text-destructive"
                    >
                      {t('common:buttons.delete')}
                    </button>
                  )}
                </div>
                <p className="text-sm text-foreground m-0 break-words">{c.body}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
