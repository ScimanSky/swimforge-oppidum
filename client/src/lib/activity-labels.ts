import { poolLengthLabel } from "@shared/swimMetrics";

/** «Acque libere», «Vasca 25 m», «Vasca 25 yd» (a 22.86 m pool) or «Vasca» when the pool length is unknown. */
export const activityPlaceLabel = (activity: {
  isOpenWater?: boolean | null;
  poolLengthMeters?: number | null;
}) => {
  if (activity.isOpenWater) return "Acque libere";
  return activity.poolLengthMeters ? `Vasca ${poolLengthLabel(activity.poolLengthMeters)}` : "Vasca";
};

const SOURCE_LABELS: Record<string, string> = {
  garmin: "Garmin",
  strava: "Strava",
  manual: "Manuale",
};

/** «Garmin», «Strava», «Manuale»; null for a missing or unknown source. */
export const activitySourceLabel = (source?: string | null) =>
  source ? (SOURCE_LABELS[source.toLowerCase()] ?? null) : null;
