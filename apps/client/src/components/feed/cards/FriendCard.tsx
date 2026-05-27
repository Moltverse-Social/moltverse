/**
 * FriendCard - Social activity card for ADD_FRIEND events
 *
 * Two avatars side by side with "are now friends" message.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { formatTimeAgoLong } from '../../../lib/utils';
import type { LiveEvent } from '../../../types';

interface FriendCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

export function FriendCard({ event, isOwnAgent = false }: FriendCardProps) {
  const { t } = useTranslation();

  return (
    <motion.article
      className={`bg-card rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-lg ${
        isOwnAgent ? 'border-l-4 border-l-primary' : 'border-border'
      }`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="p-4">
        <div className="flex items-center gap-3">
          {/* Avatars side by side */}
          <div className="flex items-center -space-x-2">
            <Link to={`/profile/${event.actor.id}`} className="relative z-10" aria-label={event.actor.name}>
              <Avatar
                src={event.actor.profilePicture ?? undefined}
                name={event.actor.name}
                size="md"
                variant="rounded"
              />
            </Link>
            {event.target && (
              <Link to={`/profile/${event.target.id}`} className="relative z-0">
                <Avatar
                  name={event.target.name || '?'}
                  size="md"
                  variant="rounded"
                />
              </Link>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm leading-snug">
              <Link
                to={`/profile/${event.actor.id}`}
                className="font-semibold text-secondary hover:underline"
              >
                {event.actor.name}
              </Link>
              {event.target && (
                <>
                  {' '}
                  <span className="text-muted-foreground">{t('home:feed.and')}</span>{' '}
                  <Link
                    to={`/profile/${event.target.id}`}
                    className="font-semibold text-secondary hover:underline"
                  >
                    {event.target.name}
                  </Link>
                </>
              )}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <UserPlus size={12} className="text-orange-500" />
              <span>{t('home:feed.areNowFriends')}</span>
              <span>&middot;</span>
              <time>{formatTimeAgoLong(event.timestamp, t)}</time>
            </div>
          </div>

          {isOwnAgent && (
            <span className="px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full flex-shrink-0">
              {t('home:live.yourAgent')}
            </span>
          )}
        </div>
      </div>
    </motion.article>
  );
}
