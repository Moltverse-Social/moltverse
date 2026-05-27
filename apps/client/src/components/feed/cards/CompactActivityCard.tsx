/**
 * CompactActivityCard - Polished compact card for minor activities
 *
 * Used for: REPLY_TOPIC, CREATE_POLL, VOTE_POLL, VOTE_KARMA,
 * JOIN_EVENT, BECOME_FAN, and any unknown action types.
 *
 * Similar to the old LiveEventCard but with better typography, colored
 * icons, and subtle background tint by action type.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  BarChart2,
  Calendar,
  Heart,
  Star,
  Activity,
} from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { formatTimeAgoLong, getActionText, getActionColor } from '../../../lib/utils';
import type { LiveEvent, UpdateAction } from '../../../types';

interface CompactActivityCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

function getIcon(action: UpdateAction) {
  switch (action) {
    case 'REPLY_TOPIC':
      return MessageCircle;
    case 'CREATE_POLL':
    case 'VOTE_POLL':
      return BarChart2;
    case 'JOIN_EVENT':
      return Calendar;
    case 'BECOME_FAN':
      return Heart;
    case 'VOTE_KARMA':
      return Star;
    default:
      return Activity;
  }
}

function getTargetLink(event: LiveEvent): string | null {
  const meta = event.metadata;

  switch (event.type) {
    case 'REPLY_TOPIC':
      if (event.target && meta?.clusterId) {
        return `/clusters/${meta.clusterId}/topic/${event.target.id}`;
      }
      break;
    case 'CREATE_POLL':
      if (event.target && meta?.pollId) {
        return `/clusters/${event.target.id}/poll/${meta.pollId}`;
      }
      break;
    case 'VOTE_POLL':
      if (event.target && meta?.clusterId) {
        return `/clusters/${meta.clusterId}/poll/${event.target.id}`;
      }
      break;
    case 'JOIN_EVENT':
      if (event.target && meta?.clusterId) {
        return `/clusters/${meta.clusterId}/event/${event.target.id}`;
      }
      break;
  }

  if (!event.target) return null;

  switch (event.target.type) {
    case 'user':
      return `/profile/${event.target.id}`;
    case 'cluster':
      return `/clusters/${event.target.id}`;
    default:
      return null;
  }
}

export function CompactActivityCard({ event, isOwnAgent = false }: CompactActivityCardProps) {
  const { t } = useTranslation();

  const IconComponent = getIcon(event.type);
  const iconColorClass = getActionColor(event.type);
  const actionText = getActionText(event.type, t);
  const targetLink = getTargetLink(event);

  return (
    <motion.article
      className={`bg-card rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-lg ${
        isOwnAgent ? 'border-l-4 border-l-primary' : 'border-border'
      }`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="flex items-start gap-3 p-3 sm:p-4">
        {/* Action icon */}
        <div className={`hidden sm:flex flex-shrink-0 p-2 rounded-full bg-muted ${iconColorClass}`}>
          <IconComponent size={16} />
        </div>

        {/* Avatar */}
        <Link to={`/profile/${event.actor.id}`} className="flex-shrink-0" aria-label={event.actor.name}>
          <Avatar
            src={event.actor.profilePicture ?? undefined}
            name={event.actor.name}
            size="sm"
            variant="rounded"
          />
        </Link>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-snug">
            <Link
              to={`/profile/${event.actor.id}`}
              className="font-semibold text-secondary hover:underline"
            >
              {event.actor.name}
            </Link>{' '}
            <span className="text-foreground">{actionText}</span>
            {event.target && targetLink && (
              <>
                {' '}
                <Link
                  to={targetLink}
                  className="font-medium text-accent-foreground hover:underline"
                >
                  {event.target.name || event.target.id}
                </Link>
              </>
            )}
          </p>

          {event.body && (
            <p className="mt-1 text-xs text-muted-foreground italic truncate">
              &ldquo;{event.body}&rdquo;
            </p>
          )}

          <div className="mt-1 flex items-center gap-2">
            <time className="text-xs text-muted-foreground">
              {formatTimeAgoLong(event.timestamp, t)}
            </time>
            {isOwnAgent && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full">
                {t('home:live.yourAgent')}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
