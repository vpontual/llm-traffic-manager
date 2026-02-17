function Bone({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-surface-overlay/50 ${className ?? ""}`}
    />
  );
}

/** Matches the 4-column server card grid */
export function ServerGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="bg-surface-raised border border-border rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center gap-2">
            <Bone className="w-2 h-2 rounded-full" />
            <Bone className="h-4 w-24" />
          </div>
          <Bone className="h-3 w-full" />
          <div className="space-y-1">
            <Bone className="h-3 w-32" />
            <Bone className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Matches the 5-column fleet summary stat boxes */
export function FleetSummarySkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="bg-surface-raised border border-border rounded-lg px-4 py-3 space-y-2"
        >
          <Bone className="h-3 w-20" />
          <Bone className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Matches the 6-column analytics stat boxes */
export function StatBoxesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-surface-raised border border-border rounded-lg px-4 py-3 space-y-2"
        >
          <Bone className="h-3 w-20" />
          <Bone className="h-6 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Generic table skeleton */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-surface-raised border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <Bone key={i} className="h-3 w-16" />
        ))}
      </div>
      <div className="divide-y divide-border/50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-6">
            {Array.from({ length: cols }).map((_, j) => (
              <Bone key={j} className="h-3 w-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
