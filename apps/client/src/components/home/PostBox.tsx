/**
 * PostBox component
 *
 * Enhanced post box for the activity feed.
 * Features: image upload via Cloudinary, preview, character counter
 * with progress ring, Ctrl+Enter submit hint.
 */

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@apollo/client';
import { ImagePlus, X } from 'lucide-react';
import { CREATE_POST_MUTATION } from '../../graphql/mutations/feed';
import { FEED_QUERY } from '../../graphql/queries/social';
import { Card, CardHeader, CardTitle, Button, ImageUpload } from '../common';
import { useToast } from '../ui/use-toast';
import { useCanWrite } from '../../hooks';
import { cn } from '@lib/cn';

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_CHARS = 500;

// =============================================================================
// COMPONENT
// =============================================================================

export function PostBox() {
  const { t } = useTranslation('common');
  const { toast } = useToast();
  const canWrite = useCanWrite();

  const [body, setBody] = useState('');
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [createPost, { loading }] = useMutation(CREATE_POST_MUTATION, {
    refetchQueries: [{ query: FEED_QUERY, variables: { limit: 20 } }],
    onCompleted: () => {
      setBody('');
      setPictureUrl(null);
      setShowImageUpload(false);
    },
    onError: () => {
      toast({
        title: t('states.error'),
        description: t('feed.postBox.error', 'Failed to post. Please try again.'),
        variant: 'destructive',
      });
    },
  });

  if (!canWrite) {
    return null;
  }

  const handleSubmit = () => {
    if (!body.trim() || body.length > MAX_CHARS || loading) return;

    createPost({
      variables: {
        input: {
          body: body.trim(),
          ...(pictureUrl ? { picture: pictureUrl } : {}),
        },
      },
    });
  };

  const handleCancel = () => {
    setBody('');
    setPictureUrl(null);
    setShowImageUpload(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSubmit();
    }
  };

  const handleImageUpload = (url: string) => {
    if (url) {
      setPictureUrl(url);
    } else {
      setPictureUrl(null);
    }
  };

  const handleRemoveImage = () => {
    setPictureUrl(null);
    setShowImageUpload(false);
  };

  const isOverLimit = body.length > MAX_CHARS;
  // Block submit while the image upload panel is open but no image has been uploaded yet
  const isImagePending = showImageUpload && !pictureUrl;
  const canPost = body.trim().length > 0 && !isOverLimit && !loading && !isImagePending;
  const charRatio = Math.min(body.length / MAX_CHARS, 1);

  // Color transitions for character counter
  const counterColor = isOverLimit
    ? 'text-destructive'
    : charRatio > 0.9
      ? 'text-orange-500'
      : charRatio > 0.75
        ? 'text-yellow-500'
        : 'text-muted-foreground';

  // SVG progress ring
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - charRatio);

  return (
    <Card noPadding>
      <CardHeader>
        <CardTitle>{t('feed.postBox.title')}</CardTitle>
      </CardHeader>
      <div className="p-4">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('feed.postBox.placeholder')}
          disabled={loading}
          rows={3}
          className={cn(
            'w-full min-h-[60px] p-3 text-sm font-inherit border border-border rounded-lg resize-y outline-none bg-background',
            'focus:border-primary focus:ring-2 focus:ring-primary/20',
            'placeholder:text-muted-foreground',
            'disabled:bg-muted disabled:cursor-not-allowed'
          )}
        />

        {/* Image preview */}
        {pictureUrl && (
          <div className="relative mt-3 rounded-lg overflow-hidden border border-border">
            <img
              src={pictureUrl}
              alt=""
              className="w-full max-h-48 object-cover"
            />
            <button
              type="button"
              onClick={handleRemoveImage}
              className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Image upload area (toggled) */}
        {showImageUpload && !pictureUrl && (
          <div className="mt-3">
            <ImageUpload
              onUpload={handleImageUpload}
              preset="photo"
              showHelp={false}
              className="min-h-0"
            />
          </div>
        )}

        {/* Actions bar */}
        <div className="flex items-center gap-2 mt-3">
          {/* Image button — remove if image exists, toggle upload panel otherwise */}
          <button
            type="button"
            onClick={() => {
              if (pictureUrl) {
                handleRemoveImage();
              } else {
                setShowImageUpload(!showImageUpload);
              }
            }}
            disabled={loading}
            className={cn(
              'p-2 rounded-lg transition-colors',
              showImageUpload || pictureUrl
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
            title={pictureUrl ? t('feed.postBox.removeImage') : t('feed.postBox.addImage')}
          >
            {pictureUrl ? <X size={18} /> : <ImagePlus size={18} />}
          </button>

          {/* Ctrl+Enter hint */}
          <span className="text-[10px] text-muted-foreground hidden sm:inline">
            Ctrl+Enter
          </span>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Character counter with progress ring */}
          <div className="flex items-center gap-1.5">
            {body.length > 0 && (
              <div className="relative w-6 h-6">
                <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                  {/* Background circle */}
                  <circle
                    cx="12"
                    cy="12"
                    r={radius}
                    fill="none"
                    className="stroke-muted"
                    strokeWidth="2"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="12"
                    cy="12"
                    r={radius}
                    fill="none"
                    className={cn(
                      'transition-all duration-200',
                      isOverLimit ? 'stroke-destructive' : charRatio > 0.9 ? 'stroke-orange-500' : 'stroke-primary'
                    )}
                    strokeWidth="2"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
            <span className={cn('text-xs tabular-nums', counterColor)}>
              {body.length}/{MAX_CHARS}
            </span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleCancel}
            disabled={loading || (!body && !pictureUrl)}
          >
            {t('feed.postBox.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canPost}
          >
            {loading ? t('feed.postBox.posting') : t('feed.postBox.post')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
