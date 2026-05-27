/**
 * My Photos page
 *
 * Grid of photo albums (folders) with create new album option.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from '@apollo/client';
import { Image as ImageIcon, X, Plus, ArrowRight } from 'lucide-react';
import { useDisplayUser } from '../hooks/useDisplayUser';
import { useObserver } from '../hooks/useObserver';
import { useCanWrite } from '../hooks/useCanWrite';
import { usePageTitle } from '../hooks/usePageTitle';
import { PHOTO_FOLDERS_QUERY } from '../graphql/queries';
import { CREATE_PHOTO_FOLDER_MUTATION } from '../graphql/mutations';
import { Loading } from '../components/common/Loading';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useToast } from '../components/ui/use-toast';
import type { PhotoFoldersQueryData } from '../types';

// =============================================================================
// ALBUM CARD COMPONENT
// =============================================================================

interface AlbumCardProps {
  album: {
    id: string;
    title: string | null;
    photoCount: number;
    coverPhoto?: { url: string } | null;
    user: { id: string };
  };
}

function AlbumCard({ album }: AlbumCardProps) {
  const { t } = useTranslation();
  const coverUrl = album.coverPhoto?.url;
  const albumTitle = album.title || 'Untitled Album';

  return (
    <Link
      to={`/profile/${album.user.id}/photos/${album.id}`}
      className="group relative bg-card p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="aspect-[4/3] rounded bg-muted overflow-hidden relative">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={albumTitle}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary/20 to-accent/20">
            <ImageIcon size={48} className="text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-white font-bold flex items-center gap-2">
            <ImageIcon size={20} /> {t('photos.viewAlbum', { defaultValue: 'View Album' })}
          </span>
        </div>
      </div>
      <div className="mt-3">
        <h3 className="font-bold text-foreground">{albumTitle}</h3>
        <p className="text-xs text-muted-foreground">
          {t('photos.photoCount', { count: album.photoCount, defaultValue: '{{count}} photos' })}
        </p>
      </div>
      {/* Stack effect */}
      <div className="absolute top-2 right-2 -z-10 w-full h-full bg-card border rounded-lg translate-x-1 translate-y-1" />
    </Link>
  );
}

// =============================================================================
// CREATE ALBUM MODAL (proper implementation)
// =============================================================================

interface CreateAlbumModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateAlbumModal({ onClose, onCreated }: CreateAlbumModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [visibleToAll, setVisibleToAll] = useState(true);

  const [createFolder, { loading }] = useMutation(CREATE_PHOTO_FOLDER_MUTATION, {
    onCompleted: () => {
      toast({
        title: t('photos.albumCreated', { defaultValue: 'Album Created' }),
        description: t('photos.albumCreatedDesc', { defaultValue: 'Your new album has been created.' }),
      });
      onCreated();
    },
    onError: (error) => {
      toast({
        title: t('common:errors.error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createFolder({
      variables: {
        title: title.trim(),
        visibleToAll,
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-xl max-w-md w-full animate-in fade-in slide-in-from-bottom-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-lg">{t('photos.createAlbum', { defaultValue: 'Create New Album' })}</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('photos.albumTitle', { defaultValue: 'Album Title' })}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('photos.albumTitlePlaceholder', { defaultValue: 'Enter album name...' })}
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="visibleToAll"
              checked={visibleToAll}
              onChange={(e) => setVisibleToAll(e.target.checked)}
              className="w-4 h-4 text-secondary border-border rounded focus:ring-secondary"
            />
            <label htmlFor="visibleToAll" className="text-sm text-muted-foreground">
              {t('photos.visibleToAll', { defaultValue: 'Visible to everyone' })}
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common:buttons.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="submit" disabled={loading || !title.trim()} className="bg-primary hover:bg-primary/90">
              {loading ? t('common:states.loading') : t('common:buttons.create', { defaultValue: 'Create' })}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// CREATE ALBUM PLACEHOLDER
// =============================================================================

interface CreateAlbumPlaceholderProps {
  onClick: () => void;
}

function CreateAlbumPlaceholder({ onClick }: CreateAlbumPlaceholderProps) {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClick}
      className="border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center p-6 text-muted-foreground hover:border-secondary hover:text-secondary hover:bg-secondary/10 transition-colors cursor-pointer min-h-[200px]"
    >
      <Plus size={48} className="mb-2" />
      <span className="font-bold">{t('photos.createAlbum', { defaultValue: 'Create New Album' })}</span>
    </button>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function MyPhotos() {
  usePageTitle('My Photos');
  const { t } = useTranslation();
  const { displayUser, isLoading: displayLoading } = useDisplayUser();
  const { isObserver: hasObserverSession } = useObserver();
  const canWrite = useCanWrite();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, loading, refetch } = useQuery<PhotoFoldersQueryData>(PHOTO_FOLDERS_QUERY, {
    variables: { userId: displayUser?.id },
    skip: !displayUser?.id,
  });

  // Loading state
  if (displayLoading) {
    return <Loading text={t('common:states.loading')} />;
  }

  if (!displayUser) {
    if (hasObserverSession) {
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4">
          <div className="bg-card rounded-xl border border-border p-8 max-w-md text-center space-y-4">
            <ImageIcon size={48} className="mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold font-display text-primary">
              {t('photos.myPhotos', { defaultValue: 'My Photos' })}
            </h2>
            <p className="text-muted-foreground">
              {t('common:observer.personalFeatureUnavailable')}
            </p>
            <Link to="/clusters">
              <Button variant="outline" className="gap-2">
                {t('common:observer.exploreClusters')}
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>
      );
    }
    return null;
  }

  const albums = data?.photoFolders || [];
  const isLoading = loading && !data;

  const handleAlbumCreated = () => {
    setShowCreateModal(false);
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold font-display text-primary">
        {t('photos.myPhotos', { defaultValue: 'My Photos' })}
      </h1>

      {/* Albums Grid */}
      {isLoading ? (
        <Loading text={t('common:states.loading')} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}

          {/* Create Album Placeholder - only show for users who can write */}
          {canWrite && <CreateAlbumPlaceholder onClick={() => setShowCreateModal(true)} />}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && albums.length === 0 && !canWrite && (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">
          {t('photos.noAlbums', { defaultValue: 'No photo albums yet.' })}
        </div>
      )}

      {/* Create Album Modal */}
      {showCreateModal && (
        <CreateAlbumModal onClose={() => setShowCreateModal(false)} onCreated={handleAlbumCreated} />
      )}
    </div>
  );
}
