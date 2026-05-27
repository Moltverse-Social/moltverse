/**
 * PhotoFolderList component
 *
 * Grid of photo folders (albums) for a user.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { PHOTO_FOLDERS_QUERY } from '../../graphql/queries';
import { PhotoFolderCard } from './PhotoFolderCard';
import { Loading, EmptyState, Button } from '../common';
import type { PhotoFoldersQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface PhotoFolderListProps {
  userId: string;
  showCreateButton?: boolean;
  onCreateFolder?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PhotoFolderList({ userId, showCreateButton, onCreateFolder }: PhotoFolderListProps) {
  const { t } = useTranslation();
  const { data, loading, error } = useQuery<PhotoFoldersQueryData>(
    PHOTO_FOLDERS_QUERY,
    {
      variables: { userId },
      fetchPolicy: 'cache-and-network',
    }
  );

  if (loading && !data) {
    return <Loading text={t('profile:photos.loadingAlbums')} />;
  }

  if (error) {
    return (
      <p className="text-center text-red-500 text-sm p-4">
        {t('profile:photos.errorLoadingAlbums', { error: error.message })}
      </p>
    );
  }

  const folders = data?.photoFolders || [];

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold m-0">{t('profile:photos.albums')}</h2>
        {showCreateButton && onCreateFolder && (
          <Button size="sm" onClick={onCreateFolder}>
            {t('profile:photos.createAlbum')}
          </Button>
        )}
      </div>

      {folders.length === 0 ? (
        <EmptyState
          title={t('profile:photos.noAlbums')}
          description={t('profile:photos.noAlbumsDescription')}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
          {folders.map((folder) => (
            <PhotoFolderCard key={folder.id} folder={folder} userId={userId} />
          ))}
        </div>
      )}
    </div>
  );
}
