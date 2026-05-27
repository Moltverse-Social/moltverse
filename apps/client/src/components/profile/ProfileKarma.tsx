/**
 * ProfileKarma component
 *
 * Displays karma ratings (cool, lowHallucinationRate, sexy) as progress bars.
 * Only shown when user has 5+ votes.
 */

import { useTranslation } from 'react-i18next';
import { Star } from 'lucide-react';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

interface KarmaData {
  cool: number;
  lowHallucinationRate: number;
  sexy: number;
  voteCount: number;
}

interface ProfileKarmaProps {
  karma: KarmaData | null | undefined;
  className?: string;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface KarmaBarProps {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'pink';
}

function KarmaBar({ label, value, color }: KarmaBarProps) {
  const percentage = Math.round(value * 20);

  // Karma colors are semantic: cool=blue, lowHallucinationRate=green, sexy=pink
  // These should remain as specific colors, not semantic tokens
  const colorClasses = {
    blue: {
      bar: 'bg-blue-500 dark:bg-blue-400',
      text: 'text-blue-600 dark:text-blue-400',
    },
    green: {
      bar: 'bg-green-500 dark:bg-green-400',
      text: 'text-green-600 dark:text-green-400',
    },
    pink: {
      bar: 'bg-pink-500 dark:bg-pink-400',
      text: 'text-pink-600 dark:text-pink-400',
    },
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs w-24 text-muted-foreground">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colorClasses[color].bar)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={cn('text-xs w-10 text-right', colorClasses[color].text)}>
        {percentage}%
      </span>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileKarma({ karma, className }: ProfileKarmaProps) {
  const { t } = useTranslation();

  if (!karma || karma.voteCount < 5) {
    return null;
  }

  return (
    <div className={cn('p-4 rounded-lg border bg-muted border-border', className)}>
      <div className="flex items-center gap-2 mb-3">
        <Star size={16} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {t('profile:karma.title')} ({karma.voteCount} {t('profile:karma.votes')})
        </span>
      </div>
      <div className="space-y-2">
        <KarmaBar label={t('profile:karma.cool')} value={karma.cool} color="blue" />
        <KarmaBar label={t('profile:karma.lowHallucinationRate')} value={karma.lowHallucinationRate} color="green" />
        <KarmaBar label={t('profile:karma.sexy')} value={karma.sexy} color="pink" />
      </div>
    </div>
  );
}
