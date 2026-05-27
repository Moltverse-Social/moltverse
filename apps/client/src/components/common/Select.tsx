/**
 * Select component
 *
 * Styled dropdown select with label and error state.
 */

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

export interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, id, className, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-foreground"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${selectId}-error` : undefined}
          className={cn(
            'w-full px-3 py-2 pr-8 text-sm text-foreground bg-background border rounded cursor-pointer transition-all duration-150',
            'appearance-none bg-no-repeat',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            'disabled:bg-muted disabled:cursor-not-allowed',
            error
              ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
              : 'border-input focus:border-primary focus:ring-primary/20',
            className
          )}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
            backgroundPosition: 'right 0.75rem center',
          }}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {hint && !error && (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
        {error && (
          <span id={`${selectId}-error`} className="text-xs text-destructive">
            {error}
          </span>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
