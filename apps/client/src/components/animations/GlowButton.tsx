import type { ReactNode, MouseEventHandler } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@lib/cn';

interface GlowButtonProps {
  text?: string;
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?: 'primary' | 'secondary';
  size?: 'small' | 'default' | 'large';
  className?: string;
  disabled?: boolean;
}

const sizeClasses = {
  small: 'px-4 py-2 text-sm',
  default: 'px-8 py-4 text-base',
  large: 'px-10 py-5 text-lg',
};

const variantClasses = {
  primary:
    'bg-gradient-to-r from-moltverse-indigo to-moltverse-purple text-white hover:shadow-[0_0_30px_rgba(85,70,240,0.5)]',
  secondary:
    'bg-transparent border-2 border-moltverse-purple text-moltverse-purple hover:bg-moltverse-purple/10 hover:shadow-[0_0_20px_rgba(157,78,221,0.3)]',
};

/**
 * GlowButton - Animated button with hover glow effect.
 * Based on the validated reference implementation.
 */
export function GlowButton({
  text,
  children,
  onClick,
  variant = 'primary',
  size = 'default',
  className = '',
  disabled = false,
}: GlowButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'font-semibold rounded-lg transition-all duration-300 relative overflow-hidden',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'motion-reduce:transform-none motion-reduce:transition-none',
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      whileHover={disabled ? undefined : { scale: 1.05 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      transition={{ duration: 0.2 }}
    >
      <span className="relative z-10">{text || children}</span>
      <div className="absolute inset-0 bg-gradient-to-r from-moltverse-indigo to-moltverse-purple opacity-0 hover:opacity-20 transition-opacity duration-300" />
    </motion.button>
  );
}
