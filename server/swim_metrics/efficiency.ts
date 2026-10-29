/**
 * Stroke efficiency: Stroke Index = speed × distance per cycle (Costill et al., 1985), compared
 * with the swimmer's own baseline in the same pool length (the push-off changes DPS between 25
 * and 50 m pools).
 */
import { addDaysToKey, dayKey } from "@shared/swimMetrics";
import { activeLaps, type MetricLap } from "./laps";
import { mean, median, weightedMean } from "./math";

export type SessionEfficiency = {
  strokeIndex: number | null;
  dpsMeters: number | null;
  strokeRate: number | null;
  swolf: number | null;
};

/** Active freestyle laps with strokes: distance-weighted SI, DPS and SWOLF; cycles per minute. */
export function sessionEfficiency(laps: MetricLap[]): SessionEfficiency {
  const usable = activeLaps(laps).filter((lap) => lap.stroke === "freestyle" && (lap.strokes ?? 0) > 0);
  if (usable.length === 0) return { strokeIndex: null, dpsMeters: null, strokeRate: null, swolf: null };

  const si: Array<[number, number]> = [];
  const dps: Array<[number, number]> = [];
  const swolf: Array<[number, number]> = [];
  let strokes = 0;
  let seconds = 0;
  for (const lap of usable) {
    const lapDps = lap.distanceMeters / lap.strokes!;
    const lapSpeed = lap.distanceMeters / lap.seconds;
    si.push([lapSpeed * lapDps, lap.distanceMeters]);
    dps.push([lapDps, lap.distanceMeters]);
    if (lap.swolf !== null) swolf.push([lap.swolf, lap.distanceMeters]);
    strokes += lap.strokes!;
    seconds += lap.seconds;
  }
  return {
    strokeIndex: weightedMean(si),
    dpsMeters: weightedMean(dps),
    strokeRate: strokes / (seconds / 60),
    swolf: weightedMean(swolf),
  };
}

type EfficiencySession = {
  date: string;
  strokeIndex: number | null;
  poolLengthMeters: number | null;
  isOpenWater: boolean;
};

export type EfficiencySummary = {
  poolLengthMeters: number | null;
  latest: number | null;
  avg28: number | null;
  baseline: number | null;
  deltaPct: number | null;
  missing: string | null;
};

export const EFFICIENCY_MISSING_DATA =
  "Servono nuotate in vasca a stile libero con i giri e il conteggio delle bracciate negli ultimi 28 giorni.";
export const EFFICIENCY_MISSING_BASELINE = "Serve qualche settimana di nuotate per avere la tua base.";

/**
 * SI of the last session and mean of the last 28 days in the most frequent pool length of those
 * days, against the median of the 90 days before them in the same pool length.
 * `sessions` are oldest first.
 */
export function efficiencySummary(sessions: EfficiencySession[], now: Date): EfficiencySummary {
  const today = dayKey(now);
  const from28 = addDaysToKey(today, -27);
  const baselineFrom = addDaysToKey(today, -117);
  const usable = sessions.filter(
    (s): s is EfficiencySession & { strokeIndex: number } =>
      s.strokeIndex !== null && !s.isOpenWater && s.poolLengthMeters !== null,
  );
  const recent = usable.filter((s) => s.date >= from28 && s.date <= today);
  if (recent.length === 0) {
    return { poolLengthMeters: null, latest: null, avg28: null, baseline: null, deltaPct: null, missing: EFFICIENCY_MISSING_DATA };
  }

  // Most frequent pool length; on a tie, the one swum most recently.
  const counts = new Map<number, { count: number; lastIndex: number }>();
  recent.forEach((s, index) => {
    const entry = counts.get(s.poolLengthMeters!) ?? { count: 0, lastIndex: 0 };
    counts.set(s.poolLengthMeters!, { count: entry.count + 1, lastIndex: index });
  });
  const poolLengthMeters = Array.from(counts.entries()).sort(
    (a, b) => b[1].count - a[1].count || b[1].lastIndex - a[1].lastIndex,
  )[0][0];

  const recentSame = recent.filter((s) => s.poolLengthMeters === poolLengthMeters);
  const latest = recentSame[recentSame.length - 1].strokeIndex;
  const avg28 = mean(recentSame.map((s) => s.strokeIndex));
  const baseline = median(
    usable
      .filter((s) => s.poolLengthMeters === poolLengthMeters && s.date >= baselineFrom && s.date < from28)
      .map((s) => s.strokeIndex),
  );
  const deltaPct = baseline !== null && avg28 !== null && baseline > 0 ? ((avg28 - baseline) / baseline) * 100 : null;
  return {
    poolLengthMeters,
    latest,
    avg28,
    baseline,
    deltaPct,
    missing: baseline === null ? EFFICIENCY_MISSING_BASELINE : null,
  };
}
