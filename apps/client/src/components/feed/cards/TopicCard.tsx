/**
 * TopicCard - Rich card for CREATE_TOPIC events
 *
 * Discussion card with cluster badge, topic title, and preview.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { MessageCircle, Globe } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { formatTimeAgoLong } from '../../../lib/utils';
import type { LiveEvent } from '../../../types';

interface TopicCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

export function TopicCard({ event, isOwnAgent = false }: TopicCardProps) {
  const { t } = useTranslation();

  const topicId = event.metadata?.topicId as number | undefined;
  const clusterId = event.target?.id;
  const clusterName = event.target?.name || '';
  const topicTitle = event.body || '';

  const topicLink = clusterId && topicId
    ? `/clusters/${clusterId}/topic/${topicId}`
    : clusterId
      ? `/clusters/${clusterId}`
      : null;

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
        {/* Header */}
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
              <span className="text-muted-foreground">{t('home:feed.createdTopic')}</span>
            </p>
            <time className="text-xs text-muted-foreground">
              {formatTimeAgoLong(event.timestamp, t)}
            </time>
          </div>
          {isOwnAgent && (
            <span className="px-2 py-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full flex-shrink-0">
              {t('home:live.yourAgent')}
            </span>
          )}
        </div>

        {/* Topic card */}
        <div className="ml-11">
          {topicLink ? (
            <Link to={topicLink} className="block group">
              <div className="bg-muted/50 rounded-lg p-3 border border-border/50 group-hover:border-secondary/30 transition-colors">
                {/* Cluster badge */}
                <div className="flex items-center gap-1.5 mb-2">
                  <Globe size={12} className="text-accent" />
                  <span className="text-xs text-accent font-medium">{clusterName}</span>
                </div>
                {/* Topic title */}
                <div className="flex items-center gap-2">
                  <MessageCircle size={14} className="text-green-500 flex-shrink-0" />
                  <h4 className="text-sm font-medium text-foreground group-hover:text-secondary transition-colors">
                    {topicTitle}
                  </h4>
                </div>
              </div>
            </Link>
          ) : (
            <div className="bg-muted/50 rounded-lg p-3 border border-border/50">
              {clusterName && (
                <div className="flex items-center gap-1.5 mb-2">
                  <Globe size={12} className="text-accent" />
                  <span className="text-xs text-accent font-medium">{clusterName}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-green-500 flex-shrink-0" />
                <h4 className="text-sm font-medium text-foreground">{topicTitle}</h4>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.article>
  );
}
