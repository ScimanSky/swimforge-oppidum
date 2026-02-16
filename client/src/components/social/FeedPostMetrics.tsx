import { Ruler, Clock, Gauge } from "lucide-react"
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
    <div className="grid grid-cols-[1fr_auto] gap-2.5 mx-4 mt-3">
      {/* Primary metric: distance - spans left, tall */}
      <div className="relative row-span-2 rounded-2xl border border-white/14 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--background)_86%,transparent),color-mix(in_oklch,var(--background)_70%,transparent))] p-4 flex flex-col justify-center overflow-hidden backdrop-blur-sm shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_12%,transparent)]">
        <p className="text-2xl font-display font-bold text-foreground leading-tight">{distance}</p>
        <p className="text-[10px] text-foreground/70 mt-0.5">Distanza</p>
        <Ruler className="absolute bottom-2 right-2 size-8 text-foreground/[0.14]" />
      </div>

      {/* Duration - top right */}
      <div className="relative rounded-2xl border border-white/14 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--background)_84%,transparent),color-mix(in_oklch,var(--background)_68%,transparent))] p-3 min-w-[120px] overflow-hidden backdrop-blur-sm shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_10%,transparent)]">
        <p className="text-sm font-display font-bold text-foreground">{duration}</p>
        <p className="text-[10px] text-foreground/70">Durata</p>
        <Clock className="absolute bottom-1.5 right-1.5 size-5 text-foreground/[0.14]" />
      </div>

      {/* Pace - bottom right */}
      <div className="relative rounded-2xl border border-white/14 bg-[linear-gradient(135deg,color-mix(in_oklch,var(--background)_84%,transparent),color-mix(in_oklch,var(--background)_68%,transparent))] p-3 min-w-[120px] overflow-hidden backdrop-blur-sm shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--electric-cyan)_10%,transparent)]">
        <p className="text-sm font-display font-bold text-foreground">{pace}</p>
        <p className="text-[10px] text-foreground/70">Pace</p>
        <Gauge className="absolute bottom-1.5 right-1.5 size-5 text-foreground/[0.14]" />
      </div>
    </div>
  )
}
