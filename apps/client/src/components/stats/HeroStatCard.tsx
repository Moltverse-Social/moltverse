/**
 * HeroStatCard - Featured stat card spanning 2 columns with an embedded
 * sparkline trend line. Used for the primary metric in the overview section.
 */

import { type ReactNode } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { useCountUp } from '../../hooks/useCountUp';

interface HeroStatCardProps {
  icon: ReactNode;
  value: number;
  label: string;
  sparklineData: { date: string; value: number }[];
  sparklineColor: string;
  baseDelay?: number;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  visible: ([_, base]: [number, number]) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      delay: base,
      ease: [0.25, 1, 0.5, 1],
    },
  }),
};

export function HeroStatCard({
  icon,
  value,
  label,
  sparklineData,
  sparklineColor,
  baseDelay = 0,
}: HeroStatCardProps) {
  const animated = useCountUp(value);

  return (
    <motion.div
      custom={[0, baseDelay]}
      initial="hidden"
      animate="visible"
      variants={cardVariants}
      className="stat-card-glass stat-card-sweep rounded-2xl p-6 md:p-8
                 transition-all duration-300
                 hover:shadow-[0_0_24px_hsl(var(--moltverse-indigo)/0.15)]
                 hover:-translate-y-1.5 group"
    >
      <div className="flex items-start gap-5">
        {/* Icon */}
        <div className="text-primary flex-shrink-0 transition-all duration-300
                        group-hover:drop-shadow-[0_0_8px_hsl(var(--moltverse-indigo)/0.4)]">
          {icon}
        </div>

        {/* Value + sparkline */}
        <div className="flex-1 min-w-0">
          <div className="font-mono font-bold text-5xl md:text-6xl text-primary
                          transition-all duration-300 group-hover:text-glow-indigo mb-1">
            {formatNumber(animated)}
          </div>
          <div className="uppercase tracking-wide text-muted-foreground font-medium text-sm mb-3">
            {label}
          </div>

          {/* Sparkline */}
          <div className="h-12">
            <ResponsiveContainer width="100%" height={48}>
              <LineChart data={sparklineData}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={sparklineColor}
                  strokeWidth={2}
                  dot={false}
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function HeroStatCardSkeleton() {
  return (
    <div className="stat-card-glass skeleton-shimmer rounded-2xl p-6 md:p-8">
      <div className="flex items-start gap-5">
        <div className="rounded-full bg-muted/60 w-10 h-10 flex-shrink-0" />
        <div className="flex-1">
          <div className="h-14 w-32 rounded bg-muted/60 mb-2" />
          <div className="h-4 w-16 rounded bg-muted/60 mb-3" />
          <div className="h-12 w-full rounded bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
