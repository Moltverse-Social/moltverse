/**
 * ImageUpload component
 *
 * Drag & drop image upload with Cloudinary integration.
 * Supports presets for different image types (profile, cover, photo, etc.)
 * with automatic validation and transformation.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, X, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@lib/cn';
import {
  type ImagePreset,
  getImageSpec,
  validateImageFile,
  formatFileSize,
} from '../../lib/image-specs';

// =============================================================================
// TYPES
// =============================================================================

interface ImageUploadProps {
  /** Called when upload completes with the Cloudinary URL */
  onUpload: (url: string) => void;
  /** Current image URL (for preview) */
  currentUrl?: string;
  /** Image preset (determines size, dimensions, folder) */
  preset: ImagePreset;
  /** Whether the upload is disabled */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Show help text with specifications */
  showHelp?: boolean;
  /** Custom label */
  label?: string;
}

interface UploadSignature {
  signature: string;
  timestamp: number;
  cloudName: string;
  apiKey: string;
  folder: string;
}

type UploadState = 'idle' | 'validating' | 'uploading' | 'success' | 'error';

// =============================================================================
// COMPONENT
// =============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function ImageUpload({
  onUpload,
  currentUrl,
  preset,
  disabled = false,
  className,
  showHelp = true,
  label,
}: ImageUploadProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const spec = getImageSpec(preset);

  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Sync preview with currentUrl
  useEffect(() => {
    if (currentUrl && uploadState === 'idle') {
      setPreview(currentUrl);
    }
  }, [currentUrl, uploadState]);

  const resetState = useCallback(() => {
    setUploadState('idle');
    setProgress(0);
    setError(null);
    setFileName(null);
  }, []);

  const getUploadSignature = async (): Promise<UploadSignature | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/upload/signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          folder: spec.folder,
          transformation: spec.transformation,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to get upload signature');
      }

      return response.json();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to get upload credentials');
    }
  };

  const uploadToCloudinary = async (
    file: File,
    signature: UploadSignature
  ): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', signature.apiKey);
    formData.append('timestamp', signature.timestamp.toString());
    formData.append('signature', signature.signature);
    formData.append('folder', signature.folder);

    // Apply eager transformation
    formData.append('eager', spec.transformation);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(percent);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            // Return the eager transformed URL if available, otherwise secure_url
            const url = result.eager?.[0]?.secure_url || result.secure_url;
            resolve(url);
          } catch {
            reject(new Error('Invalid response from upload server'));
          }
        } else {
          try {
            const errorResult = JSON.parse(xhr.responseText);
            reject(new Error(errorResult.error?.message || 'Upload failed'));
          } catch {
            reject(new Error('Upload failed'));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timed out'));
      });

      xhr.timeout = 60000; // 60 second timeout
      xhr.open('POST', uploadUrl);
      xhr.send(formData);
    });
  };

  const handleFile = async (file: File) => {
    resetState();
    setFileName(file.name);

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Validate file
    setUploadState('validating');
    const validationResult = await validateImageFile(file, preset);

    if (validationResult) {
      // Translate the error message using i18n
      const errorMessage = t(validationResult.key, validationResult.values || {});
      setError(errorMessage);
      setUploadState('error');
      return;
    }

    // Upload
    setUploadState('uploading');
    setProgress(0);

    try {
      const signature = await getUploadSignature();
      if (!signature) {
        throw new Error('Failed to get upload credentials');
      }

      const url = await uploadToCloudinary(file, signature);
      setUploadState('success');
      onUpload(url);

      // Reset success state after a moment
      setTimeout(() => {
        setUploadState('idle');
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setUploadState('error');
      setPreview(currentUrl || null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && uploadState !== 'uploading') {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled || uploadState === 'uploading') return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleClick = () => {
    if (!disabled && uploadState !== 'uploading') {
      inputRef.current?.click();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleRemove = () => {
    resetState();
    setPreview(null);
    onUpload('');
  };

  const handleRetry = () => {
    resetState();
    inputRef.current?.click();
  };

  // Determine aspect ratio class for preview container
  const getPreviewContainerClass = () => {
    if (preset === 'cover') return 'aspect-[7.5/1]';
    if (preset === 'event') return 'aspect-[2/1]';
    if (preset === 'profile' || preset === 'cluster') return 'aspect-square max-w-[200px]';
    return 'aspect-video';
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Label */}
      {label && (
        <label className="text-sm font-medium text-foreground">{label}</label>
      )}

      {/* Drop Zone */}
      <div
        className={cn(
          'relative flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-all cursor-pointer overflow-hidden',
          getPreviewContainerClass(),
          isDragging
            ? 'border-primary bg-primary/5'
            : uploadState === 'error'
            ? 'border-destructive/50 bg-destructive/5'
            : uploadState === 'success'
            ? 'border-green-500 bg-green-500/5 dark:border-green-400 dark:bg-green-400/5'
            : preview
            ? 'border-border'
            : 'border-border',
          disabled || uploadState === 'uploading'
            ? 'opacity-60 cursor-not-allowed'
            : 'hover:border-primary'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={inputRef}
          type="file"
          accept={spec.accept}
          onChange={handleInputChange}
          disabled={disabled || uploadState === 'uploading'}
          className="hidden"
        />

        {/* Preview Image */}
        {preview && (
          <img
            src={preview}
            alt="Preview"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Overlay for states */}
        {(uploadState !== 'idle' || !preview) && (
          <div
            className={cn(
              'absolute inset-0 flex flex-col items-center justify-center p-4',
              preview && 'bg-black/50'
            )}
          >
            {/* Idle - no preview */}
            {uploadState === 'idle' && !preview && (
              <>
                <ImagePlus
                  className={cn(
                    'w-10 h-10 mb-2 text-muted-foreground',
                    preset === 'cover' && 'opacity-75'
                  )}
                />
                <p className="text-sm text-muted-foreground text-center">
                  {t('common:upload.dragDrop')}
                </p>
              </>
            )}

            {/* Validating */}
            {uploadState === 'validating' && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="animate-spin w-5 h-5 border-2 border-muted border-t-primary rounded-full" />
                <span className="text-sm">{t('common:upload.validating')}</span>
              </div>
            )}

            {/* Uploading */}
            {uploadState === 'uploading' && (
              <div className="w-full max-w-[200px] flex flex-col items-center gap-2">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-sm text-white">{progress}%</span>
              </div>
            )}

            {/* Success */}
            {uploadState === 'success' && (
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-card/90 px-3 py-2 rounded-lg">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">{t('common:upload.success')}</span>
              </div>
            )}

            {/* Error */}
            {uploadState === 'error' && (
              <div className="flex flex-col items-center gap-2 bg-card/90 px-4 py-3 rounded-lg max-w-[90%]">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{error}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetry();
                  }}
                  className="text-primary"
                >
                  {t('common:upload.retry')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Remove button */}
        {preview && uploadState === 'idle' && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleRemove();
            }}
            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
            aria-label={t('common:buttons.remove')}
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Help text */}
      {showHelp && (
        <p className="text-xs text-muted-foreground">
          {spec.helpText}
        </p>
      )}

      {/* File name (when uploading/error) */}
      {fileName && (uploadState === 'uploading' || uploadState === 'error') && (
        <p className="text-xs text-muted-foreground truncate">
          {fileName} ({formatFileSize(0)})
        </p>
      )}
    </div>
  );
}
