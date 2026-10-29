import { useId } from "react"
import { Metric, type MetricProps } from "@/components/corsia/Metric"
import { formatDurationParts, formatKm, formatPaceValue, paceSecondsPer100m } from "@/lib/format"
import { cn } from "@/lib/utils"

interface FeedPostMetricsProps {
  /** Card title, e.g. «Nuotata in vasca». */
  title?: string
  distanceMeters?: number | string | null
  durationSeconds?: number | string | null
  heartRate?: number | string | null
  swolf?: number | string | null
}

/** Raw SQL values may arrive as strings: a positive finite number or null. */
const positive = (value: number | string | null | undefined) => {
  const number = Number(value ?? 0)
  return Number.isFinite(number) && number > 0 ? number : null
}

const MAX_METRICS = 4

/**
 * Compact activity card of a feed post (Corsia, `renders/Feed.png`): distance, pace in the
 * action colour, duration; average HR and SWOLF only when present; at most four metrics.
 */
export default function FeedPostMetrics({
  title,
  distanceMeters,
  durationSeconds,
  heartRate,
  swolf,
}: FeedPostMetricsProps) {
  const titleId = useId()
  const distance = positive(distanceMeters)
  const duration = positive(durationSeconds)
  const hr = positive(heartRate)
  const swolfScore = positive(swolf)

  const metrics: Omit<MetricProps, "size">[] = []
  if (distance) metrics.push({ value: formatKm(distance), unit: "km", label: "Distanza" })
  const pace = paceSecondsPer100m({ distanceMeters: distance, durationSeconds: duration })
  if (pace) metrics.push({ value: formatPaceValue(pace), label: "Passo /100", tone: "action" })
  const durationParts = formatDurationParts(duration)
  if (durationParts) metrics.push({ value: durationParts.value, unit: durationParts.unit, label: "Durata" })
  if (hr) metrics.push({ value: String(Math.round(hr)), label: "FC media" })
  if (swolfScore) metrics.push({ value: String(Math.round(swolfScore)), label: "SWOLF" })

  const shown = metrics.slice(0, MAX_METRICS)
  if (shown.length === 0) return null
  const four = shown.length === MAX_METRICS

  return (
    // A group, not a landmark: every activity post would otherwise add a region.
    <div
      role="group"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : "Dati della nuotata"}
      className="rounded-2xl border border-border bg-card p-4"
    >
      {title ? (
        <p id={titleId} className="mb-3 truncate text-[15px] font-bold">
          {title}
        </p>
      ) : null}
      <div className={cn("grid gap-3", four ? "grid-cols-4" : "grid-cols-3")}>
        {shown.map((metric) => (
          <Metric key={metric.label} {...metric} size={four ? "sm" : "md"} />
        ))}
      </div>
    </div>
  )
}
