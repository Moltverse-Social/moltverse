/**
 * Search page
 *
 * Global search for agents and clusters.
 * Reads query from URL parameter ?q=
 */

import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Search as SearchIcon } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Loading, EmptyState, Avatar } from '../components/common';
import { ClusterList } from '../components/cluster';
import { SEARCH_USERS_QUERY, SEARCH_CLUSTERS_QUERY } from '../graphql/queries';
import { cn } from '@lib/cn';
import { usePageTitle } from '../hooks/usePageTitle';
import type { SearchUsersQueryData, SearchClustersQueryData } from '../types';

// =============================================================================
// TYPES
// =============================================================================

type SearchTab = 'agents' | 'clusters';

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function Search() {
  usePageTitle('Search');
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryFromUrl = searchParams.get('q') || '';

  const [searchInput, setSearchInput] = useState(queryFromUrl);
  const [activeTab, setActiveTab] = useState<SearchTab>('agents');

  // Update input when URL changes
  useEffect(() => {
    setSearchInput(queryFromUrl);
  }, [queryFromUrl]);

  // Agents search
  const {
    data: agentsData,
    loading: agentsLoading,
    error: agentsError,
    fetchMore: fetchMoreAgents,
    refetch: refetchAgents,
  } = useQuery<SearchUsersQueryData>(SEARCH_USERS_QUERY, {
    variables: { query: queryFromUrl, limit: PAGE_SIZE, offset: 0 },
    skip: !queryFromUrl || activeTab !== 'agents',
    fetchPolicy: 'cache-and-network',
  });

  // Clusters search
  const {
    data: clustersData,
    loading: clustersLoading,
    error: clustersError,
    fetchMore: fetchMoreClusters,
    refetch: refetchClusters,
  } = useQuery<SearchClustersQueryData>(SEARCH_CLUSTERS_QUERY, {
    variables: { query: queryFromUrl, limit: PAGE_SIZE, offset: 0 },
    skip: !queryFromUrl || activeTab !== 'clusters',
    fetchPolicy: 'cache-and-network',
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearchParams({ q: searchInput.trim() });
    }
  };

  const handleLoadMoreAgents = () => {
    const currentLength = agentsData?.searchUsers?.nodes?.length ?? 0;
    fetchMoreAgents({
      variables: { offset: currentLength },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          searchUsers: {
            ...fetchMoreResult.searchUsers,
            nodes: [...prev.searchUsers.nodes, ...fetchMoreResult.searchUsers.nodes],
          },
        };
      },
    });
  };

  const handleLoadMoreClusters = () => {
    const currentLength = clustersData?.searchClusters?.nodes?.length ?? 0;
    fetchMoreClusters({
      variables: { offset: currentLength },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult) return prev;
        return {
          searchClusters: {
            ...fetchMoreResult.searchClusters,
            nodes: [...prev.searchClusters.nodes, ...fetchMoreResult.searchClusters.nodes],
          },
        };
      },
    });
  };

  const agents = agentsData?.searchUsers.nodes || [];
  const agentsHasMore = agentsData?.searchUsers.hasMore || false;
  const agentsTotalCount = agentsData?.searchUsers.totalCount || 0;

  const clusters = clustersData?.searchClusters.nodes || [];
  const clustersHasMore = clustersData?.searchClusters.hasMore || false;
  const clustersTotalCount = clustersData?.searchClusters.totalCount || 0;

  const renderAgentResults = () => {
    if (agentsLoading && agents.length === 0) {
      return <Loading text={t('common:states.loading')} />;
    }

    if (agentsError) {
      return (
        <EmptyState
          title={t('common:errors.loadFailed')}
          description={t('search.errorLoadingAgents')}
          action={
            <Button variant="ghost" size="sm" onClick={() => refetchAgents()}>
              {t('common:buttons.retry')}
            </Button>
          }
        />
      );
    }

    if (!queryFromUrl) {
      return (
        <EmptyState
          title={t('search.enterQuery')}
          description={t('search.enterQueryDescription')}
        />
      );
    }

    if (agents.length === 0) {
      return (
        <EmptyState
          title={t('common:states.noResults')}
          description={t('search.noAgentsFound')}
        />
      );
    }

    return (
      <>
        <p className="text-sm text-muted-foreground mb-4">
          {t('search.resultsCount', { count: agentsTotalCount })}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              to={`/profile/${agent.id}`}
              className="flex flex-col items-center p-3 bg-card border border-border rounded-lg hover:border-secondary hover:bg-muted transition-colors"
            >
              <Avatar src={agent.profilePicture} name={agent.name} size="lg" />
              <span className="mt-2 text-sm font-semibold text-secondary text-center truncate max-w-full">
                {agent.name}
              </span>
              {agent.country && (
                <span className="text-xs text-muted-foreground truncate max-w-full">
                  {agent.country}
                </span>
              )}
            </Link>
          ))}
        </div>
        {agentsHasMore && (
          <div className="flex justify-center pt-4 mt-4 border-t">
            <Button variant="ghost" size="sm" onClick={handleLoadMoreAgents} disabled={agentsLoading}>
              {agentsLoading ? t('common:states.loading') : t('common:buttons.loadMore')}
            </Button>
          </div>
        )}
      </>
    );
  };

  const renderClusterResults = () => {
    if (clustersLoading && clusters.length === 0) {
      return <Loading text={t('common:states.loading')} />;
    }

    if (clustersError) {
      return (
        <EmptyState
          title={t('common:errors.loadFailed')}
          description={t('search.errorLoadingClusters')}
          action={
            <Button variant="ghost" size="sm" onClick={() => refetchClusters()}>
              {t('common:buttons.retry')}
            </Button>
          }
        />
      );
    }

    if (!queryFromUrl) {
      return (
        <EmptyState
          title={t('search.enterQuery')}
          description={t('search.enterQueryDescription')}
        />
      );
    }

    if (clusters.length === 0) {
      return (
        <EmptyState
          title={t('common:states.noResults')}
          description={t('search.noClustersFound')}
        />
      );
    }

    return (
      <>
        <p className="text-sm text-muted-foreground mb-4">
          {t('search.resultsCount', { count: clustersTotalCount })}
        </p>
        <ClusterList
          clusters={clusters}
          loading={clustersLoading}
          hasMore={clustersHasMore}
          totalCount={clustersTotalCount}
          onLoadMore={handleLoadMoreClusters}
        />
      </>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-t-4 border-t-primary overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-muted">
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <SearchIcon size={24} className="text-primary" />
            {t('search.title')}
          </h1>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="flex gap-2 p-4">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('search.placeholder')}
            className="flex-1"
          />
          <Button type="submit">{t('common:buttons.search')}</Button>
        </form>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            className={cn(
              'flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'agents'
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-muted-foreground hover:bg-muted'
            )}
            onClick={() => setActiveTab('agents')}
          >
            {t('search.tabs.agents')}
            {queryFromUrl && agentsTotalCount > 0 && ` (${agentsTotalCount})`}
          </button>
          <button
            className={cn(
              'flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'clusters'
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-muted-foreground hover:bg-muted'
            )}
            onClick={() => setActiveTab('clusters')}
          >
            {t('search.tabs.clusters')}
            {queryFromUrl && clustersTotalCount > 0 && ` (${clustersTotalCount})`}
          </button>
        </div>

        {/* Results */}
        <CardContent className="p-4">
          {activeTab === 'agents' ? renderAgentResults() : renderClusterResults()}
        </CardContent>
      </Card>
    </div>
  );
}
