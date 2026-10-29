/**
 * Stroke efficiency: Stroke Index = speed × distance per cycle (Costill et al., 1985), compared
 * with the swimmer's own baseline in the same pool length (the push-off changes DPS between 25
 * and 50 m pools).
 */
import { addDaysToKey, dayKey } from "@shared/swimMetrics";
import { activeLaps, type MetricLap } from "./laps";
import { median, weightedMean } from "./math";

export type SessionEfficiency = {
  strokeIndex: number | null;
  dpsMeters: number | null;
  strokeRate: number | null;
  swolf: number | null;
  /** Speed of the laps used (Σ distance / Σ moving time), for the pace beside the SI. */
  speedMps: number | null;
};

/**
 * Plausible stroke data: 0.9–3.2 m per cycle and at least 15 cycles a minute. Outside these,
 * the watch miscounted the strokes or the lap holds a stop.
 */
export const DPS_GUARD = { minMeters: 0.9, maxMeters: 3.2, minCyclesPerMinute: 15 } as const;
const EPSILON = 1e-9;

/** Distance per cycle and cycles per minute of a lap with strokes, or null when implausible. */
export function lapStrokeData(lap: MetricLap): { dps: number; rate: number } | null {
  if (!(lap.distanceMeters > 0) || !(lap.seconds > 0) || !((lap.strokes ?? 0) > 0)) return null;
  const dps = lap.distanceMeters / lap.strokes!;
  const rate = lap.strokes! / (lap.seconds / 60);
  if (dps < DPS_GUARD.minMeters - EPSILON || dps > DPS_GUARD.maxMeters + EPSILON) return null;
  if (rate < DPS_GUARD.minCyclesPerMinute - EPSILON) return null;
  return { dps, rate };
}

const NO_EFFICIENCY: SessionEfficiency = { strokeIndex: null, dpsMeters: null, strokeRate: null, swolf: null, speedMps: null };

/**
 * Active freestyle laps with plausible stroke data (DPS_GUARD): distance-weighted SI, DPS and
 * SWOLF; cycles per minute and speed over all of them.
 */
export function sessionEfficiency(laps: MetricLap[]): SessionEfficiency {
  const usable = activeLaps(laps).filter((lap) => lap.stroke === "freestyle" && lapStrokeData(lap) !== null);
  if (usable.length === 0) return { ...NO_EFFICIENCY };

  const si: Array<[number, number]> = [];
  const dps: Array<[number, number]> = [];
  const swolf: Array<[number, number]> = [];
  let strokes = 0;
  let seconds = 0;
  let metres = 0;
  for (const lap of usable) {
    const lapDps = lap.distanceMeters / lap.strokes!;
    const lapSpeed = lap.distanceMeters / lap.seconds;
    si.push([lapSpeed * lapDps, lap.distanceMeters]);
    dps.push([lapDps, lap.distanceMeters]);
    if (lap.swolf !== null) swolf.push([lap.swolf, lap.distanceMeters]);
    strokes += lap.strokes!;
    seconds += lap.seconds;
    metres += lap.distanceMeters;
  }
  return {
    strokeIndex: weightedMean(si),
    dpsMeters: weightedMean(dps),
    strokeRate: strokes / (seconds / 60),
    swolf: weightedMean(swolf),
    speedMps: metres / seconds,
  };
}

type EfficiencySession = {
  date: string;
  strokeIndex: number | null;
  poolLengthMeters: number | null;
  isOpenWater: boolean;
  dpsMeters: number | null;
  speedMps: number | null;
};

export type EfficiencySummary = {
  poolLengthMeters: number | null;
  latest: number | null;
  /** Median SI of the last 28 days (same pool length). */
  avg28: number | null;
  baseline: number | null;
  deltaPct: number | null;
  missing: string | null;
  /** Swims with an SI behind avg28 and behind the baseline. */
  n28: number;
  nBaseline: number;
  /** Median distance per cycle and pace (s/100 m) of the same swims. */
  dps28: number | null;
  dpsBaseline: number | null;
  pace28: number | null;
  paceBaseline: number | null;
};

export const EFFICIENCY_MISSING_DATA =
  "Servono nuotate in vasca a stile libero con i giri e il conteggio delle bracciate negli ultimi 28 giorni.";
export const EFFICIENCY_MISSING_BASELINE =
  "Per la tua base servono almeno 3 nuotate in questa vasca nei 90 giorni prima delle ultime 4 settimane.";
/** Fewer baseline swims than this: no baseline. */
export const MIN_BASELINE_SESSIONS = 3;

const paceOf = (speedMps: number | null) => (speedMps !== null && speedMps > 0 ? 100 / speedMps : null);
const medianOf = (values: Array<number | null>) => median(values.filter((v): v is number => v !== null));

/**
 * SI of the last session and median of the last 28 days in the most frequent pool length of those
 * days, against the median of the 90 days before them in the same pool length (at least 3 swims).
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
    return {
      poolLengthMeters: null, latest: null, avg28: null, baseline: null, deltaPct: null,
      missing: EFFICIENCY_MISSING_DATA,
      n28: 0, nBaseline: 0, dps28: null, dpsBaseline: null, pace28: null, paceBaseline: null,
    };
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
  const baseSame = usable.filter(
    (s) => s.poolLengthMeters === poolLengthMeters && s.date >= baselineFrom && s.date < from28,
  );
  const hasBaseline = baseSame.length >= MIN_BASELINE_SESSIONS;
  const latest = recentSame[recentSame.length - 1].strokeIndex;
  const avg28 = median(recentSame.map((s) => s.strokeIndex));
  const baseline = hasBaseline ? median(baseSame.map((s) => s.strokeIndex)) : null;
  const deltaPct = baseline !== null && avg28 !== null && baseline > 0 ? ((avg28 - baseline) / baseline) * 100 : null;
  return {
    poolLengthMeters,
    latest,
    avg28,
    baseline,
    deltaPct,
    missing: hasBaseline ? null : EFFICIENCY_MISSING_BASELINE,
    n28: recentSame.length,
    nBaseline: baseSame.length,
    dps28: medianOf(recentSame.map((s) => s.dpsMeters)),
    dpsBaseline: hasBaseline ? medianOf(baseSame.map((s) => s.dpsMeters)) : null,
    pace28: medianOf(recentSame.map((s) => paceOf(s.speedMps))),
    paceBaseline: hasBaseline ? medianOf(baseSame.map((s) => paceOf(s.speedMps))) : null,
  };
}
