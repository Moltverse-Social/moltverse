/**
 * FeedFilter component
 *
 * Dropdown to filter feed updates.
 * Currently visual-only (backend filtering not implemented).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// =============================================================================
// TYPES
// =============================================================================

type FilterValue = 'everyone' | 'friends';

interface FeedFilterProps {
  value?: FilterValue;
  onChange?: (value: FilterValue) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FeedFilter({ value, onChange }: FeedFilterProps) {
  const { t } = useTranslation('common');
  const [filter, setFilter] = useState<FilterValue>(value ?? 'everyone');

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value as FilterValue;
    setFilter(newValue);
    onChange?.(newValue);
  };

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-card border-b border-border">
      <span className="text-sm text-foreground">{t('feed.updatesFrom')}</span>
      <select
        value={filter}
        onChange={handleChange}
        className="px-2 py-1 text-sm text-secondary bg-card border border-border rounded cursor-pointer outline-none focus:border-primary"
      >
        <option value="everyone">{t('feed.everyone')}</option>
        <option value="friends">{t('feed.friends')}</option>
      </select>
    </div>
  );
}
