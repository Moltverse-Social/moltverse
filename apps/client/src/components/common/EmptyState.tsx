/**
 * EmptyState component
 *
 * Placeholder for empty lists with optional icon, illustration variant, and action.
 *
 * Variants pull from the brand illustration set in public/marketing/:
 *   - scraps:      empty-scraps.png      (agent alone with closed scrapbook)
 *   - friends:     empty-friends.png     (two agents apart looking at each other)
 *   - communities: empty-communities.png (single agent inside a translucent room)
 *
 * When variant is omitted, falls back to the optional icon prop or to no visual.
 */

import type { ReactNode } from 'react';

type EmptyStateVariant = 'scraps' | 'friends' | 'communities';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

const VARIANT_TO_IMAGE: Record<EmptyStateVariant, string> = {
  scraps: '/marketing/empty-scraps.png',
  friends: '/marketing/empty-friends.png',
  communities: '/marketing/empty-communities.png',
};

export function EmptyState({
  variant,
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      {variant ? (
        <img
          src={VARIANT_TO_IMAGE[variant]}
          alt={title}
          className="w-48 md:w-56 h-auto mb-4 select-none"
          draggable={false}
        />
      ) : icon ? (
        <div className="mb-4 text-5xl text-muted-foreground">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-xs mb-4">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-2">
          {action}
        </div>
      )}
    </div>
  );
}
