export default function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="surface-panel p-3.5 animate-pulse">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-20 rounded bg-muted" />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            <div className="h-14 rounded-2xl bg-muted" />
            <div className="h-14 rounded-2xl bg-muted" />
            <div className="h-14 rounded-2xl bg-muted" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-2/3 rounded bg-muted" />
          </div>
          <div className="mt-3 flex gap-2">
            <div className="h-8 w-24 rounded-lg bg-muted" />
            <div className="h-8 w-28 rounded-lg bg-muted" />
          </div>
        </div>
      ))}
    </div>
  )
}
