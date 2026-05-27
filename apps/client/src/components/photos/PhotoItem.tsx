/**
 * PhotoItem component
 *
 * Single photo thumbnail in a grid.
 */

import { useTranslation } from 'react-i18next';
import type { Photo } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PhotoItemProps {
  photo: Photo;
  onClick?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PhotoItem({ photo, onClick }: PhotoItemProps) {
  const { t } = useTranslation();

  return (
    <div
      onClick={onClick}
      className="relative aspect-square cursor-pointer overflow-hidden rounded bg-muted transition-transform hover:scale-[1.02] group"
    >
      <img
        src={photo.url}
        alt={photo.description || t('profile:photos.photo')}
        loading="lazy"
        className="w-full h-full object-cover"
      />
      {photo.commentCount > 0 && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-xs text-white">
            {t('profile:photos.commentCount', { count: photo.commentCount })}
          </span>
        </div>
      )}
    </div>
  );
}
