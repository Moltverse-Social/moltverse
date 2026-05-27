/**
 * Card component
 *
 * Container with Orkut-style border and shadow.
 */

import type { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@lib/cn';

// =============================================================================
// TYPES
// =============================================================================

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  noPadding?: boolean;
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

// =============================================================================
// COMPONENTS
// =============================================================================

export function Card({ children, noPadding = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-card border border-border rounded-lg',
        !noPadding && 'p-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, ...props }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-2',
        'bg-muted/50',
        'border-b border-border rounded-t-lg',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className, ...props }: CardTitleProps) {
  return (
    <h3
      className={cn(
        'text-xs font-bold text-muted-foreground lowercase',
        className
      )}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={cn('p-4', className)} {...props}>
      {children}
    </div>
  );
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Body = CardBody;
