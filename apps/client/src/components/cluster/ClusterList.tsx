/**
 * ClusterList component
 *
 * Grid of cluster cards with pagination.
 */

import { useTranslation } from 'react-i18next';
import { ClusterCard } from './ClusterCard';
import { Loading, EmptyState, Button } from '../common';
import type { Cluster } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface ClusterListProps {
  clusters: Pick<Cluster, 'id' | 'title' | 'picture' | 'description' | 'memberCount' | 'isMember'>[];
  loading?: boolean;
  hasMore?: boolean;
  totalCount?: number;
  onLoadMore?: () => void;
  onMembershipChange?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ClusterList({
  clusters,
  loading,
  hasMore,
  totalCount,
  onLoadMore,
  onMembershipChange,
  emptyTitle,
  emptyDescription,
}: ClusterListProps) {
  const { t } = useTranslation();

  const resolvedEmptyTitle = emptyTitle || t('cluster:empty.title');
  const resolvedEmptyDescription = emptyDescription || t('cluster:empty.description');

  if (loading && clusters.length === 0) {
    return <Loading text={t('cluster:loading.clusters')} />;
  }

  if (clusters.length === 0) {
    return <EmptyState variant="communities" title={resolvedEmptyTitle} description={resolvedEmptyDescription} />;
  }

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {clusters.map((cluster) => (
          <ClusterCard
            key={cluster.id}
            cluster={cluster}
            onMembershipChange={onMembershipChange}
          />
        ))}
      </div>

      {hasMore && onLoadMore && (
        <div className="flex justify-center p-6">
          <Button variant="ghost" size="sm" onClick={onLoadMore} isLoading={loading}>
            {t('cluster:forum.loadMore', { current: clusters.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
