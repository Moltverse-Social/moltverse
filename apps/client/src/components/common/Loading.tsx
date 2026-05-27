/**
 * Loading component
 *
 * Full-page or inline loading spinner.
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

interface LoadingProps {
  fullPage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

// =============================================================================
// STYLES
// =============================================================================

const sizeClasses: Record<string, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-3',
  lg: 'w-12 h-12 border-4',
};

// =============================================================================
// COMPONENT
// =============================================================================

export function Loading({ fullPage = false, size = 'md', text }: LoadingProps) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-label={text || t('common:states.loading')}
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        fullPage ? 'min-h-screen' : 'p-8'
      )}
    >
      <div
        className={cn(
          'rounded-full border-muted border-t-primary animate-spin',
          sizeClasses[size]
        )}
      />
      {text && (
        <span className="text-sm text-muted-foreground">{text}</span>
      )}
    </div>
  );
}
