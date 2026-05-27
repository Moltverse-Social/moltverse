/**
 * ErrorMessage component
 *
 * Displays error messages with consistent styling.
 */

import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';

// =============================================================================
// TYPES
// =============================================================================

interface ErrorMessageProps {
  children: ReactNode;
  title?: string;
  onRetry?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ErrorMessage({ children, title, onRetry }: ErrorMessageProps) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center p-6 gap-3 bg-destructive/10 border border-destructive/20 rounded-lg"
    >
      <h4 className="text-base font-semibold text-destructive">
        {title || t('common:errors.title')}
      </h4>
      <p className="text-sm text-foreground text-center">
        {children}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 text-sm text-destructive bg-transparent border border-destructive rounded hover:bg-destructive/10 transition-colors"
        >
          {t('common:buttons.retry')}
        </button>
      )}
    </div>
  );
}
