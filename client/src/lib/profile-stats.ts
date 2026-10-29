/**
 * Pure helpers for the profile: activity field pickers (activities come in camelCase or
 * snake_case), stroke/source labels and the Mon/Wed/Fri training streak.
 */

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

/** Training days of the streak: Monday, Wednesday, Friday (`Date.getDay()`). */
const TRAINING_DAYS = new Set([1, 3, 5])
/** How far back the streak looks. */
const STREAK_WINDOW_DAYS = 365

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return 0
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

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
  toNumber(activity?.avgSwolf ?? activity?.avg_swolf ?? 0)

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
 * Consecutive Mon/Wed/Fri training days with a swim, in local days. `current` ends at the last
 * training day up to today (today, while not swum yet, does not break it); `best` is the longest
 * run in the last year.
 */
export const getStreaks = (swims: Date[], now: Date = new Date()) => {
  if (swims.length === 0) return { current: 0, best: 0 }
  const swum = new Set(swims.map(localDayKey))

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const trainingDates: string[] = []
  for (let i = STREAK_WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const day = new Date(today)
    day.setDate(day.getDate() - i)
    if (TRAINING_DAYS.has(day.getDay())) trainingDates.push(localDayKey(day))
  }

  let best = 0
  let run = 0
  for (const day of trainingDates) {
    run = swum.has(day) ? run + 1 : 0
    best = Math.max(best, run)
  }

  let end = trainingDates.length - 1
  if (TRAINING_DAYS.has(today.getDay()) && !swum.has(localDayKey(today))) end -= 1
  let current = 0
  for (let i = end; i >= 0 && swum.has(trainingDates[i]); i -= 1) current += 1

  return { current, best }
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
