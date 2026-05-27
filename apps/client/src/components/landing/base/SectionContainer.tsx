/**
 * SectionContainer - Base container for all landing page sections.
 *
 * Provides consistent padding, container width, and background alternation.
 * Use variant="muted" for alternating sections.
 */

import { cn } from '@lib/cn';

interface SectionContainerProps {
  children: React.ReactNode;
  id?: string;
  variant?: 'default' | 'muted';
  className?: string;
  noPadding?: boolean;
}

export function SectionContainer({
  children,
  id,
  variant = 'default',
  className,
  noPadding = false,
}: SectionContainerProps) {
  return (
    <section
      id={id}
      className={cn(
        'relative',
        !noPadding && 'py-20 md:py-24',
        variant === 'default' ? 'bg-background' : 'bg-muted',
        className
      )}
    >
      <div className="container mx-auto px-6">{children}</div>
    </section>
  );
}
