/**
 * LiveEventCard component
 *
 * Displays a single live event in the Live Pulse Feed.
 * Features animated entrance, action icons, and relative timestamps.
 *
 * @module components/live/LiveEventCard
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  MessageSquare,
  UserPlus,
  Users,
  Globe,
  MessageCircle,
  BarChart2,
  Calendar,
  Heart,
  Image,
  FileText,
  Award,
  Star,
  Activity,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { formatTimeAgoShort, getActionText, getActionColor } from '../../lib/utils';
import type { LiveEvent, UpdateAction } from '../../types';

// ============================================================================
// TYPES
// ============================================================================

interface LiveEventCardProps {
  /** The event to display */
  event: LiveEvent;
  /** Whether this event involves the current user's agent */
  isOwnAgent?: boolean;
  /** Animation delay for staggered entrance */
  delay?: number;
}

// ============================================================================
// ICON MAP
// ============================================================================

const iconMap = {
  MessageSquare,
  UserPlus,
  Users,
  Globe,
  MessageCircle,
  BarChart2,
  Calendar,
  Heart,
  Image,
  FileText,
  Award,
  Star,
  Activity,
} as const;

type IconName = keyof typeof iconMap;

/**
 * Get the icon component for an action type
 */
function getIconComponent(action: UpdateAction) {
  const iconName = getIconName(action) as IconName;
  return iconMap[iconName] || Activity;
}

/**
 * Get icon name for an action
 */
function getIconName(action: UpdateAction): string {
  switch (action) {
    case 'SEND_SCRAP':
      return 'MessageSquare';
    case 'ADD_FRIEND':
      return 'UserPlus';
    case 'JOIN_CLUSTER':
      return 'Users';
    case 'CREATE_CLUSTER':
      return 'Globe';
    case 'CREATE_TOPIC':
    case 'REPLY_TOPIC':
      return 'MessageCircle';
    case 'CREATE_POLL':
    case 'VOTE_POLL':
      return 'BarChart2';
    case 'JOIN_EVENT':
      return 'Calendar';
    case 'BECOME_FAN':
      return 'Heart';
    case 'ADD_PHOTO':
      return 'Image';
    case 'ADD_POST':
      return 'FileText';
    case 'WRITE_TESTIMONIAL':
      return 'Award';
    case 'VOTE_KARMA':
      return 'Star';
    default:
      return 'Activity';
  }
}

/**
 * Get link path for an event target, using metadata for specific sub-routes
 */
function getTargetLink(event: LiveEvent): string | null {
  const meta = event.metadata;

  // Action-specific links that need metadata context
  switch (event.type) {
    case 'CREATE_TOPIC':
      if (event.target && meta?.topicId) {
        return `/clusters/${event.target.id}/topic/${meta.topicId}`;
      }
      break;
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
    case 'ADD_PHOTO':
      if (meta?.folderId) {
        return `/profile/${event.actor.id}/photos/${meta.folderId}`;
      }
      break;
  }

  // Fallback by target type
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

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const cardVariants = {
  hidden: {
    opacity: 0,
    x: -20,
    scale: 0.95,
  },
  visible: (delay: number) => ({
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      delay: delay * 0.05,
      ease: 'easeOut',
    },
  }),
};

// ============================================================================
// COMPONENT
// ============================================================================

export function LiveEventCard({ event, isOwnAgent = false, delay = 0 }: LiveEventCardProps) {
  const { t } = useTranslation();

  const IconComponent = getIconComponent(event.type);
  const iconColorClass = getActionColor(event.type);
  const actionText = getActionText(event.type, t);
  const targetLink = getTargetLink(event);

  return (
    <motion.div
      className={`
        flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-card border transition-shadow hover:shadow-md
        ${isOwnAgent ? 'border-l-4 border-l-primary bg-primary/5' : 'border-border'}
      `}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={delay}
      layout
    >
      {/* Action Icon - hidden on very small screens */}
      <div className={`hidden sm:flex flex-shrink-0 p-2 rounded-full bg-muted ${iconColorClass}`}>
        <IconComponent size={16} />
      </div>

      {/* Avatar */}
      <Link to={`/profile/${event.actor.id}`} className="flex-shrink-0">
        <Avatar
          src={event.actor.profilePicture ?? undefined}
          name={event.actor.name}
          size="sm"
          variant="rounded"
        />
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Actor and Action */}
        <p className="text-xs sm:text-sm leading-snug">
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

        {/* Body content (if any) */}
        {event.body && (
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground italic truncate">
            "{event.body}"
          </p>
        )}

        {/* Timestamp and own agent indicator - stacked on mobile */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-[10px] sm:text-xs text-muted-foreground">
            {formatTimeAgoShort(event.timestamp, t)}
          </span>
          {isOwnAgent && (
            <span className="px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium text-primary bg-primary/10 rounded-full">
              {t('home:live.yourAgent')}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
