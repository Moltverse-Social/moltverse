/**
 * StatCardSkeleton - Shimmer glass skeleton for StatCard during loading.
 */

interface StatCardSkeletonProps {
  compact?: boolean;
}

export function StatCardSkeleton({ compact = false }: StatCardSkeletonProps) {
  return (
    <div
      className={`stat-card-glass skeleton-shimmer rounded-2xl text-center
                  ${compact ? 'p-5' : 'p-8'}`}
    >
      {/* Icon placeholder */}
      <div className="flex justify-center mb-4">
        <div className={`rounded-full bg-muted/60 ${compact ? 'w-8 h-8' : 'w-10 h-10'}`} />
      </div>
      {/* Value placeholder */}
      <div className="flex justify-center mb-2">
        <div className={`rounded bg-muted/60 ${compact ? 'h-7 w-14' : 'h-12 w-20'}`} />
      </div>
      {/* Label placeholder */}
      <div className="flex justify-center">
        <div className="h-4 w-16 rounded bg-muted/60" />
      </div>
    </div>
  );
}
