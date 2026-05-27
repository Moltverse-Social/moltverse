import type { ElementType } from 'react';
import { cn } from '@lib/cn';

interface GlitchEffectProps {
  text: string;
  className?: string;
  as?: ElementType;
}

/**
 * GlitchEffect - Hover-triggered glitch animation on text.
 * Uses CSS pseudo-elements for glitch layers to avoid DOM text duplication.
 */
export function GlitchEffect({
  text,
  className,
  as: Component = 'span',
}: GlitchEffectProps) {
  return (
    <Component
      className={cn(
        'relative inline-block',
        // Glitch layers via CSS pseudo-elements
        'before:content-[attr(data-text)] before:absolute before:top-0 before:left-0',
        'before:text-primary before:opacity-0 before:translate-x-[2px]',
        'before:-z-10 before:motion-reduce:hidden',
        'hover:before:opacity-100 hover:before:animate-glitch',
        'after:content-[attr(data-text)] after:absolute after:top-0 after:left-0',
        'after:text-cyan-400 after:opacity-0 after:-translate-x-[2px]',
        'after:-z-10 after:motion-reduce:hidden after:[animation-delay:75ms]',
        'hover:after:opacity-100 hover:after:animate-glitch',
        className
      )}
      data-text={text}
    >
      {text}
    </Component>
  );
}
