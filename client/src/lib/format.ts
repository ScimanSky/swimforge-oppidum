type DateInput = string | Date
const toDate = (value: DateInput) => (value instanceof Date ? value : new Date(value))
const weekdayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short" })
const dayMonthFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" })
const timeFmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" })
const kmFmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 })

/** «lun 26 ott · 10:47» */
export const formatSessionDate = (value: DateInput) => {
  const date = toDate(value)
  return `${weekdayFmt.format(date)} ${dayMonthFmt.format(date)} · ${timeFmt.format(date)}`
}

/** «26 ott» */
export const formatDayMonth = (value: DateInput) => dayMonthFmt.format(toDate(value))

/** «lun 26 ott» */
export const formatWeekdayDayMonth = (value: DateInput) => {
  const date = toDate(value)
  return `${weekdayFmt.format(date)} ${dayMonthFmt.format(date)}`
}

/** Kilometres with Italian decimal comma, no unit: 3200 → «3,2». */
export const formatKm = (meters: number) => kmFmt.format(Math.round(meters / 100) / 10)

export const formatDistance = (meters?: number | null) => {
  if (!meters) return "—"
  return meters >= 1000 ? `${formatKm(meters)} km` : `${Math.round(meters)} m`
}

/** 3720 s → { value: "1:02", unit: "h" }; 3000 s → { value: "50", unit: "min" }; 0 → null. */
export const formatDurationParts = (
  seconds?: number | null
): { value: string; unit: string } | null => {
  if (!seconds || seconds <= 0) return null
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return { value: String(minutes), unit: "min" }
  return { value: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`, unit: "h" }
}

/** Seconds per 100 m → «1:52». */
export const formatPaceValue = (secondsPer100m: number) => {
  const total = Math.round(secondsPer100m)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/** Stored pace when present, otherwise duration / (distance / 100); null without distance. */
export const paceSecondsPer100m = (activity: {
  avgPacePer100m?: number | null
  distanceMeters?: number | null
  durationSeconds?: number | null
}) => {
  if (activity.avgPacePer100m && activity.avgPacePer100m > 0) return activity.avgPacePer100m
  if (!activity.distanceMeters || activity.distanceMeters <= 0 || !activity.durationSeconds) return null
  return activity.durationSeconds / (activity.distanceMeters / 100)
}

export const formatDuration = (seconds?: number | null) => {
  if (!seconds) return "—"
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return `${minutes} min`
}

export const formatPace = (meters?: number | null, seconds?: number | null) => {
  if (!meters || !seconds || meters <= 0) return "—"
  const pace = seconds / (meters / 100)
  if (!Number.isFinite(pace)) return "—"
  const minutes = Math.floor(pace / 60)
  const secs = Math.round(pace % 60)
  return `${minutes}:${secs.toString().padStart(2, "0")}/100m`
}

export const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString)
  const diffMs = Date.now() - date.getTime()
  const isFuture = diffMs < 0
  const diffMinutes = Math.floor(Math.abs(diffMs) / 60000)
  if (diffMinutes < 1) return isFuture ? "tra poco" : "adesso"
  if (diffMinutes < 60) return isFuture ? `tra ${diffMinutes} min` : `${diffMinutes} min fa`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return isFuture ? `tra ${diffHours}h` : `${diffHours}h fa`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return isFuture ? `tra ${diffDays}g` : `${diffDays}g fa`
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" })
}

export const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SW"
