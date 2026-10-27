export const DEFAULT_RESTING_HR = 60;

/** Median of plausible resting heart rates (30-120 bpm); 60 when none is available. */
export function resolveBaselineRestingHr(activities: Array<{ restingHeartRate?: number | null }>): number {
  const values = activities
    .map((a) => a.restingHeartRate)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 30 && v <= 120)
    .sort((a, b) => a - b);
  if (values.length === 0) return DEFAULT_RESTING_HR;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}
