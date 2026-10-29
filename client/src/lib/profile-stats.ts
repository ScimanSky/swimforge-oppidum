/**
 * Pure helpers for the profile: activity field pickers (activities come in camelCase or
 * snake_case), stroke/source labels and the streak of weeks with at least two swims.
 */

import { addDaysToKey, weekStartKey, weeklyStreak } from "@shared/swimMetrics"
import { toFiniteNumber } from "@/lib/format"

export type ActivityLike = Record<string, any>

export const STROKE_LABELS: Record<string, string> = {
  freestyle: "Stile libero",
  backstroke: "Dorso",
  breaststroke: "Rana",
  butterfly: "Farfalla",
  mixed: "Misti",
}

export const SOURCE_LABELS: Record<string, string> = {
  official: "Gara",
  training: "Allenamento",
}

/** Swims a week needs to count for the streak (shared with Statistiche and the coach). */
const STREAK_MIN_PER_WEEK = 2
/** Short unit of the streak next to its number. */
export const STREAK_UNIT = "sett."
/** What the streak counts, shown under it. */
export const STREAK_EXPLANATION = "Serie: settimane di fila con almeno 2 nuotate."

/** Date or null; «2026-10-26 23:30:00» (no zone) is read as local time. */
export const parseActivityDate = (value?: string | Date | null) => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === "string") {
    const normalized = value.includes("T") ? value : value.replace(" ", "T")
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

export const getActivityDateValue = (activity: ActivityLike) =>
  activity?.activityDate ?? activity?.activity_date ?? activity?.createdAt ?? activity?.created_at ?? null

export const getActivityAvgSwolf = (activity: ActivityLike) =>
  toFiniteNumber(activity?.avgSwolf ?? activity?.avg_swolf) ?? 0

export const getActivityStroke = (activity: ActivityLike): string =>
  activity?.strokeType ?? activity?.stroke_type ?? activity?.stroke ?? "mixed"

/** Local calendar day «YYYY-MM-DD» (never via `toISOString`, which is the UTC day). */
export const localDayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

/** The dates of the activities that have a valid one. */
export const activityDays = (activities: ActivityLike[]) =>
  activities
    .map(activity => parseActivityDate(getActivityDateValue(activity)))
    .filter((date): date is Date => date instanceof Date)

/**
 * Streak in weeks (Monday to Sunday, Rome) with at least two swims. `current` counts back from
 * this week, which does not break it until it is over; `best` is the longest run among the
 * given swims (never shorter than `current`).
 */
export const getStreaks = (swims: Date[], now: Date = new Date()) => {
  if (swims.length === 0) return { current: 0, best: 0 }
  const perWeek = new Map<string, number>()
  for (const swim of swims) {
    const week = weekStartKey(swim)
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
  }

  const thisWeek = weekStartKey(now)
  let best = 0
  let run = 0
  for (let week = Array.from(perWeek.keys()).sort()[0]; week <= thisWeek; week = addDaysToKey(week, 7)) {
    run = (perWeek.get(week) ?? 0) >= STREAK_MIN_PER_WEEK ? run + 1 : 0
    best = Math.max(best, run)
  }

  return { current: weeklyStreak(swims, now, STREAK_MIN_PER_WEEK), best }
}

/** Label of the most frequent stroke of the activities; null without activities or when unknown. */
export const primaryStrokeLabel = (activities: ActivityLike[]) => {
  const counts = new Map<string, number>()
  for (const activity of activities) {
    const stroke = getActivityStroke(activity) || "mixed"
    counts.set(stroke, (counts.get(stroke) ?? 0) + 1)
  }
  const [top] = Array.from(counts).sort((a, b) => b[1] - a[1])
  return top ? (STROKE_LABELS[top[0]] ?? null) : null
}
