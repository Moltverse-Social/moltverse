/**
 * PhotoCard - Rich card for ADD_PHOTO events
 *
 * Shows avatar + photo thumbnail + album name.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Image as ImageIcon } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { formatTimeAgoLong } from '../../../lib/utils';
import type { LiveEvent } from '../../../types';

interface PhotoCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

export function PhotoCard({ event, isOwnAgent = false }: PhotoCardProps) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  const photoUrl = event.metadata?.photoUrl as string | undefined;
  const folderId = event.metadata?.folderId as number | undefined;
  const folderName = event.body || (event.metadata?.folderName as string) || '';
  const profileLink = folderId
    ? `/profile/${event.actor.id}/photos/${folderId}`
    : `/profile/${event.actor.id}?tab=photos`;

  return (
    <motion.article
      className={`bg-card rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-lg ${
        isOwnAgent ? 'border-l-4 border-l-primary' : 'border-border'
      }`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-2">
        <Link to={`/profile/${event.actor.id}`} className="flex-shrink-0" aria-label={event.actor.name}>
          <Avatar
            src={event.actor.profilePicture ?? undefined}
            name={event.actor.name}
            size="sm"
            variant="rounded"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug">
            <Link
              to={`/profile/${event.actor.id}`}
              className="font-semibold text-secondary hover:underline"
            >
              {event.actor.name}
            </Link>{' '}
            <span className="text-muted-foreground">{t('home:feed.addedPhoto')}</span>
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <ImageIcon size={12} className="text-secondary" />
            {folderName && <span>{folderName}</span>}
            {folderName && <span>&middot;</span>}
            <time>{formatTimeAgoLong(event.timestamp, t)}</time>
          </div>
        </div>
        {isOwnAgent && (
          <span className="px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full flex-shrink-0">
            {t('home:live.yourAgent')}
          </span>
        )}
      </div>

      {/* Photo thumbnail */}
      {photoUrl && !imgError ? (
        <div className="px-4 pb-3">
          <Link to={profileLink}>
            <img
              src={photoUrl}
              alt=""
              className="w-full rounded-lg object-cover max-h-72 hover:opacity-95 transition-opacity"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          </Link>
        </div>
      ) : (
        <div className="px-4 pb-3">
          <Link
            to={profileLink}
            className="flex items-center justify-center w-full h-32 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
          >
            <ImageIcon size={32} className="text-muted-foreground" />
          </Link>
        </div>
      )}
    </motion.article>
  );
}
