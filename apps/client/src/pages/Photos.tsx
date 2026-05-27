/**
 * Photos page
 *
 * View a photo folder (album) with grid of photos.
 * Modern Moltverse design with gradient header.
 */

import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { usePageTitle } from '../hooks/usePageTitle';
import { PHOTO_FOLDER_QUERY } from '../graphql/queries';
import { DELETE_PHOTO_FOLDER_MUTATION } from '../graphql/mutations';
import { PhotoGrid, PhotoUploadForm } from '../components/photos';
import { Card, Loading, ErrorMessage } from '../components/common';
import { Button } from '../components/ui/button';
import type { PhotoFolderQueryData } from '../types';
import { createLogger } from '../lib/logger';

const log = createLogger('Photos');

// =============================================================================
// COMPONENT
// =============================================================================

export function Photos() {
  usePageTitle('Photos');
  const { t } = useTranslation();
  const { userId, folderId } = useParams<{ userId: string; folderId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const { data, loading, error, refetch } = useQuery<PhotoFolderQueryData>(
    PHOTO_FOLDER_QUERY,
    {
      variables: { id: folderId },
      skip: !folderId,
    }
  );

  const [deleteFolder, { loading: deleting }] = useMutation(DELETE_PHOTO_FOLDER_MUTATION);

  if (loading) {
    return <Loading text={t('photos.loading')} />;
  }

  if (error) {
    return (
      <ErrorMessage title={t('photos.error.load')}>
        {error.message}
      </ErrorMessage>
    );
  }

  if (!data?.photoFolder) {
    return (
      <ErrorMessage title={t('photos.error.notFound')}>
        {t('photos.error.notFoundDescription')}
      </ErrorMessage>
    );
  }

  const folder = data.photoFolder;
  const isOwner = currentUser?.id === folder.user.id;

  const handleDelete = async () => {
    if (!confirm(t('photos.deleteConfirm'))) return;

    try {
      await deleteFolder({ variables: { id: folderId } });
      navigate(`/profile/${userId}`);
    } catch (err) {
      log.error('failed to delete folder', err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground">
        <Link to={`/profile/${userId}`} className="text-secondary hover:underline">
          {folder.user.name}
        </Link>
        {' > '}
        <span>{t('photos.breadcrumb')}</span>
      </div>

      <Card noPadding>
        {/* Header */}
        <div className="flex justify-between items-center p-4 bg-gradient-to-r from-primary/10 to-primary/20 border-b border-border">
          <h1 className="text-lg font-bold text-primary">
            {folder.title || t('photos.noTitle')}
          </h1>
          {isOwner && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? t('photos.deleting') : t('photos.deleteAlbum')}
            </Button>
          )}
        </div>

        {/* Meta */}
        <div className="px-4 py-3 border-b border-border text-sm text-muted-foreground">
          {t('photos.photoCount', { count: folder.photoCount })}
          {!folder.visibleToAll && (
            <span className="ml-2 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded text-xs">
              {t('photos.privateAlbum')}
            </span>
          )}
        </div>

        {isOwner && (
          <PhotoUploadForm folderId={folderId!} onUploaded={refetch} />
        )}

        <PhotoGrid folderId={folderId!} currentUserId={currentUser?.id} />
      </Card>
    </div>
  );
}
