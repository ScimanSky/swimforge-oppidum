import { Skeleton } from "@/components/ui/skeleton"

/** Placeholder posts with the Corsia feed layout: header, text, activity card, actions. */
export default function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Caricamento del feed">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-3 border-b border-border pb-4 pt-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-44" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-[116px] rounded-2xl" />
          <div className="flex gap-4">
            <Skeleton className="h-6 w-14" />
            <Skeleton className="h-6 w-14" />
          </div>
        </div>
      ))}
    </div>
  )
}
