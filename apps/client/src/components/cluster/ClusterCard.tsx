/**
 * ClusterCard component
 *
 * Card displaying cluster info with cover image, category badge, and actions.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Card, CardContent, CardFooter } from '../ui/card';
import { Button } from '../ui/button';
import { JOIN_CLUSTER_MUTATION, LEAVE_CLUSTER_MUTATION } from '../../graphql/mutations';
import { useCanWrite } from '../../hooks';
import type { Cluster, JoinClusterMutationData, LeaveClusterMutationData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ClusterCardProps {
  cluster: Pick<
    Cluster,
    'id' | 'title' | 'picture' | 'description' | 'memberCount' | 'isMember'
  > & { category?: Cluster['category'] };
  onMembershipChange?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ClusterCard({
  cluster,
  onMembershipChange,
}: ClusterCardProps) {
  const { t } = useTranslation();
  const canWrite = useCanWrite();
  const [imgError, setImgError] = useState(false);

  const [joinCluster, { loading: joining }] = useMutation<JoinClusterMutationData>(
    JOIN_CLUSTER_MUTATION,
    {
      variables: { clusterId: cluster.id },
      onCompleted: () => onMembershipChange?.(),
    }
  );

  const [leaveCluster, { loading: leaving }] = useMutation<LeaveClusterMutationData>(
    LEAVE_CLUSTER_MUTATION,
    {
      variables: { clusterId: cluster.id },
      onCompleted: () => onMembershipChange?.(),
    }
  );

  const handleJoin = (e: React.MouseEvent) => {
    e.preventDefault();
    joinCluster();
  };

  const handleLeave = (e: React.MouseEvent) => {
    e.preventDefault();
    leaveCluster();
  };

  const categoryTitle = typeof cluster.category === 'object' ? cluster.category?.title : cluster.category;

  return (
    <Card className="overflow-hidden flex flex-col h-full border-primary/20 hover:border-primary transition-colors">
      {/* Cover Image */}
      <Link to={`/clusters/${cluster.id}`} className="block">
        <div className="h-24 overflow-hidden relative">
          {cluster.picture && !imgError ? (
            <img
              src={cluster.picture}
              alt={cluster.title}
              className="w-full h-full object-cover transition-transform hover:scale-105 duration-500"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center">
              <Users className="w-12 h-12 text-white/50" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/20" />
          {categoryTitle && (
            <span className="absolute top-2 right-2 bg-card/90 px-2 py-0.5 rounded text-xs font-medium text-primary">
              {categoryTitle}
            </span>
          )}
        </div>
      </Link>

      {/* Content */}
      <CardContent className="flex-1 pt-4">
        <Link to={`/clusters/${cluster.id}`}>
          <h3 className="font-bold text-lg leading-tight mb-2 hover:text-primary transition-colors">
            {cluster.title}
          </h3>
        </Link>
        {cluster.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{cluster.description}</p>
        )}
        <div className="flex items-center text-xs text-muted-foreground gap-1">
          <Users size={14} />
          <span>{(cluster.memberCount || 0).toLocaleString()} {t('cluster:info.members')}</span>
        </div>
      </CardContent>

      {/* Join/Leave Button */}
      {canWrite && (
        <CardFooter className="pt-0">
          {cluster.isMember ? (
            <Button
              variant="outline"
              className="w-full border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleLeave}
              disabled={leaving}
            >
              {leaving ? t('common:states.loading') : t('cluster:actions.leave')}
            </Button>
          ) : (
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={handleJoin}
              disabled={joining}
            >
              {joining ? t('common:states.loading') : t('cluster:actions.join')}
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
