/**
 * Swims and laps as the metrics read them. A Garmin lap with distance 0 is a rest; an active lap
 * is continuous swimming. A Garmin «stroke» is one arm cycle of the watch arm.
 */

export type NormalizedStroke =
  | "freestyle"
  | "backstroke"
  | "breaststroke"
  | "butterfly"
  | "mixed"
  | "drill"
  | "other";

/** Columns of garmin_activity_laps the metrics need. */
export type LapRow = {
  activityId: number;
  lapIndex: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  movingDurationSeconds: number | null;
  totalNumberOfStrokes: number | null;
  averageSwolf: number | null;
  strokeType: string | null;
};

export type MetricLap = {
  lapIndex: number;
  /** 0 for a rest. */
  distanceMeters: number;
  /** Moving time when Garmin has it, else the lap duration. */
  seconds: number;
  /** Arm cycles of the watch arm. */
  strokes: number | null;
  swolf: number | null;
  stroke: NormalizedStroke | null;
};

export type MetricActivity = {
  id: number;
  date: Date;
  /** Rome calendar day of `date`. */
  day: string;
  distanceMeters: number;
  durationSeconds: number;
  poolLengthMeters: number | null;
  isOpenWater: boolean;
  laps: MetricLap[];
};

/** Garmin, Strava and Italian stroke names to one key. */
export function normalizeStroke(raw: string | null | undefined): NormalizedStroke | null {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value) return null;
  if (/free|libero|crawl/.test(value)) return "freestyle";
  if (/back|dorso/.test(value)) return "backstroke";
  if (/breast|rana/.test(value)) return "breaststroke";
  if (/fly|butter|farfalla|delfino/.test(value)) return "butterfly";
  if (/drill/.test(value)) return "drill";
  if (/mix|misti|^im$|individual/.test(value)) return "mixed";
  return "other";
}

const positive = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export function toMetricLap(row: LapRow): MetricLap {
  return {
    lapIndex: row.lapIndex,
    distanceMeters: positive(row.distanceMeters) ?? 0,
    seconds: positive(row.movingDurationSeconds) ?? positive(row.durationSeconds) ?? 0,
    strokes: positive(row.totalNumberOfStrokes),
    swolf: positive(row.averageSwolf),
    stroke: normalizeStroke(row.strokeType),
  };
}

/** Laps with distance and time, in lap order (rests dropped). */
export function activeLaps(laps: MetricLap[]): MetricLap[] {
  return laps
    .filter((lap) => lap.distanceMeters > 0 && lap.seconds > 0)
    .sort((a, b) => a.lapIndex - b.lapIndex);
}

/** Pool swim (open water is excluded from CSS, zones, efficiency and pacing). */
export const isPoolSwim = (activity: MetricActivity) => !activity.isOpenWater;
