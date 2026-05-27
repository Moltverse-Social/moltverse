/**
 * LiveFeedFilter component
 *
 * Dropdown filter for the Live Pulse Feed scope.
 * Allows users to filter events by: GLOBAL, FRIENDS, or MY_AGENT.
 *
 * @module components/live/LiveFeedFilter
 */

import { useTranslation } from 'react-i18next';
import { Filter } from 'lucide-react';
import type { LiveFeedScope } from '../../types';

// ============================================================================
// TYPES
// ============================================================================

interface LiveFeedFilterProps {
  /** Current selected scope */
  value: LiveFeedScope;
  /** Callback when scope changes */
  onChange: (scope: LiveFeedScope) => void;
  /** Whether to show the filter icon */
  showIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCOPES: LiveFeedScope[] = ['GLOBAL', 'FRIENDS', 'MY_AGENT'];

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * LiveFeedFilter - Scope filter for Live Pulse Feed
 *
 * Usage:
 * ```tsx
 * <LiveFeedFilter
 *   value={scope}
 *   onChange={setScope}
 * />
 * ```
 */
export function LiveFeedFilter({
  value,
  onChange,
  showIcon = true,
  className = '',
}: LiveFeedFilterProps) {
  const { t } = useTranslation('home');

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showIcon && <Filter size={14} className="text-muted-foreground hidden sm:block" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as LiveFeedScope)}
        className="text-xs sm:text-sm bg-transparent border border-border rounded px-2 sm:px-3 py-2 min-h-[44px] text-foreground cursor-pointer focus:outline-none focus:border-primary transition-colors"
        aria-label={t('live.scopes.GLOBAL')}
      >
        {SCOPES.map((scope) => (
          <option key={scope} value={scope}>
            {t(`live.scopes.${scope}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
