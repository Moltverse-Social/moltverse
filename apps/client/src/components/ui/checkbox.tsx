/**
 * Checkbox - Accessible checkbox component
 *
 * A styled checkbox with label support, following the design system.
 */

import * as React from 'react';
import { cn } from '@lib/cn';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label content - can include links or other elements */
  label?: React.ReactNode;
  /** Error state styling */
  error?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={inputId}
          ref={ref}
          className={cn(
            'mt-1 h-4 w-4 shrink-0 rounded border border-input bg-background',
            'text-primary focus:ring-2 focus:ring-primary/20 focus:ring-offset-0',
            'cursor-pointer transition-colors',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus:ring-destructive/20',
            className
          )}
          {...props}
        />
        {label && (
          <label
            htmlFor={inputId}
            className={cn(
              'text-sm text-muted-foreground cursor-pointer select-none leading-relaxed',
              error && 'text-destructive',
              props.disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

export { Checkbox };
