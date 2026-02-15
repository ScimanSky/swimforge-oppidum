import { formatDistance, formatDuration, formatPace } from "@/lib/format"

interface FeedPostMetricsProps {
  distanceMeters?: number | null
  durationSeconds?: number | null
}

export default function FeedPostMetrics({ distanceMeters, durationSeconds }: FeedPostMetricsProps) {
  if (!distanceMeters && !durationSeconds) return null

  const distance = formatDistance(distanceMeters)
  const duration = formatDuration(durationSeconds)
  const pace = formatPace(distanceMeters, durationSeconds)

  return (
    <div className="grid grid-cols-3 gap-2.5 mt-3">
      <div className="rounded-2xl border border-border/80 bg-background/60 p-3">
        <p className="text-sm font-display font-bold text-foreground">{distance}</p>
        <p className="text-[10px] text-muted-foreground">Distanza</p>
      </div>
      <div className="rounded-2xl border border-border/80 bg-background/60 p-3">
        <p className="text-sm font-display font-bold text-foreground">{duration}</p>
        <p className="text-[10px] text-muted-foreground">Durata</p>
      </div>
      <div className="rounded-2xl border border-border/80 bg-background/60 p-3">
        <p className="text-sm font-display font-bold text-foreground">{pace}</p>
        <p className="text-[10px] text-muted-foreground">Pace</p>
      </div>
    </div>
  )
}
