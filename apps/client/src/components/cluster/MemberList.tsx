/**
 * MemberList component
 *
 * Grid of cluster members with pagination.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { MemberCard } from './MemberCard';
import { Loading, EmptyState, Button } from '../common';
import { CLUSTER_MEMBERS_QUERY, CLUSTER_MODERATORS_QUERY } from '../../graphql/queries';
import type { ClusterMembersQueryData, ClusterModeratorsQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface MemberListProps {
  clusterId: string;
  creatorId: string;
  limit?: number;
}

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function MemberList({ clusterId, creatorId, limit = PAGE_SIZE }: MemberListProps) {
  const { t } = useTranslation();
  const { data, loading, fetchMore } = useQuery<ClusterMembersQueryData>(
    CLUSTER_MEMBERS_QUERY,
    {
      variables: { clusterId, limit, offset: 0 },
    }
  );

  const { data: moderatorsData } = useQuery<ClusterModeratorsQueryData>(
    CLUSTER_MODERATORS_QUERY,
    {
      variables: { clusterId },
    }
  );

  if (loading && !data) {
    return <Loading text={t('cluster:loading.members')} />;
  }

  const members = data?.clusterMembers.nodes || [];
  const hasMore = data?.clusterMembers.hasMore || false;
  const totalCount = data?.clusterMembers.totalCount || 0;

  const moderatorIds = new Set(moderatorsData?.clusterModerators.map((m) => m.id) || []);

  if (members.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          variant="communities"
          title={t('cluster:empty.noMembers')}
          description={t('cluster:empty.noMembersDescription')}
        />
      </div>
    );
  }

  const handleLoadMore = () => {
    fetchMore({
      variables: {
        offset: members.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          clusterMembers: {
            ...fetchMoreResult.clusterMembers,
            nodes: [...prev.clusterMembers.nodes, ...fetchMoreResult.clusterMembers.nodes],
          },
        };
      },
    });
  };

  return (
    <div className="p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
        {members.map((member) => (
          <MemberCard
            key={member.id}
            member={member}
            isModerator={moderatorIds.has(member.id)}
            isCreator={member.id === creatorId}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center p-4">
          <Button variant="ghost" size="sm" onClick={handleLoadMore} isLoading={loading}>
            {t('cluster:forum.loadMore', { current: members.length, total: totalCount })}
          </Button>
        </div>
      )}
    </div>
  );
}
