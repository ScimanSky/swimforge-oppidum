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
    <div className="mx-4 mt-3">
      <div className="grid grid-cols-[minmax(0,1fr)_128px] gap-2.5 rounded-2xl border border-white/12 bg-[linear-gradient(120deg,rgba(2,8,23,0.48),rgba(15,23,42,0.22))] p-1.5 backdrop-blur-[2px]">
        <div className="relative row-span-2 overflow-hidden rounded-[18px] border border-cyan-300/20 bg-[linear-gradient(120deg,rgba(2,6,23,0.9),rgba(6,39,61,0.72))] p-4 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.16)]">
          <div className="mb-1 inline-flex items-center gap-1 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100/90">
            <Ruler className="size-3" />
            Distanza
          </div>
          <p className="text-[34px] leading-[1.05] font-display font-bold text-white drop-shadow-sm">{distance}</p>
          <div className="pointer-events-none absolute -right-4 -bottom-3 h-16 w-16 rounded-full bg-cyan-300/18 blur-xl" />
          <Ruler className="absolute bottom-2.5 right-2.5 size-8 text-white/15" />
        </div>

        <div className="relative overflow-hidden rounded-[18px] border border-white/16 bg-[linear-gradient(130deg,rgba(3,16,35,0.86),rgba(14,37,63,0.66))] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200/75">
            <Clock className="size-3.5 text-emerald-200/80" />
            Durata
          </div>
          <p className="text-lg font-display font-bold leading-tight text-white">{duration}</p>
          <Clock className="absolute bottom-1.5 right-1.5 size-5 text-white/14" />
          <div className="pointer-events-none absolute -right-2 -top-2 h-10 w-10 rounded-full bg-emerald-300/15 blur-lg" />
        </div>

        <div className="relative overflow-hidden rounded-[18px] border border-white/16 bg-[linear-gradient(130deg,rgba(3,16,35,0.86),rgba(14,37,63,0.66))] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-200/75">
            <Gauge className="size-3.5 text-cyan-200/80" />
            Pace
          </div>
          <p className="text-lg font-display font-bold leading-tight text-white">{pace}</p>
          <Gauge className="absolute bottom-1.5 right-1.5 size-5 text-white/14" />
          <div className="pointer-events-none absolute -right-2 -top-2 h-10 w-10 rounded-full bg-cyan-300/15 blur-lg" />
        </div>
      </div>
    </div>
  )
}
