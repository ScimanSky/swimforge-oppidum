/**
 * Critical swim speed (CSS): critical velocity of Wakayoshi et al. (1992) fitted on the best
 * continuous freestyle pool laps, and the 400/200 version of Ginn (1993) for the user's test.
 */
import { addDaysToKey, dayKey, isYardPool, type CssPoint } from "@shared/swimMetrics";
import { activeLaps, isPoolSwim, type MetricActivity, type NormalizedStroke } from "./laps";

/** Lap distances that count as a continuous effort (in the pool's unit: metres or yards). */
export const CSS_EFFORT_DISTANCES = [200, 300, 400, 500, 600, 800, 1000, 1500] as const;
/** A lap matches a CSS distance within this share (33 m pools, rounding, yards). */
export const CSS_DISTANCE_TOLERANCE = 0.03;
const YARD_METERS = 0.9144;
/** Efforts used by the fit: between 2 and 30 minutes. */
const MIN_EFFORT_SECONDS = 120;
const MAX_EFFORT_SECONDS = 1800;
/** Accepted CSS pace, seconds per 100 m (1:00 – 3:30). */
export const CSS_MIN_PACE = 60;
export const CSS_MAX_PACE = 210;
/** Estimates look back this many days. */
export const CSS_WINDOW_DAYS = 90;
/** «alta» needs D′ within this many metres and at least this R². */
const HIGH_MAX_D_PRIME = 50;
const HIGH_MIN_R2 = 0.98;

/** A freestyle-or-not active lap as the CSS estimate reads it (one light query loads 300 days). */
export type CssLap = {
  day: string;
  poolLengthMeters: number | null;
  isOpenWater: boolean;
  distanceMeters: number;
  seconds: number;
  stroke: NormalizedStroke | null;
};

/** A best effort: the real distance in metres, the matched CSS distance in the pool's unit. */
export type CssEffort = CssPoint;
export type CssDroppedEffort = CssEffort & { slowerThan: CssEffort };

export type CssEstimate = {
  speedMps: number;
  paceSecondsPer100: number;
  confidence: "alta" | "media";
  points: CssEffort[];
  dPrimeMeters: number;
  r2: number;
  /** Best efforts slower than a longer one: submaximal, left out of the fit. */
  dropped: CssDroppedEffort[];
};

/** The active laps of the swims, flattened for the CSS estimate. */
export function cssLapsOf(activities: MetricActivity[]): CssLap[] {
  return activities.flatMap((activity) =>
    activeLaps(activity.laps).map((lap) => ({
      day: activity.day,
      poolLengthMeters: activity.poolLengthMeters,
      isOpenWater: activity.isOpenWater,
      distanceMeters: lap.distanceMeters,
      seconds: lap.seconds,
      stroke: lap.stroke,
    })),
  );
}

/** The CSS distance a lap matches (±3%), in yards in a 25-yard pool, else in metres; or null. */
export function matchCssDistance(
  distanceMeters: number,
  poolLengthMeters: number | null,
): { nominalDistance: number; distanceUnit: "m" | "yd" } | null {
  const distanceUnit = isYardPool(poolLengthMeters) ? "yd" : "m";
  const inUnit = distanceUnit === "yd" ? distanceMeters / YARD_METERS : distanceMeters;
  for (const nominalDistance of CSS_EFFORT_DISTANCES) {
    if (Math.abs(inUnit - nominalDistance) <= nominalDistance * CSS_DISTANCE_TOLERANCE) {
      return { nominalDistance, distanceUnit };
    }
  }
  return null;
}

/**
 * Best pace per matched CSS distance among the active freestyle laps of pool swims whose Rome day
 * is in [fromDay, toDay]. Each effort keeps its real distance. Sorted by distance.
 */
export function bestEfforts(laps: CssLap[], fromDay: string, toDay: string): CssEffort[] {
  const best = new Map<string, CssEffort>();
  for (const lap of laps) {
    if (lap.isOpenWater || lap.day < fromDay || lap.day > toDay) continue;
    if (lap.stroke !== "freestyle" || !(lap.distanceMeters > 0) || !(lap.seconds > 0)) continue;
    const match = matchCssDistance(lap.distanceMeters, lap.poolLengthMeters);
    if (!match) continue;
    const key = `${match.distanceUnit}:${match.nominalDistance}`;
    const current = best.get(key);
    if (!current || lap.seconds / lap.distanceMeters < current.seconds / current.distanceMeters) {
      best.set(key, { distanceMeters: lap.distanceMeters, seconds: lap.seconds, date: lap.day, ...match });
    }
  }
  return Array.from(best.values()).sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/** Ginn 400/200: CSS in m/s. */
export function cssFromTest(t200Seconds: number, t400Seconds: number): number {
  return 200 / (t400Seconds - t200Seconds);
}

/**
 * Least squares of distance = CS × time + D′. A negative D′ (no physical meaning) is refitted
 * through the origin: CS = Σd·t / Σt², D′ = 0. R² is computed on the line kept.
 */
export function fitCriticalSpeed(points: CssEffort[]): { cs: number; dPrime: number; r2: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const meanT = points.reduce((sum, p) => sum + p.seconds, 0) / n;
  const meanD = points.reduce((sum, p) => sum + p.distanceMeters, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.seconds - meanT) * (p.distanceMeters - meanD);
    sxx += (p.seconds - meanT) ** 2;
  }
  if (sxx === 0) return null;
  let cs = sxy / sxx;
  let dPrime = meanD - cs * meanT;
  if (dPrime < 0) {
    const sdt = points.reduce((sum, p) => sum + p.distanceMeters * p.seconds, 0);
    const stt = points.reduce((sum, p) => sum + p.seconds ** 2, 0);
    cs = sdt / stt;
    dPrime = 0;
  }
  const ssTot = points.reduce((sum, p) => sum + (p.distanceMeters - meanD) ** 2, 0);
  const ssRes = points.reduce((sum, p) => sum + (p.distanceMeters - (cs * p.seconds + dPrime)) ** 2, 0);
  return { cs, dPrime, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1 };
}

/** «alta» with ≥ 3 points spanning a distance ratio ≥ 3, D′ in 0–50 m and R² ≥ 0.98; else «media». */
export function cssConfidence(points: CssEffort[], fit: { dPrime: number; r2: number }): "alta" | "media" {
  const distances = points.map((p) => p.distanceMeters);
  const span = Math.max(...distances) / Math.min(...distances);
  const high =
    points.length >= 3 &&
    span >= 3 - 1e-9 &&
    fit.dPrime >= 0 &&
    fit.dPrime <= HIGH_MAX_D_PRIME &&
    fit.r2 >= HIGH_MIN_R2;
  return high ? "alta" : "media";
}

const paceOf = (effort: CssEffort) => (effort.seconds / effort.distanceMeters) * 100;

/**
 * Splits the efforts into the ones kept and the ones slower (per 100 m) than a longer effort:
 * a shorter effort swum slower than a longer one was submaximal. A dropped effort names the
 * nearest longer effort that beat it.
 */
function dropDominated(points: CssEffort[]): { kept: CssEffort[]; dropped: CssDroppedEffort[] } {
  const kept: CssEffort[] = [];
  const dropped: CssDroppedEffort[] = [];
  points.forEach((point, index) => {
    const faster = points
      .slice(index + 1)
      .find((longer) => longer.distanceMeters > point.distanceMeters && paceOf(longer) < paceOf(point) - 1e-9);
    if (faster) dropped.push({ ...point, slowerThan: faster });
    else kept.push(point);
  });
  return { kept, dropped };
}

/**
 * CSS from best efforts of 2–30 minutes: efforts slower than a longer one are dropped, then
 * distance = CS × time + D′ is fitted (D′ ≥ 0). Needs at least 2 efforts with the longest at least
 * twice the shortest. The pace must be within 1:00–3:30/100 m and not faster than the shortest
 * effort kept, else null.
 */
export function estimateCss(efforts: CssEffort[]): CssEstimate | null {
  const inWindow = efforts
    .filter((e) => e.seconds >= MIN_EFFORT_SECONDS && e.seconds <= MAX_EFFORT_SECONDS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
  const { kept, dropped } = dropDominated(inWindow);
  if (kept.length < 2) return null;
  const shortest = kept[0];
  const longest = kept[kept.length - 1];
  if (longest.distanceMeters < 2 * shortest.distanceMeters - 1e-9) return null;

  const fit = fitCriticalSpeed(kept);
  if (!fit || !(fit.cs > 0)) return null;
  const pace = 100 / fit.cs;
  if (!Number.isFinite(pace) || pace < CSS_MIN_PACE || pace > CSS_MAX_PACE) return null;
  // Small tolerance for floating point: equal to the shortest effort's pace is allowed.
  if (pace < paceOf(shortest) - 1e-9) return null;

  return {
    speedMps: fit.cs,
    paceSecondsPer100: pace,
    confidence: cssConfidence(kept, fit),
    points: kept,
    dPrimeMeters: fit.dPrime,
    r2: fit.r2,
    dropped,
  };
}

/** Estimate on the CSS_WINDOW_DAYS days ending on `toDay` (included). */
export function estimateCssAt(laps: CssLap[], toDay: string): CssEstimate | null {
  return estimateCss(bestEfforts(laps, addDaysToKey(toDay, -(CSS_WINDOW_DAYS - 1)), toDay));
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
  laps: CssLap[],
  now: Date,
  months = 6,
): { month: string; estimate: CssEstimate | null }[] {
  const today = dayKey(now);
  const current = monthKey(today);
  const history: { month: string; estimate: CssEstimate | null }[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const month = shiftMonth(current, -i);
    const end = i === 0 ? today : lastDayOfMonth(month);
    history.push({ month, estimate: estimateCssAt(laps, end) });
  }
  return history;
}
