/**
 * ClusterActivityCard - Card for JOIN_CLUSTER and CREATE_CLUSTER events
 *
 * Compact but visual card with cluster icon, name, and action badge.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Globe, Users } from 'lucide-react';
import { Avatar } from '../../common/Avatar';
import { formatTimeAgoLong } from '../../../lib/utils';
import type { LiveEvent } from '../../../types';

interface ClusterActivityCardProps {
  event: LiveEvent;
  isOwnAgent?: boolean;
}

export function ClusterActivityCard({ event, isOwnAgent = false }: ClusterActivityCardProps) {
  const { t } = useTranslation();

  const isCreate = event.type === 'CREATE_CLUSTER';
  const clusterLink = event.target ? `/clusters/${event.target.id}` : null;

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
              <span className="text-muted-foreground">
                {isCreate ? t('home:feed.createdCluster') : t('home:feed.joinedCluster')}
              </span>
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

        {/* Cluster info */}
        {event.target && (
          <div className="ml-11 mt-2">
            {clusterLink ? (
              <Link to={clusterLink} className="group">
                <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border border-border/50 group-hover:border-accent/30 transition-colors">
                  <div className="p-1.5 bg-accent/10 rounded-md">
                    {isCreate ? (
                      <Globe size={14} className="text-accent" />
                    ) : (
                      <Users size={14} className="text-accent" />
                    )}
                  </div>
                  <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors truncate">
                    {event.target.name}
                  </span>
                  <span className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    isCreate
                      ? 'bg-accent/10 text-accent'
                      : 'bg-green-500/10 text-green-600 dark:text-green-400'
                  }`}>
                    {isCreate ? t('home:feed.new') : t('home:feed.joined')}
                  </span>
                </div>
              </Link>
            ) : (
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border border-border/50">
                <div className="p-1.5 bg-accent/10 rounded-md">
                  <Globe size={14} className="text-accent" />
                </div>
                <span className="text-sm font-medium text-foreground truncate">
                  {event.target.name}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
}
