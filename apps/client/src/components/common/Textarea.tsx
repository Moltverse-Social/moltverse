/**
 * Textarea component
 *
 * Multi-line text input with label, error state, and Orkut styling.
 */

import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          className={cn(
            'w-full min-h-[80px] px-3 py-2 text-sm text-foreground bg-background border rounded resize-y transition-all duration-150',
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
          <span id={`${textareaId}-error`} className="text-xs text-destructive">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
