/**
 * Training load and form: TrainingPeaks swim TSS (sTSS = IF³ × hours × 100, the cube following
 * water drag) and the Banister model in the TrainingPeaks form (CTL 42 days, ATL 7 days,
 * TSB = CTL − ATL at the end of the previous day).
 */
import type { TsbReading } from "@shared/swimMetrics";
import { addDaysToKey, tsbReadingOf } from "@shared/swimMetrics";

export const IF_CAP = 1.3;
export const CTL_DAYS = 42;
export const ATL_DAYS = 7;

/** Intensity factor and sTSS of a swim: IF = (distance / moving time) / CSS, capped at 1.3. */
export function sessionLoad(
  distanceMeters: number,
  movingSeconds: number,
  cssSpeedMps: number,
): { intensityFactor: number | null; stss: number | null } {
  if (!(movingSeconds > 0) || !(cssSpeedMps > 0) || !(distanceMeters > 0)) {
    return { intensityFactor: null, stss: null };
  }
  const intensityFactor = Math.min(distanceMeters / movingSeconds / cssSpeedMps, IF_CAP);
  return { intensityFactor, stss: intensityFactor ** 3 * (movingSeconds / 3600) * 100 };
}

export type LoadDay = { date: string; stss: number; ctl: number; atl: number; tsb: number };

/**
 * Daily CTL/ATL/TSB from `fromDay` to `toDay` (Rome day keys, both included), starting from 0.
 * CTL and ATL include the day's load; TSB is CTL − ATL at the end of the day before.
 */
export function loadSeries(dailyStss: Map<string, number>, fromDay: string, toDay: string): LoadDay[] {
  const days: LoadDay[] = [];
  let ctl = 0;
  let atl = 0;
  for (let day = fromDay; day <= toDay; day = addDaysToKey(day, 1)) {
    const stss = dailyStss.get(day) ?? 0;
    const tsb = ctl - atl;
    ctl += (stss - ctl) / CTL_DAYS;
    atl += (stss - atl) / ATL_DAYS;
    days.push({ date: day, stss, ctl, atl, tsb });
  }
  return days;
}

/** CTL of the last day minus CTL seven days before; null with less than 8 days. */
export function rampPerWeek(series: LoadDay[]): number | null {
  if (series.length < 8) return null;
  return series[series.length - 1].ctl - series[series.length - 8].ctl;
}

/** TrainingPeaks readings of the balance (conventions, not rules): see TSB_BOUNDS. */
export const tsbReading = (tsb: number): TsbReading => tsbReadingOf(tsb);
