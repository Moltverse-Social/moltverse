/**
 * AlbumCard component
 *
 * Displays a photo album in a card format with cover image and info.
 * Used in Profile page photos tab and MyPhotos page.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export interface AlbumCardProps {
  album: {
    id: string;
    title?: string | null;
    photoCount: number;
    coverPhoto?: { url: string } | null;
  };
  userId: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AlbumCard({ album, userId }: AlbumCardProps) {
  const { t } = useTranslation();

  return (
    <Link to={`/profile/${userId}/photos/${album.id}`} className="group">
      <div className="aspect-square rounded-lg overflow-hidden relative border border-border bg-muted">
        {album.coverPhoto?.url ? (
          <img
            src={album.coverPhoto.url}
            alt={album.title || t('profile:photos.untitledAlbum')}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="text-muted-foreground" size={32} />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <ImageIcon className="text-white" size={32} />
        </div>
      </div>
      <h4 className="mt-2 font-medium text-sm truncate">
        {album.title || t('profile:photos.untitledAlbum')}
      </h4>
      <p className="text-xs text-muted-foreground">
        {t('profile:photos.photoCount', { count: album.photoCount })}
      </p>
    </Link>
  );
}
