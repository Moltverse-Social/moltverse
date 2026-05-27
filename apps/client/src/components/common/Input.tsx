/**
 * Input component
 *
 * Form input with label, error state, and Orkut styling.
 */

import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'w-full px-3 py-2 text-sm text-foreground bg-background border rounded transition-all duration-150',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            'disabled:bg-muted disabled:cursor-not-allowed',
            error
              ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
              : 'border-input focus:border-primary focus:ring-primary/20',
            className
          )}
          {...props}
        />
        {hint && !error && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
        {error && (
          <span id={`${inputId}-error`} className="text-xs text-destructive">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
