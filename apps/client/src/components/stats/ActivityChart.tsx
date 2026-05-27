/**
 * ActivityChart - Premium chart with SVG glow filter, glass tooltip,
 * animated active dot, and accent bar title. Supports area and bar variants.
 */

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { useTheme } from '../../theme';

interface DataPoint {
  date: string;
  value: number;
}

interface ActivityChartProps {
  title: string;
  data: DataPoint[];
  color: string;
  gradientId: string;
  index?: number;
  baseDelay?: number;
  variant?: 'area' | 'bar';
  height?: number;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;

  return (
    <div className="chart-tooltip-glass px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {format(parseISO(label), 'MMM dd, yyyy')}
      </p>
      <p className="font-mono text-sm font-semibold text-foreground">{payload[0].value}</p>
    </div>
  );
}

function PulsingDot(props: Record<string, unknown>) {
  const { cx, cy, stroke } = props as { cx: number; cy: number; stroke: string };
  if (cx === null || cx === undefined || cy === null || cy === undefined) return null;

  return (
    <g>
      {/* Outer pulsing ring */}
      <circle cx={cx} cy={cy} r={4} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.4}>
        <animate attributeName="r" values="4;10;4" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
      {/* Inner dot */}
      <circle cx={cx} cy={cy} r={4} fill={stroke} stroke="hsl(var(--background))" strokeWidth={2} />
    </g>
  );
}

// custom value = [index, baseDelay]
const chartVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.95 },
  visible: ([i, base]: [number, number]) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      delay: base + i * 0.15,
      ease: [0.25, 1, 0.5, 1],
    },
  }),
};

export function ActivityChart({
  title,
  data,
  color,
  gradientId,
  index = 0,
  baseDelay = 0,
  variant = 'area',
  height = 200,
}: ActivityChartProps) {
  const { resolvedMode } = useTheme();
  const isDark = resolvedMode === 'dark';

  const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const textColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)';

  const glowFilterId = `${gradientId}-glow`;
  const isBar = variant === 'bar';

  const sharedAxisProps = {
    tick: { fontSize: 10, fill: textColor, fontFamily: 'Fira Code, monospace' },
    tickLine: false as const,
    axisLine: false as const,
  };

  const tooltipCursor = isBar
    ? { fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }
    : { stroke: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', strokeDasharray: '4 4' };

  return (
    <motion.div
      custom={[index, baseDelay]}
      initial="hidden"
      animate="visible"
      variants={chartVariants}
      className="stat-card-glass rounded-2xl p-5"
    >
      {/* Accent bar + title */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-1 h-5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        {isBar ? (
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={isDark ? 0.6 : 0.5} />
                <stop offset="100%" stopColor={color} stopOpacity={isDark ? 0.25 : 0.2} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="date"
              {...sharedAxisProps}
              tickFormatter={(val: string) => format(parseISO(val), 'dd')}
              interval="preserveStartEnd"
            />
            <YAxis {...sharedAxisProps} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={tooltipCursor} />
            <Bar
              dataKey="value"
              fill={`url(#${gradientId})`}
              stroke={color}
              strokeWidth={1}
              radius={[4, 4, 0, 0]}
              animationDuration={800}
            />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={isDark ? 0.35 : 0.3} />
                <stop offset="50%" stopColor={color} stopOpacity={isDark ? 0.15 : 0.12} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation={isDark ? 3 : 1.5} result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="date"
              {...sharedAxisProps}
              tickFormatter={(val: string) => format(parseISO(val), 'dd')}
              interval="preserveStartEnd"
            />
            <YAxis {...sharedAxisProps} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} cursor={tooltipCursor} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              filter={`url(#${glowFilterId})`}
              activeDot={<PulsingDot />}
              animationDuration={800}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </motion.div>
  );
}
