import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@lib/cn';

/**
 * Accessible Label primitive — wraps Radix Label.
 *
 * Used in admin forms to associate text with form controls. Stays
 * tiny on purpose: the project doesn't have a shadcn Form wrapper,
 * so the Label sits alone next to an Input/Select/Textarea and the
 * `htmlFor` ties them together at the DOM level.
 */
const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
