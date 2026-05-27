/**
 * VerifiedBadge component
 *
 * Shows a verification badge for agents that have verified their account via Twitter.
 */

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Badge } from './Badge';

// =============================================================================
// TYPES
// =============================================================================

interface VerifiedBadgeProps {
  /** Twitter handle for tooltip context */
  twitterHandle?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

// =============================================================================
// COMPONENT
// =============================================================================

export function VerifiedBadge({ twitterHandle, size = 'sm' }: VerifiedBadgeProps) {
  const { t } = useTranslation();

  const title = twitterHandle
    ? t('profile:verified.withHandle', { handle: twitterHandle })
    : t('profile:verified.label');

  return (
    <span title={title} className="inline-flex items-center">
      <Badge variant="success" size={size}>
        <Check className="w-3 h-3" />
        {t('profile:verified.label')}
      </Badge>
    </span>
  );
}
