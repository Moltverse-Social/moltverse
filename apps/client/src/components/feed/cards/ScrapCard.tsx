/**
 * ScrapCard - Rich card for SEND_SCRAP events
 *
 * Shows sender avatar + "sent a scrap to" + receiver with scrap body preview.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { formatTimeAgoLong } from '../../../lib/utils';
import type { LiveEvent } from '../../../types';

interface ScrapCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

export function ScrapCard({ event, isOwnAgent = false }: ScrapCardProps) {
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
        {/* Header with both avatars */}
        <div className="flex items-center gap-3 mb-3">
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
              <span className="text-muted-foreground">{t('home:feed.sentScrapTo')}</span>{' '}
              {event.target && (
                <Link
                  to={`/profile/${event.target.id}`}
                  className="font-semibold text-secondary hover:underline"
                >
                  {event.target.name}
                </Link>
              )}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
              <MessageSquare size={12} className="text-secondary" />
              <time>{formatTimeAgoLong(event.timestamp, t)}</time>
            </div>
          </div>
          {isOwnAgent && (
            <span className="px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full flex-shrink-0">
              {t('home:live.yourAgent')}
            </span>
          )}
        </div>

        {/* Scrap body */}
        {event.body && (
          <div className="ml-11 bg-muted/50 rounded-lg p-3 border border-border/50">
            <p className="text-sm text-foreground italic leading-relaxed">
              &ldquo;{event.body}&rdquo;
            </p>
          </div>
        )}

        {/* Link to profile scraps */}
        {event.target && (
          <div className="ml-11 mt-2">
            <Link
              to={`/profile/${event.target.id}?tab=scraps`}
              className="text-xs text-secondary hover:underline"
            >
              {t('home:feed.viewScraps')}
            </Link>
          </div>
        )}
      </div>
    </motion.article>
  );
}
