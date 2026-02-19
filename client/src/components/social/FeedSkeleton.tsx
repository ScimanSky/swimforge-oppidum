export default function FeedSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="surface-panel overflow-hidden p-0">
          {/* Header skeleton */}
          <div className="flex items-center gap-3 px-4 pt-3 pb-2">
            <div className="size-11 rounded-full bg-muted shimmer-bg" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-28 rounded bg-muted shimmer-bg" />
              <div className="h-2.5 w-40 rounded bg-muted shimmer-bg" />
            </div>
          </div>

          {/* Bento metrics skeleton */}
          <div className="grid grid-cols-[1fr_auto] gap-2 mx-4 mt-2">
            <div className="row-span-2 h-[76px] rounded-2xl bg-muted shimmer-bg" />
            <div className="h-[34px] w-[120px] rounded-2xl bg-muted shimmer-bg" />
            <div className="h-[34px] w-[120px] rounded-2xl bg-muted shimmer-bg" />
          </div>

          {/* Content skeleton */}
          <div className="px-4 mt-3 space-y-1.5">
            <div className="h-3 w-full rounded bg-muted shimmer-bg" />
            <div className="h-3 w-2/3 rounded bg-muted shimmer-bg" />
          </div>

          {/* Actions skeleton */}
          <div className="px-4 py-3 flex gap-4">
            <div className="h-5 w-16 rounded bg-muted shimmer-bg" />
            <div className="h-5 w-20 rounded bg-muted shimmer-bg" />
            <div className="h-5 w-18 rounded bg-muted shimmer-bg" />
          </div>
        </div>
      ))}
    </div>
  )
}
