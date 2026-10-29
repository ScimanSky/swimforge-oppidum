/**
 * Critical swim speed (CSS): critical velocity of Wakayoshi et al. (1992), estimated from the best
 * continuous freestyle pool laps, with the 400/200 version of Ginn (1993) as fallback and for the
 * user's test.
 */
import { addDaysToKey, dayKey } from "@shared/swimMetrics";
import { activeLaps, isPoolSwim, type MetricActivity } from "./laps";

/** Lap distances that count as a continuous effort. */
export const CSS_EFFORT_DISTANCES = [200, 300, 400, 500, 600, 800, 1000, 1500] as const;
/** Efforts used by the regression: between 2 and 30 minutes. */
const MIN_EFFORT_SECONDS = 120;
const MAX_EFFORT_SECONDS = 1800;
/** Accepted CSS pace, seconds per 100 m (1:00 – 3:30). */
const MIN_PACE = 60;
const MAX_PACE = 210;
/** Estimates look back this many days. */
export const CSS_WINDOW_DAYS = 90;

export type CssEffort = { distanceMeters: number; seconds: number; date: string };

export type CssEstimate = {
  speedMps: number;
  paceSecondsPer100: number;
  confidence: "alta" | "media";
  points: CssEffort[];
};

const isFreestyle = (stroke: string | null) => stroke === "freestyle";

/**
 * Best time per distance among the active freestyle laps of pool swims whose Rome day is in
 * [fromDay, toDay], for the distances of CSS_EFFORT_DISTANCES. Sorted by distance.
 */
export function bestEfforts(activities: MetricActivity[], fromDay: string, toDay: string): CssEffort[] {
  const best = new Map<number, CssEffort>();
  for (const activity of activities) {
    if (!isPoolSwim(activity) || activity.day < fromDay || activity.day > toDay) continue;
    for (const lap of activeLaps(activity.laps)) {
      if (!isFreestyle(lap.stroke)) continue;
      if (!(CSS_EFFORT_DISTANCES as readonly number[]).includes(lap.distanceMeters)) continue;
      const current = best.get(lap.distanceMeters);
      if (!current || lap.seconds < current.seconds) {
        best.set(lap.distanceMeters, { distanceMeters: lap.distanceMeters, seconds: lap.seconds, date: activity.day });
      }
    }
  }
  return Array.from(best.values()).sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Ginn 400/200: CSS in m/s. */
export function cssFromTest(t200Seconds: number, t400Seconds: number): number {
  return 200 / (t400Seconds - t200Seconds);
}

/** Least squares of distance = CS × time + D′. */
function regression(points: CssEffort[]): { cs: number; dPrime: number } | null {
  const n = points.length;
  const meanT = points.reduce((sum, p) => sum + p.seconds, 0) / n;
  const meanD = points.reduce((sum, p) => sum + p.distanceMeters, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.seconds - meanT) * (p.distanceMeters - meanD);
    sxx += (p.seconds - meanT) ** 2;
  }
  if (sxx === 0) return null;
  const cs = sxy / sxx;
  return { cs, dPrime: meanD - cs * meanT };
}

/**
 * CSS from best efforts. Needs at least two efforts of 2–30 minutes, one up to 400 m and one from
 * 400 m up. A regression with CS ≤ 0 or D′ < 0 falls back to Ginn on the best 200 and 400. The
 * result must be a pace between 1:00 and 3:30/100 m and not faster than the best 200, else null.
 */
export function estimateCss(efforts: CssEffort[]): CssEstimate | null {
  const points = efforts
    .filter((e) => e.seconds >= MIN_EFFORT_SECONDS && e.seconds <= MAX_EFFORT_SECONDS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
  if (points.length < 2) return null;
  if (!points.some((p) => p.distanceMeters <= 400) || !points.some((p) => p.distanceMeters >= 400)) return null;

  let speed: number | null = null;
  let used = points;
  const fit = regression(points);
  if (fit && fit.cs > 0 && fit.dPrime >= 0) {
    speed = fit.cs;
  } else {
    const p200 = points.find((p) => p.distanceMeters === 200);
    const p400 = points.find((p) => p.distanceMeters === 400);
    if (!p200 || !p400 || p400.seconds <= p200.seconds) return null;
    speed = cssFromTest(p200.seconds, p400.seconds);
    used = [p200, p400];
  }

  const pace = 100 / speed;
  if (!Number.isFinite(pace) || pace < MIN_PACE || pace > MAX_PACE) return null;
  const best200 = efforts.find((e) => e.distanceMeters === 200);
  // Small tolerance for floating point: equal to the 200 pace is allowed.
  if (best200 && pace < best200.seconds / 2 - 1e-9) return null;

  const distances = used.map((p) => p.distanceMeters);
  const ratio = Math.max(...distances) / Math.min(...distances);
  return {
    speedMps: speed,
    paceSecondsPer100: pace,
    confidence: used.length >= 3 && ratio >= 3 ? "alta" : "media",
    points: used,
  };
}

/** Estimate on the CSS_WINDOW_DAYS days ending on `toDay` (included). */
export function estimateCssAt(activities: MetricActivity[], toDay: string): CssEstimate | null {
  return estimateCss(bestEfforts(activities, addDaysToKey(toDay, -(CSS_WINDOW_DAYS - 1)), toDay));
}

const monthKey = (day: string) => day.slice(0, 7);

function shiftMonth(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Last day of a «YYYY-MM» month. */
const lastDayOfMonth = (month: string) => addDaysToKey(`${shiftMonth(month, 1)}-01`, -1);

/**
 * Estimate at the end of each of the last `months` months (the current one ends today), each on
 * the 90 days before it. Oldest first.
 */
export function cssHistory(
  activities: MetricActivity[],
  now: Date,
  months = 6,
): { month: string; estimate: CssEstimate | null }[] {
  const today = dayKey(now);
  const current = monthKey(today);
  const history: { month: string; estimate: CssEstimate | null }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const month = shiftMonth(current, -i);
    const end = i === 0 ? today : lastDayOfMonth(month);
    history.push({ month, estimate: estimateCssAt(activities, end) });
  }
  return history;
}
