import {
  distanceParts,
  formatDurationParts,
  formatInteger,
  formatPaceValue,
  paceSecondsPer100m,
} from "./format";

export type ActivityMetricId =
  | "distance"
  | "duration"
  | "pace"
  | "swolf"
  | "avgHr"
  | "maxHr"
  | "calories";

/** Shaped for `<Metric>` (spread everything but `id`). */
export type ActivityMetric = {
  id: ActivityMetricId;
  value: string;
  unit?: string;
  label: string;
  tone?: "action";
};

/**
 * Any activity row: list and detail payloads, with the alternative names some sources use
 * (snake_case heart rate and SWOLF, `caloriesBurned`/`calories_burned`).
 */
export type ActivityMetricsSource = {
  distanceMeters?: unknown;
  durationSeconds?: unknown;
  avgPacePer100m?: unknown;
  avgSwolf?: unknown;
  avg_swolf?: unknown;
  avgHeartRate?: unknown;
  avg_heart_rate?: unknown;
  maxHeartRate?: unknown;
  max_heart_rate?: unknown;
  calories?: unknown;
  caloriesBurned?: unknown;
  calories_burned?: unknown;
};

const positiveNumber = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : null;
};

/**
 * The session metrics in display order — Distanza, Durata, Passo medio, SWOLF, FC media,
 * FC massima, Calorie — only those with data (a metric without data is not shown).
 */
export function activityMetrics(activity: ActivityMetricsSource): ActivityMetric[] {
  const metrics: ActivityMetric[] = [];
  const distance = positiveNumber(activity.distanceMeters);
  const durationSeconds = positiveNumber(activity.durationSeconds);
  if (distance) metrics.push({ id: "distance", ...distanceParts(distance), label: "Distanza" });
  const duration = formatDurationParts(durationSeconds);
  if (duration) metrics.push({ id: "duration", ...duration, label: "Durata" });
  const pace = paceSecondsPer100m({
    avgPacePer100m: positiveNumber(activity.avgPacePer100m),
    distanceMeters: distance,
    durationSeconds,
  });
  if (pace)
    metrics.push({
      id: "pace",
      value: formatPaceValue(pace),
      unit: "/100",
      label: "Passo medio",
      tone: "action",
    });
  const swolf = positiveNumber(activity.avgSwolf ?? activity.avg_swolf);
  if (swolf) metrics.push({ id: "swolf", value: String(Math.round(swolf)), label: "SWOLF" });
  const avgHr = positiveNumber(activity.avgHeartRate ?? activity.avg_heart_rate);
  if (avgHr)
    metrics.push({ id: "avgHr", value: String(Math.round(avgHr)), unit: "bpm", label: "FC media" });
  const maxHr = positiveNumber(activity.maxHeartRate ?? activity.max_heart_rate);
  if (maxHr)
    metrics.push({ id: "maxHr", value: String(Math.round(maxHr)), unit: "bpm", label: "FC massima" });
  const calories = positiveNumber(
    activity.calories ?? activity.caloriesBurned ?? activity.calories_burned
  );
  if (calories)
    metrics.push({ id: "calories", value: formatInteger(calories), unit: "kcal", label: "Calorie" });
  return metrics;
}

/** Seconds in heart-rate zones 1-5 (invalid values count zero); null without any time. */
export function activityZoneSeconds(activity: {
  hrZone1Seconds?: unknown;
  hrZone2Seconds?: unknown;
  hrZone3Seconds?: unknown;
  hrZone4Seconds?: unknown;
  hrZone5Seconds?: unknown;
}): number[] | null {
  const seconds = [
    activity.hrZone1Seconds,
    activity.hrZone2Seconds,
    activity.hrZone3Seconds,
    activity.hrZone4Seconds,
    activity.hrZone5Seconds,
  ].map(value => positiveNumber(value) ?? 0);
  return seconds.some(value => value > 0) ? seconds : null;
}
