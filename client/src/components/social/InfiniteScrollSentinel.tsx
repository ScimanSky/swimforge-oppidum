import { useEffect, useRef } from "react"

interface InfiniteScrollSentinelProps {
  onIntersect: () => void
  hasMore: boolean
  isLoading?: boolean
}

export default function InfiniteScrollSentinel({
  onIntersect,
  hasMore,
  isLoading,
}: InfiniteScrollSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasMore || isLoading) return

    const el = sentinelRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onIntersect()
        }
      },
      { rootMargin: "200px" }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, isLoading, onIntersect])

  if (!hasMore) return null

  return (
    <div ref={sentinelRef} className="flex justify-center py-4">
      {isLoading && (
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" />
      )}
    </div>
  )
}
