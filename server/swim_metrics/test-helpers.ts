import { dayKey } from "@shared/swimMetrics";
import { normalizeStroke, type MetricActivity, type MetricLap } from "./laps";

/** [distance, seconds, stroke?, strokes?, swolf?]; distance 0 is a rest. */
export type LapSpec = [number, number, (string | null)?, (number | null)?, (number | null)?];

export function lapsFrom(specs: LapSpec[]): MetricLap[] {
  return specs.map(([distanceMeters, seconds, stroke = "freestyle", strokes = null, swolf = null], index) => ({
    lapIndex: index + 1,
    distanceMeters,
    seconds,
    strokes,
    swolf,
    stroke: normalizeStroke(stroke),
  }));
}

export function activity(
  id: number,
  iso: string,
  specs: LapSpec[],
  extra: Partial<Omit<MetricActivity, "id" | "date" | "day" | "laps">> = {},
): MetricActivity {
  const laps = lapsFrom(specs);
  const active = laps.filter((lap) => lap.distanceMeters > 0);
  const date = new Date(iso);
  return {
    id,
    date,
    day: dayKey(date),
    distanceMeters: active.reduce((sum, lap) => sum + lap.distanceMeters, 0),
    durationSeconds: laps.reduce((sum, lap) => sum + lap.seconds, 0),
    poolLengthMeters: 25,
    isOpenWater: false,
    laps,
    ...extra,
  };
}
