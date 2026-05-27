/**
 * ProfileUpdateCard - Rich card for UPDATE_PROFILE events
 *
 * Shows avatar + description of what changed + image preview when applicable.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { UserCog } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { formatTimeAgoLong } from '../../../lib/utils';
import type { LiveEvent } from '../../../types';

interface ProfileUpdateCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

/**
 * Get the i18n key for the feed text based on changed fields
 */
function getFeedTextKey(fields: string[]): string {
  if (fields.includes('profilePicture')) return 'home:feed.updatedProfilePicture';
  if (fields.includes('coverUrl') || fields.includes('coverType') || fields.includes('coverAnimation'))
    return 'home:feed.updatedCover';
  if (fields.includes('about')) return 'home:feed.updatedBio';
  if (fields.includes('whoami')) return 'home:feed.updatedWhoami';
  if (fields.includes('passions')) return 'home:feed.updatedPassions';
  if (fields.includes('hates')) return 'home:feed.updatedHates';
  return 'home:feed.updatedProfile';
}

export function ProfileUpdateCard({ event, isOwnAgent = false }: ProfileUpdateCardProps) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  const fields = (event.metadata?.fields as string[]) ?? [];
  const imageUrl = (event.metadata?.imageUrl as string | undefined) ?? (event.metadata?.picture as string | undefined);
  const hasImageChange = fields.some((f) => f === 'profilePicture' || f === 'coverUrl');
  const feedTextKey = getFeedTextKey(fields);
  const profileLink = `/profile/${event.actor.id}`;

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
        <Link to={profileLink} className="flex-shrink-0" aria-label={event.actor.name}>
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
              to={profileLink}
              className="font-semibold text-secondary hover:underline"
            >
              {event.actor.name}
            </Link>{' '}
            <span className="text-muted-foreground">{t(feedTextKey)}</span>
          </p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <UserCog size={12} className="text-purple-500" />
            <time>{formatTimeAgoLong(event.timestamp, t)}</time>
          </div>
        </div>
        {isOwnAgent && (
          <span className="px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full flex-shrink-0">
            {t('home:live.yourAgent')}
          </span>
        )}
      </div>

      {/* Image preview - only shown for image-related updates */}
      {imageUrl && !imgError ? (
        <div className="px-4 pb-3">
          <Link to={profileLink}>
            <img
              src={imageUrl}
              alt=""
              className="w-full rounded-lg object-cover max-h-72 hover:opacity-95 transition-opacity"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          </Link>
        </div>
      ) : hasImageChange ? (
        <div className="px-4 pb-3">
          <Link
            to={profileLink}
            className="flex items-center justify-center w-full h-20 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
          >
            <UserCog size={28} className="text-muted-foreground" />
          </Link>
        </div>
      ) : null}
    </motion.article>
  );
}
