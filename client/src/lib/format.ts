type DateInput = string | Date
/** Placeholder for a missing value. */
export const NO_VALUE = "—"

/** Date or null when missing or unparsable (never an Invalid Date). */
const toDate = (value: DateInput | null | undefined): Date | null => {
  if (value === null || value === undefined || value === "") return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
const weekdayFmt = new Intl.DateTimeFormat("it-IT", { weekday: "short" })
const dayMonthFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" })
const dayMonthYearFmt = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" })
const timeFmt = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" })
// One grouping rule app-wide: Italian CLDR skips the separator on 4-digit numbers (8420),
// Corsia always shows it («8.420»).
const kmFmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1, useGrouping: "always" })
const integerFmt = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" })

/** «lun 26 ott · 10:47»; «—» for a missing or invalid date. */
export const formatSessionDate = (value: DateInput | null | undefined) => {
  const date = toDate(value)
  if (!date) return NO_VALUE
  return `${weekdayFmt.format(date)} ${dayMonthFmt.format(date)} · ${timeFmt.format(date)}`
}

/** «26 ott»; «—» for a missing or invalid date. */
export const formatDayMonth = (value: DateInput | null | undefined) => {
  const date = toDate(value)
  return date ? dayMonthFmt.format(date) : NO_VALUE
}

/** «12 mar 2025»; «—» for a missing or invalid date. */
export const formatDayMonthYear = (value: DateInput | null | undefined) => {
  const date = toDate(value)
  return date ? dayMonthYearFmt.format(date) : NO_VALUE
}

/** «lun 26 ott»; «—» for a missing or invalid date. */
export const formatWeekdayDayMonth = (value: DateInput | null | undefined) => {
  const date = toDate(value)
  if (!date) return NO_VALUE
  return `${weekdayFmt.format(date)} ${dayMonthFmt.format(date)}`
}

/** Integer with the Italian thousands separator, always: 8420 → «8.420»; «—» if not finite. */
export const formatInteger = (value: number) =>
  Number.isFinite(value) ? integerFmt.format(Math.round(value)) : NO_VALUE

/** Rounded integer with its sign (typographic minus): 12 → «+12», −3.6 → «−4», 0 → «0»; null if not a number. */
export const formatSignedInteger = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded === 0) return "0"
  return rounded > 0 ? `+${formatInteger(rounded)}` : `−${formatInteger(-rounded)}`
}

/** Kilometres with Italian decimal comma, no unit: 3200 → «3,2»; «—» if not finite. */
export const formatKm = (meters: number) =>
  Number.isFinite(meters) ? kmFmt.format(Math.round(meters / 100) / 10) : NO_VALUE

/**
 * The app's one distance rule, split for `<Metric>`: { value: "3,2", unit: "km" } or
 * { value: "800", unit: "m" } (chosen after rounding: 999.6 → 1 km); { value: "—" } without a
 * positive value.
 */
export const distanceParts = (meters?: number | null): { value: string; unit?: string } => {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters <= 0)
    return { value: NO_VALUE }
  const rounded = Math.round(meters)
  return rounded >= 1000 ? { value: formatKm(meters), unit: "km" } : { value: String(rounded), unit: "m" }
}

/** «3,2 km» or «800 m» (same rule as `distanceParts`); «—» without a positive value. */
export const formatDistance = (meters?: number | null) => {
  const { value, unit } = distanceParts(meters)
  return unit ? `${value} ${unit}` : value
}

/** 3720 s → { value: "1:02", unit: "h" }; 3000 s → { value: "50", unit: "min" }; 1-29 s → 1 min; 0 → null. */
export const formatDurationParts = (
  seconds?: number | null
): { value: string; unit: string } | null => {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return { value: String(minutes), unit: "min" }
  return { value: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`, unit: "h" }
}

/** Seconds per 100 m → «1:52»; «—» when not finite or not positive. */
export const formatPaceValue = (secondsPer100m: number) => {
  if (!Number.isFinite(secondsPer100m) || secondsPer100m <= 0) return NO_VALUE
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
  if (!Number.isFinite(pace) || pace <= 0) return "—"
  // Rounded before splitting: 119.6 s is «2:00», never «1:60».
  return `${formatPaceValue(pace)}/100m`
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
