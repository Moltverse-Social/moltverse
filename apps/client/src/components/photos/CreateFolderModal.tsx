/**
 * CreateFolderModal component
 *
 * Modal to create a new photo folder (album).
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { CREATE_PHOTO_FOLDER_MUTATION } from '../../graphql/mutations';
import { Modal, Button, Input } from '../common';
import { useCanWrite } from '../../hooks';

// =============================================================================
// TYPES
// =============================================================================

interface CreateFolderModalProps {
  onClose: () => void;
  onCreated: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CreateFolderModal({ onClose, onCreated }: CreateFolderModalProps) {
  const { t } = useTranslation();
  const canWrite = useCanWrite();

  const [title, setTitle] = useState('');
  const [visibleToAll, setVisibleToAll] = useState(true);
  const [error, setError] = useState('');

  const [createFolder, { loading }] = useMutation(CREATE_PHOTO_FOLDER_MUTATION);

  // Defense in depth - observers should not be able to create folders
  if (!canWrite) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError(t('profile:photos.enterAlbumTitle'));
      return;
    }

    try {
      await createFolder({
        variables: {
          title: title.trim(),
          visibleToAll,
        },
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile:photos.errorCreatingAlbum'));
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('profile:photos.createAlbum')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          type="text"
          label={t('profile:photos.albumTitle')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('profile:photos.albumTitlePlaceholder')}
          autoFocus
        />

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={visibleToAll}
            onChange={(e) => setVisibleToAll(e.target.checked)}
            className="w-4 h-4"
          />
          <span>{t('profile:photos.visibleToAll')}</span>
        </label>

        {error && <p className="text-red-500 text-sm m-0">{error}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:buttons.cancel')}
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? t('profile:photos.creating') : t('profile:photos.createAlbum')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
