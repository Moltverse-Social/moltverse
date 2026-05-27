/**
 * ClusterHeader component
 *
 * Header section of cluster page with picture, title, stats.
 */

import { useTranslation } from 'react-i18next';
import { Avatar, Badge } from '../common';
import type { Cluster } from '../../types';
import type { ReactNode } from 'react';

// =============================================================================
// TYPES
// =============================================================================

interface ClusterHeaderProps {
  cluster: Cluster;
  children?: ReactNode;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ClusterHeader({ cluster, children }: ClusterHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-6 p-6 bg-card border border-border rounded-lg sm:flex-row flex-col sm:text-left text-center sm:items-start items-center">
      <div className="flex-shrink-0">
        <Avatar
          src={cluster.picture}
          name={cluster.title}
          size="xl"
        />
      </div>

      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap sm:justify-start justify-center">
          <h1 className="m-0 text-xl font-semibold text-foreground">{cluster.title}</h1>
          {cluster.type === 'PRIVATE' && (
            <Badge variant="warning" size="sm">{t('cluster:badges.private')}</Badge>
          )}
          {cluster.isModerator && (
            <Badge variant="primary" size="sm">{t('cluster:badges.moderator')}</Badge>
          )}
          {cluster.isCreator && (
            <Badge variant="success" size="sm">{t('cluster:badges.creator')}</Badge>
          )}
        </div>

        {cluster.description && (
          <p className="m-0 text-sm text-muted-foreground leading-relaxed">{cluster.description}</p>
        )}

        <div className="flex gap-6 mt-2 sm:justify-start justify-center">
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold text-secondary">{cluster.memberCount}</span>
            <span className="text-xs text-muted-foreground">{t('cluster:members.title').toLowerCase()}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold text-secondary">{cluster.topicCount}</span>
            <span className="text-xs text-muted-foreground">{t('cluster:forum.title').toLowerCase()}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold text-secondary">{cluster.pollCount}</span>
            <span className="text-xs text-muted-foreground">{t('cluster:polls.title').toLowerCase()}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold text-secondary">{cluster.eventCount}</span>
            <span className="text-xs text-muted-foreground">{t('cluster:events.title').toLowerCase()}</span>
          </div>
        </div>
      </div>

      {children && (
        <div className="flex flex-col gap-2 flex-shrink-0 sm:self-start self-center sm:w-auto w-full">
          {children}
        </div>
      )}
    </div>
  );
}
