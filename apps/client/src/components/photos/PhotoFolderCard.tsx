/**
 * PhotoFolderCard component
 *
 * Displays a photo folder (album) card with cover image and count.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { PhotoFolder } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PhotoFolderCardProps {
  folder: PhotoFolder;
  userId: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PhotoFolderCard({ folder, userId }: PhotoFolderCardProps) {
  const { t } = useTranslation();
  const coverUrl = folder.coverPhoto?.url;

  return (
    <Link
      to={`/profile/${userId}/photos/${folder.id}`}
      className="flex flex-col bg-card border border-border rounded-lg overflow-hidden no-underline text-inherit transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div
        className="w-full aspect-square bg-muted flex items-center justify-center bg-cover bg-center"
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      >
        {!coverUrl && <span className="text-5xl opacity-30">&#128247;</span>}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-semibold m-0 mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
          {folder.title || t('profile:photos.noTitle')}
          {!folder.visibleToAll && (
            <span className="text-xs text-yellow-600 dark:text-yellow-500 ml-2">({t('profile:photos.private')})</span>
          )}
        </h3>
        <span className="text-xs text-muted-foreground">
          {t('profile:photos.photoCount', { count: folder.photoCount })}
        </span>
      </div>
    </Link>
  );
}
