/**
 * ClusterInfo component
 *
 * Sidebar info showing category, language, creator, moderators.
 */

import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, Avatar, Loading } from '../common';
import { CLUSTER_MODERATORS_QUERY } from '../../graphql/queries';
import type { Cluster, ClusterModeratorsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ClusterInfoProps {
  cluster: Cluster;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ClusterInfo({ cluster }: ClusterInfoProps) {
  const { t, i18n } = useTranslation();
  const { data: moderatorsData, loading: loadingModerators } = useQuery<ClusterModeratorsQueryData>(
    CLUSTER_MODERATORS_QUERY,
    {
      variables: { clusterId: cluster.id },
    }
  );

  return (
    <Card noPadding>
      <CardHeader>
        <CardTitle>{t('cluster:info.title')}</CardTitle>
      </CardHeader>

      <div className="p-4 border-b border-border">
        <h4 className="m-0 mb-3 text-sm font-semibold text-foreground">
          {t('cluster:info.details')}
        </h4>
        <div className="flex gap-2 mb-2">
          <span className="text-xs text-muted-foreground min-w-[80px]">{t('cluster:info.category')}:</span>
          <span className="text-xs text-foreground">{cluster.category?.title || '-'}</span>
        </div>
        <div className="flex gap-2 mb-2">
          <span className="text-xs text-muted-foreground min-w-[80px]">{t('cluster:info.type')}:</span>
          <span className="text-xs text-foreground">
            {cluster.type === 'PRIVATE' ? t('cluster:info.private') : t('cluster:info.public')}
          </span>
        </div>
        {cluster.language && (
          <div className="flex gap-2 mb-2">
            <span className="text-xs text-muted-foreground min-w-[80px]">{t('cluster:info.language')}:</span>
            <span className="text-xs text-foreground">{cluster.language}</span>
          </div>
        )}
        {cluster.country && (
          <div className="flex gap-2 mb-2">
            <span className="text-xs text-muted-foreground min-w-[80px]">{t('cluster:info.country')}:</span>
            <span className="text-xs text-foreground">{cluster.country}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="text-xs text-muted-foreground min-w-[80px]">{t('cluster:info.createdAt')}:</span>
          <span className="text-xs text-foreground">
            {new Date(cluster.createdAt).toLocaleDateString(i18n.language)}
          </span>
        </div>
      </div>

      <div className="p-4 border-b border-border">
        <h4 className="m-0 mb-3 text-sm font-semibold text-foreground">
          {t('cluster:info.createdBy')}
        </h4>
        <Link
          to={`/profile/${cluster.creator.id}`}
          className="flex items-center gap-2 no-underline p-2 -m-2 rounded transition-colors hover:bg-muted"
        >
          <Avatar
            src={cluster.creator.profilePicture}
            name={cluster.creator.name}
            size="sm"
          />
          <span className="text-sm text-secondary">{cluster.creator.name}</span>
        </Link>
      </div>

      <div className="p-4">
        <h4 className="m-0 mb-3 text-sm font-semibold text-foreground">
          {t('cluster:members.moderator')}
        </h4>
        {loadingModerators ? (
          <Loading size="sm" text="" />
        ) : (
          <div className="flex flex-col gap-1">
            {moderatorsData?.clusterModerators.map((mod) => (
              <Link
                key={mod.id}
                to={`/profile/${mod.id}`}
                className="flex items-center gap-2 no-underline p-2 -mx-2 rounded transition-colors hover:bg-muted"
              >
                <Avatar
                  src={mod.profilePicture}
                  name={mod.name}
                  size="sm"
                />
                <span className="text-sm text-secondary">{mod.name}</span>
              </Link>
            ))}
            {moderatorsData?.clusterModerators.length === 0 && (
              <span className="text-xs text-muted-foreground">{t('cluster:info.noModerators')}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
