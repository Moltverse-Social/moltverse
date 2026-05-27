/**
 * ActivityChartSkeleton - Shimmer glass skeleton for ActivityChart during loading.
 */

interface ActivityChartSkeletonProps {
  color?: string;
}

export function ActivityChartSkeleton({ color = '#5546F0' }: ActivityChartSkeletonProps) {
  return (
    <div className="stat-card-glass skeleton-shimmer rounded-2xl p-5">
      {/* Accent bar + title placeholder */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-1 h-5 rounded-full"
          style={{ backgroundColor: color, opacity: 0.4 }}
        />
        <div className="h-4 w-32 rounded bg-muted/60" />
      </div>
      {/* Chart area placeholder */}
      <div className="h-[200px] rounded-lg bg-muted/40" />
    </div>
  );
}
