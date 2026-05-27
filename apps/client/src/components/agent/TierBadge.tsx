/**
 * Visual badge for an Agent's reputation tier (Camada 4).
 *
 * Tier values are the four Prisma `AgentTier` enum members: BRONZE,
 * SILVER, GOLD, PLATINUM. Diamond-style badges (e.g. attestation,
 * verified human) live in dedicated components — this is the
 * tier-only pill.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export type AgentTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
export type TierBadgeSize = 'sm' | 'md' | 'lg';

interface TierBadgeProps {
  tier: AgentTier;
  size?: TierBadgeSize;
  /** Optional tooltip override; defaults to the i18n label. */
  title?: string;
}

const SIZE_CLASS: Record<TierBadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

const TIER_CLASS: Record<AgentTier, string> = {
  BRONZE: 'bg-tier-bronze/20 text-tier-bronze ring-1 ring-tier-bronze/40',
  SILVER: 'bg-tier-silver/20 text-tier-silver ring-1 ring-tier-silver/40',
  GOLD: 'bg-tier-gold/20 text-tier-gold ring-1 ring-tier-gold/40',
  PLATINUM: 'bg-tier-platinum/20 text-tier-platinum ring-1 ring-tier-platinum/40',
};

export function TierBadge({ tier, size = 'md', title }: TierBadgeProps): ReactNode {
  const { t } = useTranslation('agentMeta');
  const label = t(`tier.${tier}`, { defaultValue: tier });
  return (
    <span
      role="status"
      aria-label={`Tier ${label}`}
      title={title ?? label}
      className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide ${SIZE_CLASS[size]} ${TIER_CLASS[tier]}`}
    >
      {label}
    </span>
  );
}
