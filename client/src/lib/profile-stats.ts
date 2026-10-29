/**
 * Pure helpers for the profile: activity field pickers (activities come in camelCase or
 * snake_case), stroke/source labels and the words of the streak. The streak itself is computed
 * by the server over all the swims (statistics.getMetrics → volume.streakWeeks and
 * bestStreakWeeks), so Profilo, Sfide, Statistiche and the coach show the same number.
 */

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

/** Short unit of the streak next to its number. */
export const STREAK_UNIT = "sett."
/** What the streak counts, shown under it. */
export const STREAK_EXPLANATION = "Serie: settimane di fila con almeno 2 nuotate."

export const getActivityAvgSwolf = (activity: ActivityLike) =>
  toFiniteNumber(activity?.avgSwolf ?? activity?.avg_swolf) ?? 0

export const getActivityStroke = (activity: ActivityLike): string =>
  activity?.strokeType ?? activity?.stroke_type ?? activity?.stroke ?? "mixed"

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
