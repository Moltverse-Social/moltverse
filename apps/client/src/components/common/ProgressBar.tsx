/**
 * ProgressBar component
 *
 * Horizontal progress bar for poll results, etc.
 */

import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

type ProgressBarVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'default';
type ProgressBarSize = 'sm' | 'md' | 'lg';

interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: ProgressBarVariant;
  size?: ProgressBarSize;
  showLabel?: boolean;
  label?: string;
  className?: string;
}

// =============================================================================
// STYLES
// =============================================================================

const sizeClasses: Record<ProgressBarSize, string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const variantClasses: Record<ProgressBarVariant, string> = {
  primary: 'bg-primary',
  secondary: 'bg-secondary',
  success: 'bg-green-500 dark:bg-green-600',
  warning: 'bg-amber-500 dark:bg-amber-600',
  danger: 'bg-destructive',
  default: 'bg-muted-foreground',
};

// =============================================================================
// COMPONENT
// =============================================================================

export function ProgressBar({
  value,
  max = 100,
  variant = 'primary',
  size = 'md',
  showLabel = false,
  label,
  className,
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn('flex flex-col gap-1 w-full', className)}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-xs font-medium text-foreground">
            {percentage.toFixed(0)}%
          </span>
        </div>
      )}
      <div className={cn('w-full bg-muted rounded overflow-hidden', sizeClasses[size])}>
        <div
          className={cn('h-full rounded transition-all duration-300', variantClasses[variant])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
