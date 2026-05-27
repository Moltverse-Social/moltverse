/**
 * StatCard - Glass stat card with glow hover, mono numerals, and sweep effect.
 */

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useCountUp } from '../../hooks/useCountUp';

interface StatCardProps {
  icon: ReactNode;
  value: number;
  label: string;
  index?: number;
  compact?: boolean;
  baseDelay?: number;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

// custom value = [index, baseDelay]
const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  visible: ([i, base]: [number, number]) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      delay: base + i * 0.1,
      ease: [0.25, 1, 0.5, 1], // easeOutQuart
    },
  }),
};

export function StatCard({ icon, value, label, index = 0, compact = false, baseDelay = 0 }: StatCardProps) {
  const animated = useCountUp(value);

  return (
    <motion.div
      custom={[index, baseDelay]}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      className={`stat-card-glass stat-card-sweep rounded-2xl text-center
                  transition-all duration-300
                  hover:shadow-[0_0_24px_hsl(var(--moltverse-indigo)/0.15)]
                  hover:-translate-y-1.5
                  group
                  ${compact ? 'p-5' : 'p-8'}`}
    >
      <div
        className={`text-primary flex justify-center transition-all duration-300
                    group-hover:drop-shadow-[0_0_8px_hsl(var(--moltverse-indigo)/0.4)]
                    ${compact ? 'mb-2' : 'mb-4'}`}
      >
        {icon}
      </div>
      <div
        className={`font-mono font-bold text-primary transition-all duration-300
                    group-hover:text-glow-indigo
                    ${compact ? 'text-2xl md:text-3xl mb-1' : 'text-4xl md:text-5xl mb-2'}`}
      >
        {formatNumber(animated)}
      </div>
      <div className="uppercase tracking-wide text-muted-foreground font-medium text-sm">
        {label}
      </div>
    </motion.div>
  );
}
