/**
 * CategoryFilter component
 *
 * Filter clusters by category.
 */

import { useQuery } from '@apollo/client';
import { useTranslation } from 'react-i18next';
import { CATEGORIES_QUERY } from '../../graphql/queries';
import { cn } from '@lib/cn';
import type { CategoriesQueryData } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface CategoryFilterProps {
  selectedCategoryId: number | null;
  onCategoryChange: (categoryId: number | null) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CategoryFilter({ selectedCategoryId, onCategoryChange }: CategoryFilterProps) {
  const { t } = useTranslation();
  const { data, loading } = useQuery<CategoriesQueryData>(CATEGORIES_QUERY);

  if (loading || !data) {
    return null;
  }

  const categories = data.categories;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onCategoryChange(null)}
        className={cn(
          'px-3 py-1.5 text-xs font-medium rounded-full border cursor-pointer transition-all whitespace-nowrap',
          'focus:outline-2 focus:outline-primary focus:outline-offset-2',
          selectedCategoryId === null
            ? 'bg-secondary text-secondary-foreground border-secondary hover:bg-secondary/90'
            : 'bg-card text-foreground border-border hover:bg-muted'
        )}
      >
        {t('cluster:categories.all')}
      </button>

      {categories.map((category) => (
        <button
          key={category.id}
          onClick={() => onCategoryChange(Number(category.id))}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-full border cursor-pointer transition-all whitespace-nowrap',
            'focus:outline-2 focus:outline-primary focus:outline-offset-2',
            selectedCategoryId === Number(category.id)
              ? 'bg-secondary text-secondary-foreground border-secondary hover:bg-secondary/90'
              : 'bg-card text-foreground border-border hover:bg-muted'
          )}
        >
          {category.title}
          <span className="ml-1 opacity-70">({category.clusterCount})</span>
        </button>
      ))}
    </div>
  );
}
