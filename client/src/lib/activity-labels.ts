/** «Acque libere», «Vasca 25m» or «Vasca» when the pool length is unknown. */
export const activityPlaceLabel = (activity: {
  isOpenWater?: boolean | null;
  poolLengthMeters?: number | null;
}) => {
  if (activity.isOpenWater) return "Acque libere";
  return activity.poolLengthMeters ? `Vasca ${activity.poolLengthMeters}m` : "Vasca";
};

const SOURCE_LABELS: Record<string, string> = {
  garmin: "Garmin",
  strava: "Strava",
  manual: "Manuale",
};

/** «Garmin», «Strava», «Manuale»; null for a missing or unknown source. */
export const activitySourceLabel = (source?: string | null) =>
  source ? (SOURCE_LABELS[source.toLowerCase()] ?? null) : null;
