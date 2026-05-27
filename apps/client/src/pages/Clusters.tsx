/**
 * Clusters page
 *
 * Discover clusters with search and category filter.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { useCanWrite, usePageTitle } from '../hooks';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { ClusterCard } from '../components/cluster/ClusterCard';
import { Loading } from '../components/common/Loading';
import { SEARCH_CLUSTERS_QUERY, CATEGORIES_QUERY } from '../graphql/queries';
import { cn } from '@lib/cn';
import type { SearchClustersQueryData, CategoriesQueryData } from '../types';

// =============================================================================
// COMPONENT
// =============================================================================

const PAGE_SIZE = 20;

export function Clusters() {
  usePageTitle('Clusters');
  const { t } = useTranslation();
  const canWrite = useCanWrite();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  // Fetch categories
  const { data: categoriesData } = useQuery<CategoriesQueryData>(CATEGORIES_QUERY);
  const categories = categoriesData?.categories || [];
  // Deduplicate category names to prevent duplicate keys in React
  const categoryNames = ['All', ...new Set(categories.map((c) => c.title).filter((t): t is string => t !== null))];

  // Determine categoryId from activeCategory
  const selectedCategory = categories.find((c) => c.title === activeCategory);
  const categoryId = selectedCategory ? Number(selectedCategory.id) : null;

  const { data, loading, refetch } = useQuery<SearchClustersQueryData>(
    SEARCH_CLUSTERS_QUERY,
    {
      variables: {
        query: searchQuery || null,
        categoryId: activeCategory === 'All' ? null : categoryId,
        limit: PAGE_SIZE,
        offset: 0,
      },
      fetchPolicy: 'cache-and-network',
    }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const clusters = data?.searchClusters.nodes || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold font-display text-primary">
          {t('clusters.title', { defaultValue: 'Clusters' })}
        </h1>
        {canWrite && (
          <Link to="/clusters/create">
            <Button className="bg-primary hover:bg-primary/90">
              <Plus size={16} className="mr-2" />
              {t('clusters.create', { defaultValue: 'Create Cluster' })}
            </Button>
          </Link>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-card p-4 rounded-lg shadow-sm border space-y-4">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            placeholder={t('clusters.searchPlaceholder', { defaultValue: 'Search clusters...' })}
            className="pl-9"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>

        <div className="flex flex-wrap gap-2">
          {categoryNames.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-3 py-1 text-xs rounded-full border transition-colors',
                activeCategory === cat
                  ? 'bg-primary text-white border-primary'
                  : 'bg-card text-muted-foreground hover:bg-primary-light border-border'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Clusters Grid */}
      {loading && !data ? (
        <Loading text={t('common:states.loading')} />
      ) : clusters.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              onMembershipChange={() => refetch()}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-xl border border-dashed">
          {searchQuery
            ? t('clusters.noSearchResults', {
                defaultValue: 'No clusters found matching "{{term}}".',
                term: searchQuery,
              })
            : t('clusters.empty.description', { defaultValue: 'No clusters yet.' })}
        </div>
      )}
    </div>
  );
}
