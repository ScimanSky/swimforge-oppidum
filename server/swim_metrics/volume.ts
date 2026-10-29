/** Weekly volume (Monday to Sunday, Rome) and the streaks of weeks with at least 2 swims. */
import { addDaysToKey, bestWeeklyStreakFromCounts, weekStartKey, weeklyStreakFromCounts } from "@shared/swimMetrics";
import { round } from "./math";

const WEEKS = 12;

export type VolumeSummary = {
  weeks: { weekStart: string; km: number; sessions: number }[];
  avgKm4: number;
  avgSessions4: number;
  changePct: number | null;
  streakWeeks: number;
  bestStreakWeeks: number;
};

/**
 * 12 weeks of km and swims (oldest first, the current week last); averages of the 4 most recent
 * complete weeks and their change from the 4 before (null when those are empty). The current and
 * the best streak use `streak` when given (swim dates, or swims per Rome week, over all the
 * history), else the activity dates.
 */
export function volumeSummary(
  activities: { date: Date; distanceMeters: number }[],
  now: Date,
  streak?: Date[] | Map<string, number>,
): VolumeSummary {
  const current = weekStartKey(now);
  const weekKeys = Array.from({ length: WEEKS }, (_, i) => addDaysToKey(current, -7 * (WEEKS - 1 - i)));
  const totals = new Map(weekKeys.map((key) => [key, { metres: 0, sessions: 0 }]));
  for (const activity of activities) {
    const total = totals.get(weekStartKey(activity.date));
    if (!total) continue;
    total.metres += activity.distanceMeters;
    total.sessions += 1;
  }
  const weeks = weekKeys.map((weekStart) => {
    const total = totals.get(weekStart)!;
    return { weekStart, km: round(total.metres / 1000, 2)!, sessions: total.sessions };
  });

  // Complete weeks: every week but the current (last) one.
  const last4 = weeks.slice(WEEKS - 5, WEEKS - 1);
  const previous4 = weeks.slice(WEEKS - 9, WEEKS - 5);
  const sumKm = (list: typeof weeks) => list.reduce((sum, w) => sum + w.km, 0);
  const avgKm4 = sumKm(last4) / 4;
  const previousKm = sumKm(previous4) / 4;
  const perWeek = streak instanceof Map ? streak : countPerWeek(streak ?? activities.map((a) => a.date));
  return {
    weeks,
    avgKm4: round(avgKm4, 2)!,
    avgSessions4: round(last4.reduce((sum, w) => sum + w.sessions, 0) / 4, 1)!,
    changePct: previousKm > 0 ? round(((avgKm4 - previousKm) / previousKm) * 100, 1) : null,
    streakWeeks: weeklyStreakFromCounts(perWeek, now),
    bestStreakWeeks: bestWeeklyStreakFromCounts(perWeek, now),
  };
}

/** Swims per Rome week (Monday «YYYY-MM-DD»). */
function countPerWeek(dates: Date[]): Map<string, number> {
  const perWeek = new Map<string, number>();
  for (const date of dates) {
    const week = weekStartKey(date);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  return perWeek;
}
