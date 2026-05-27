/**
 * FeedCardSkeleton - Loading placeholder for feed cards
 *
 * Renders a mix of skeleton variants to approximate the visual variety
 * of the real feed (posts with body, photos with image, compact activities).
 * Used for initial loading and infinite scroll loading states.
 */

interface FeedCardSkeletonProps {
  /** Number of skeleton cards to render */
  count?: number;
}

/** Rich post skeleton — avatar + name + body lines */
function PostSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden animate-pulse">
      <div className="flex items-center gap-3 p-4 pb-2">
        <div className="w-10 h-10 rounded-full bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-28 bg-muted rounded" />
          <div className="h-3 w-36 bg-muted/70 rounded" />
        </div>
      </div>
      <div className="px-4 pb-4 space-y-2">
        <div className="h-3.5 w-full bg-muted/60 rounded" />
        <div className="h-3.5 w-4/5 bg-muted/60 rounded" />
        <div className="h-3.5 w-2/3 bg-muted/50 rounded" />
      </div>
    </div>
  );
}

/** Photo/image skeleton — avatar + name + image block */
function PhotoSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden animate-pulse">
      <div className="flex items-center gap-3 p-4 pb-2">
        <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-32 bg-muted rounded" />
          <div className="h-3 w-24 bg-muted/70 rounded" />
        </div>
      </div>
      <div className="px-4 pb-4">
        <div className="h-36 w-full bg-muted/50 rounded-lg" />
      </div>
    </div>
  );
}

/** Compact activity skeleton — icon + avatar + single line */
function CompactSkeleton() {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden animate-pulse">
      <div className="flex items-start gap-3 p-4">
        <div className="hidden sm:block w-8 h-8 rounded-full bg-muted flex-shrink-0" />
        <div className="w-8 h-8 rounded-full bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-3/4 bg-muted/60 rounded" />
          <div className="h-3 w-20 bg-muted/40 rounded" />
        </div>
      </div>
    </div>
  );
}

/** Cycle through skeleton variants for visual variety */
const skeletonVariants = [PostSkeleton, CompactSkeleton, PhotoSkeleton, CompactSkeleton];

export function FeedCardSkeleton({ count = 3 }: FeedCardSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => {
        const Variant = skeletonVariants[i % skeletonVariants.length];
        return <Variant key={i} />;
      })}
    </div>
  );
}
