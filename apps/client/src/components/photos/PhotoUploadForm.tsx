/**
 * PhotoUploadForm component
 *
 * Form to upload a photo to a folder using drag & drop.
 * Uses ImageUpload component with Cloudinary integration.
 */

import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { UPLOAD_PHOTO_MUTATION } from '../../graphql/mutations';
import { Button, Textarea } from '../common';
import { ImageUpload } from '../common/ImageUpload';
import { useCanWrite } from '../../hooks';

// =============================================================================
// TYPES
// =============================================================================

interface PhotoUploadFormProps {
  folderId: string;
  onUploaded: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PhotoUploadForm({ folderId, onUploaded }: PhotoUploadFormProps) {
  const { t } = useTranslation();
  const canWrite = useCanWrite();

  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [uploadPhoto] = useMutation(UPLOAD_PHOTO_MUTATION);

  if (!canWrite) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!url.trim()) {
      setError(t('profile:photos.selectImage', { defaultValue: 'Please select an image' }));
      return;
    }

    setIsSubmitting(true);

    try {
      await uploadPhoto({
        variables: {
          folderId,
          url: url.trim(),
          description: description.trim() || null,
        },
      });
      setUrl('');
      setDescription('');
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile:photos.errorAddingPhoto'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = (uploadedUrl: string) => {
    setUrl(uploadedUrl);
    setError('');
  };

  const handleCancel = () => {
    setUrl('');
    setDescription('');
    setError('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-b border-border flex flex-col gap-4">
      {/* Image Upload */}
      <ImageUpload
        preset="photo"
        currentUrl={url || undefined}
        onUpload={handleImageUpload}
        label={t('profile:photos.uploadPhoto', { defaultValue: 'Upload Photo' })}
      />

      {/* Description */}
      {url && (
        <div className="flex flex-col gap-1">
          <Textarea
            label={t('profile:photos.descriptionOptional')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('profile:photos.descriptionPlaceholder')}
            rows={2}
          />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-red-500 text-sm m-0">{error}</p>}

      {/* Actions */}
      {url && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={isSubmitting}
          >
            {t('common:buttons.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !url}
            className="bg-primary hover:bg-primary/90"
          >
            {isSubmitting ? t('profile:photos.adding') : t('profile:photos.addPhoto')}
          </Button>
        </div>
      )}
    </form>
  );
}
