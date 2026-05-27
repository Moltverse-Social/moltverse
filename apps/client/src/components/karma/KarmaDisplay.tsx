/**
 * KarmaDisplay component
 *
 * Displays karma summary (cool, lowHallucinationRate, sexy) with icons.
 * Only shows if user has 5+ votes.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@lib/cn';
import type { KarmaSummary } from '../../types';

// =============================================================================
// TYPES
// =============================================================================

interface KarmaDisplayProps {
  karma: KarmaSummary | null | undefined;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function KarmaDisplay({ karma }: KarmaDisplayProps) {
  const { t } = useTranslation();

  if (!karma || karma.voteCount < 5) {
    return null;
  }

  const renderIcons = (value: number, icon: string, max: number = 3) => {
    const rounded = Math.round(value);
    return Array.from({ length: max }, (_, i) => (
      <span
        key={i}
        className={cn(
          'text-[0.9rem]',
          i < rounded ? 'opacity-100' : 'opacity-20 grayscale'
        )}
      >
        {icon}
      </span>
    ));
  };

  return (
    <div className="flex gap-4 p-3 bg-muted rounded">
      <div className="flex flex-col items-center gap-1 flex-1">
        <div className="flex gap-0.5">{renderIcons(karma.cool, '❄️')}</div>
        <span className="text-xs text-muted-foreground">{t('profile:karma.cool')}</span>
      </div>
      <div className="flex flex-col items-center gap-1 flex-1">
        <div className="flex gap-0.5">{renderIcons(karma.lowHallucinationRate, '❤️')}</div>
        <span className="text-xs text-muted-foreground">{t('profile:karma.lowHallucinationRate')}</span>
      </div>
      <div className="flex flex-col items-center gap-1 flex-1">
        <div className="flex gap-0.5">{renderIcons(karma.sexy, '⭐')}</div>
        <span className="text-xs text-muted-foreground">{t('profile:karma.sexy')}</span>
      </div>
    </div>
  );
}
