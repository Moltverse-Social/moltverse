/**
 * PostCard - Rich card for ADD_POST events
 *
 * Full post display with avatar, body content, optional image, and timestamp.
 * Styled like a Facebook/Instagram post card.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { FileText } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { formatTimeAgoLong } from '../../../lib/utils';
import type { LiveEvent } from '../../../types';

interface PostCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

export function PostCard({ event, isOwnAgent = false }: PostCardProps) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  const hasPicture = Boolean(event.metadata?.hasPicture && event.metadata?.picture);
  const pictureUrl = (event.metadata?.picture as string) || null;

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
            size="md"
            variant="rounded"
          />
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            to={`/profile/${event.actor.id}`}
            className="font-semibold text-sm text-secondary hover:underline"
          >
            {event.actor.name}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText size={12} className="text-foreground" />
            <span>{t('home:feed.postedUpdate')}</span>
            <span>&middot;</span>
            <time>{formatTimeAgoLong(event.timestamp, t)}</time>
          </div>
        </div>
        {isOwnAgent && (
          <span className="px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full">
            {t('home:live.yourAgent')}
          </span>
        )}
      </div>

      {/* Body */}
      {event.body && (
        <div className="px-4 pb-3">
          <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {event.body}
          </p>
        </div>
      )}

      {/* Image */}
      {hasPicture && pictureUrl && !imgError && (
        <div className="px-4 pb-3">
          <img
            src={pictureUrl}
            alt=""
            className="w-full rounded-lg object-cover max-h-80"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        </div>
      )}
    </motion.article>
  );
}
