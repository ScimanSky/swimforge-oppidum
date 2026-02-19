import { Ruler, Clock, Gauge, Flame, Heart, Activity, type LucideIcon } from "lucide-react"
import { formatDistance, formatDuration, formatPace } from "@/lib/format"

interface Metric {
  icon: LucideIcon
  label: string
  value: string
  color: "cyan" | "emerald" | "amber" | "forge" | "sky" | "violet"
}

const colorMap = {
  cyan: {
    bg: "bg-[var(--chip-cyan)]/12",
    border: "border-[var(--chip-cyan)]/25",
    text: "text-[var(--chip-cyan)]",
    icon: "text-[var(--chip-cyan)]",
    glow: "shadow-[0_0_12px_rgba(56,189,248,0.15)]",
  },
  emerald: {
    bg: "bg-[var(--chip-emerald)]/12",
    border: "border-[var(--chip-emerald)]/25",
    text: "text-[var(--chip-emerald)]",
    icon: "text-[var(--chip-emerald)]",
    glow: "shadow-[0_0_12px_rgba(52,211,153,0.15)]",
  },
  amber: {
    bg: "bg-[var(--chip-amber)]/12",
    border: "border-[var(--chip-amber)]/25",
    text: "text-[var(--chip-amber)]",
    icon: "text-[var(--chip-amber)]",
    glow: "shadow-[0_0_12px_rgba(251,191,36,0.15)]",
  },
  forge: {
    bg: "bg-[var(--forge-orange)]/12",
    border: "border-[var(--forge-orange)]/26",
    text: "text-[var(--forge-orange)]",
    icon: "text-[var(--forge-orange)]",
    glow: "shadow-[0_0_14px_var(--forge-glow)]",
  },
  sky: {
    bg: "bg-[var(--chip-sky)]/12",
    border: "border-[var(--chip-sky)]/25",
    text: "text-[var(--chip-sky)]",
    icon: "text-[var(--chip-sky)]",
    glow: "shadow-[0_0_12px_rgba(56,189,248,0.15)]",
  },
  violet: {
    bg: "bg-[var(--chip-violet)]/12",
    border: "border-[var(--chip-violet)]/25",
    text: "text-[var(--chip-violet)]",
    icon: "text-[var(--chip-violet)]",
    glow: "shadow-[0_0_12px_rgba(167,139,250,0.15)]",
  },
}

interface FeedPostMetricsProps {
  distanceMeters?: number | null
  durationSeconds?: number | null
  calories?: number | null
  heartRate?: number | null
  swolf?: number | null
}

export default function FeedPostMetrics({
  distanceMeters,
  durationSeconds,
  calories,
  heartRate,
  swolf,
}: FeedPostMetricsProps) {
  const metrics: Metric[] = []
  const distanceValue = Number(distanceMeters ?? 0)
  const durationValue = Number(durationSeconds ?? 0)
  const caloriesValue = Number(calories ?? 0)
  const heartRateValue = Number(heartRate ?? 0)
  const swolfValue = Number(swolf ?? 0)

  if (distanceValue > 0) {
    metrics.push({
      icon: Ruler,
      label: "Distanza",
      value: formatDistance(distanceMeters),
      color: "cyan",
    })
  }

  if (durationValue > 0) {
    metrics.push({
      icon: Clock,
      label: "Durata",
      value: formatDuration(durationSeconds),
      color: "emerald",
    })
  }

  if (distanceValue > 0 && durationValue > 0) {
    metrics.push({
      icon: Gauge,
      label: "Pace",
      value: formatPace(distanceMeters, durationSeconds),
      color: "amber",
    })
  }

  if (caloriesValue > 0) {
    metrics.push({ icon: Flame, label: "Calorie", value: `${caloriesValue} kcal`, color: "forge" })
  }

  if (heartRateValue > 0) {
    metrics.push({ icon: Heart, label: "HR media", value: `${heartRateValue} bpm`, color: "sky" })
  }

  if (swolfValue > 0) {
    metrics.push({ icon: Activity, label: "SWOLF", value: `${swolfValue}`, color: "violet" })
  }

  if (metrics.length === 0) return null

  return (
    <div className="px-4 pb-1 pt-2">
      <div className="flex flex-wrap gap-2">
        {metrics.map((metric) => {
          const colors = colorMap[metric.color]
          const Icon = metric.icon
          return (
            <div
              key={metric.label}
              className={[
                "group relative flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5",
                "backdrop-blur-sm transition-all duration-200",
                "hover:scale-[1.03] active:scale-[0.98]",
                colors.bg,
                colors.border,
                colors.glow,
              ].join(" ")}
            >
              <div
                className={[
                  "flex size-9 items-center justify-center rounded-xl border",
                  colors.bg,
                  colors.border,
                ].join(" ")}
              >
                <Icon className={`size-[18px] ${colors.icon}`} />
              </div>
              <div className="flex flex-col">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider opacity-70 ${colors.text}`}
                >
                  {metric.label}
                </span>
                <span className="text-base font-bold leading-tight text-white">{metric.value}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
