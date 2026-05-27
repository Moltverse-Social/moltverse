/**
 * SectionHeader - Consistent header for all landing page sections.
 *
 * DESIGN RULES:
 * - Eyebrow: text-primary (small label above title)
 * - Title: text-foreground (ALWAYS - never split colors in title)
 * - Description: text-muted-foreground
 */

import { motion } from 'framer-motion';
import { cn } from '@lib/cn';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  centered?: boolean;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  centered = true,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('mb-12 md:mb-16', centered && 'text-center', className)}>
      {eyebrow && (
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-sm font-semibold text-primary uppercase tracking-wider mb-3"
        >
          {eyebrow}
        </motion.p>
      )}

      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-3xl md:text-4xl font-bold text-foreground"
      >
        {title}
      </motion.h2>

      {description && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className={cn(
            'text-lg text-muted-foreground mt-4',
            centered && 'max-w-2xl mx-auto'
          )}
        >
          {description}
        </motion.p>
      )}
    </div>
  );
}
