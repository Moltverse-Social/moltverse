/**
 * PhotoGrid component
 *
 * Grid of photos from a folder.
 */

import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { PHOTOS_QUERY } from '../../graphql/queries';
import { PhotoItem } from './PhotoItem';
import { PhotoModal } from './PhotoModal';
import { Loading, EmptyState, Button } from '../common';
import type { PhotosQueryData, Photo } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PhotoGridProps {
  folderId: string;
  currentUserId?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 24;

export function PhotoGrid({ folderId, currentUserId }: PhotoGridProps) {
  const { t } = useTranslation();
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  const { data, loading, error, fetchMore, refetch } = useQuery<PhotosQueryData>(
    PHOTOS_QUERY,
    {
      variables: { folderId, limit: PAGE_SIZE, offset: 0 },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('profile:photos.loadingPhotos')} />;
  }

  if (error) {
    return (
      <p className="p-4 text-center text-red-500 text-sm">
        {t('profile:photos.errorLoadingPhotos', { error: error.message })}
      </p>
    );
  }

  const photos = data?.photos.nodes || [];
  const hasMore = data?.photos.hasMore || false;
  const totalCount = data?.photos.totalCount || 0;

  if (photos.length === 0) {
    return (
      <EmptyState
        title={t('profile:photos.noPhotos')}
        description={t('profile:photos.noPhotosDescription')}
      />
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: photos.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          photos: {
            ...fetchMoreResult.photos,
            nodes: [...prev.photos.nodes, ...fetchMoreResult.photos.nodes],
          },
        };
      },
    });
  };

  const handlePhotoClick = (photo: Photo) => {
    setSelectedPhoto(photo);
  };

  const handleCloseModal = () => {
    setSelectedPhoto(null);
  };

  const handleNavigatePhoto = (direction: 'prev' | 'next') => {
    if (!selectedPhoto) return;

    const currentIndex = photos.findIndex((p) => p.id === selectedPhoto.id);
    if (currentIndex === -1) return;

    let newIndex: number;
    if (direction === 'prev') {
      newIndex = currentIndex > 0 ? currentIndex - 1 : photos.length - 1;
    } else {
      newIndex = currentIndex < photos.length - 1 ? currentIndex + 1 : 0;
    }

    setSelectedPhoto(photos[newIndex]);
  };

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2 p-4">
        {photos.map((photo) => (
          <PhotoItem
            key={photo.id}
            photo={photo}
            onClick={() => handlePhotoClick(photo)}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center p-4 border-t border-border">
          <Button variant="ghost" size="sm" onClick={handleLoadMore}>
            {t('common:buttons.loadMore')} ({photos.length} {t('common:of')} {totalCount})
          </Button>
        </div>
      )}

      {selectedPhoto && (
        <PhotoModal
          photo={selectedPhoto}
          currentUserId={currentUserId}
          onClose={handleCloseModal}
          onNavigate={handleNavigatePhoto}
          onPhotoDeleted={refetch}
        />
      )}
    </div>
  );
}
