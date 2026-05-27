/**
 * PhotoModal component
 *
 * Fullscreen photo viewer with comments.
 */

import { useEffect, useCallback } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { DELETE_PHOTO_MUTATION } from '../../graphql/mutations';
import { PhotoCommentList } from './PhotoCommentList';
import { Button } from '../common';
import { useCanWrite } from '../../hooks';
import type { Photo } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PhotoModalProps {
  photo: Photo;
  currentUserId?: string;
  onClose: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  onPhotoDeleted: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PhotoModal({
  photo,
  currentUserId,
  onClose,
  onNavigate,
  onPhotoDeleted,
}: PhotoModalProps) {
  const { t } = useTranslation();
  const [deletePhoto, { loading: deleting }] = useMutation(DELETE_PHOTO_MUTATION);

  const canWrite = useCanWrite();
  const isOwner = canWrite && currentUserId === photo.user.id;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        onNavigate('prev');
      } else if (e.key === 'ArrowRight') {
        onNavigate('next');
      }
    },
    [onClose, onNavigate]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleDelete = async () => {
    if (!confirm(t('profile:photos.confirmDeletePhoto'))) return;

    try {
      await deletePhoto({ variables: { id: photo.id } });
      onPhotoDeleted();
      onClose();
    } catch (err) {
      console.error('Failed to delete photo:', err);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div
      onClick={handleOverlayClick}
      className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-[95vw] max-w-[1400px] h-[90vh] bg-card rounded-lg overflow-hidden"
      >
        {/* Photo Section */}
        <div className="flex-1 flex items-center justify-center bg-black relative min-w-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 bg-white/20 border-none text-white text-2xl w-10 h-10 rounded-full cursor-pointer transition-colors hover:bg-white/30 z-10"
          >
            &#x2715;
          </button>
          <button
            onClick={() => onNavigate('prev')}
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-white/20 border-none text-white text-3xl py-4 px-2 cursor-pointer transition-colors hover:bg-white/30 rounded-r"
          >
            &#x276E;
          </button>
          <img
            src={photo.url}
            alt={photo.description || t('profile:photos.photo')}
            className="max-w-full max-h-full object-contain"
          />
          <button
            onClick={() => onNavigate('next')}
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-white/20 border-none text-white text-3xl py-4 px-2 cursor-pointer transition-colors hover:bg-white/30 rounded-l"
          >
            &#x276F;
          </button>
        </div>

        {/* Sidebar */}
        <div className="w-[350px] flex flex-col border-l border-border max-md:hidden">
          <div className="p-4 border-b border-border">
            {photo.description && (
              <p className="text-sm text-foreground m-0 mb-2">{photo.description}</p>
            )}
            <span className="text-xs text-muted-foreground">
              {t('profile:photos.addedOn', { date: formatDate(photo.createdAt) })}
            </span>

            {isOwner && (
              <div className="flex gap-2 mt-3">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? t('profile:photos.deleting') : t('profile:photos.deletePhoto')}
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <PhotoCommentList photoId={photo.id} currentUserId={currentUserId} />
          </div>
        </div>
      </div>
    </div>
  );
}
