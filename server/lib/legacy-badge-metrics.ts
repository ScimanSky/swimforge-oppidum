/**
 * Scores of the old «advanced metrics», kept ONLY for the achievement badges whose criteria in
 * achievement_badge_definitions name them (metric_peak on "sei", "ser" or "tci", e.g.
 * «Efficienza Suprema»: SEI ≥ 85). They have no basis in swimming science: never show them and
 * never give them to the coach (the swim metrics are in server/swim_metrics). Formulas moved
 * unchanged from the removed server/advanced_metrics.ts so the badges are awarded as before.
 */

export interface LegacyBadgeActivity {
  distanceMeters: number;
  durationSeconds: number;
  avgPacePer100m?: number | null;
  swolfScore?: number | null;
  avgStrokeDistance?: number | null; // cm
  avgStrokes?: number | null;
  avgStrokeCadence?: number | null;
  poolLengthMeters?: number | null;
}

/** Old «Swimming Efficiency Index» (0-100). */
export function legacyBadgeSei(activity: LegacyBadgeActivity): number | null {
  const { swolfScore, avgStrokeDistance, avgPacePer100m } = activity;
  if (!swolfScore && !avgStrokeDistance && !avgPacePer100m) return null;
  const swolfComponent = swolfScore ? Math.max(0, Math.min(100, 100 - (swolfScore - 35) * 2)) : 50;
  const strokeComponent = avgStrokeDistance ? Math.min(100, (avgStrokeDistance / 250) * 100) : 50;
  const paceComponent = avgPacePer100m ? Math.min(100, (90 / avgPacePer100m) * 100) : 50;
  return Math.round(swolfComponent * 0.4 + strokeComponent * 0.35 + paceComponent * 0.25);
}

/** Old «Stroke Efficiency Rating» (0-100). */
export function legacyBadgeSer(activity: LegacyBadgeActivity): number | null {
  const { avgStrokeDistance, avgStrokes, poolLengthMeters } = activity;
  if (!avgStrokeDistance && !avgStrokes) return null;
  const strokeDistanceRatio = avgStrokeDistance ? Math.min(100, (avgStrokeDistance / 250) * 100) : 50;
  const optimalStrokes = (poolLengthMeters || 25) === 25 ? 10 : 20;
  const strokeCountRatio = avgStrokes ? Math.min(100, (optimalStrokes / avgStrokes) * 100) : 50;
  return Math.round(strokeDistanceRatio * 0.6 + strokeCountRatio * 0.4);
}

/** Old «Technical Consistency Index» (0-100) over at least 3 activities with a pace. */
export function legacyBadgeTci(activities: LegacyBadgeActivity[]): number | null {
  if (activities.length < 3) return null;
  const paces = activities
    .map((a) => a.avgPacePer100m)
    .filter((p): p is number => p !== null && p !== undefined);
  if (paces.length < 3) return null;
  const mean = paces.reduce((sum, p) => sum + p, 0) / paces.length;
  const variance = paces.reduce((sum, p) => sum + (p - mean) ** 2, 0) / paces.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.round(Math.max(0, Math.min(100, 100 - cv * 100)));
}
