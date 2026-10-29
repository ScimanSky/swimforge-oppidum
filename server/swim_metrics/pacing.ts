/**
 * Pacing in repeat sets: pace variability (coefficient of variation) and fade at the end, as used
 * in pacing studies and by coaches, and the stroke holding (distance per cycle and stroke rate in
 * the last third against the first). The readings (CV < 2% very even, 2–4% even, > 4% uneven;
 * fade > 5%; DPS drop > 5%) are our conventions.
 */
import { addDaysToKey, dayKey } from "@shared/swimMetrics";
import { lapStrokeData } from "./efficiency";
import { type MetricLap, type NormalizedStroke } from "./laps";
import { median, weightedMean } from "./math";

const MIN_REPS = 3;
const MIN_REP_DISTANCE = 50;

export type RepeatSet = {
  distanceMeters: number;
  stroke: NormalizedStroke | null;
  repSeconds: number[];
  /** Distance per cycle and cycles per minute of each rep; null unless every rep has plausible strokes. */
  repDps: number[] | null;
  repStrokeRates: number[] | null;
};

/** Strokes whose cycles mean something for the stroke holding (not drill, kick or unknown). */
const STROKE_HOLDING_STROKES: ReadonlySet<NormalizedStroke> = new Set<NormalizedStroke>([
  "freestyle",
  "backstroke",
  "breaststroke",
  "butterfly",
]);

function repStrokeData(run: MetricLap[]): { repDps: number[] | null; repStrokeRates: number[] | null } {
  if (!run[0].stroke || !STROKE_HOLDING_STROKES.has(run[0].stroke)) return { repDps: null, repStrokeRates: null };
  const data = run.map(lapStrokeData);
  if (data.some((d) => d === null)) return { repDps: null, repStrokeRates: null };
  return { repDps: data.map((d) => d!.dps), repStrokeRates: data.map((d) => d!.rate) };
}

/** A rest between two reps longer than this, or than twice the median rest so far, ends the run. */
const MIN_SPLIT_REST_SECONDS = 60;

const isRest = (lap: MetricLap) => lap.distanceMeters === 0;
const isActive = (lap: MetricLap) => lap.distanceMeters > 0 && lap.seconds > 0;

/**
 * Runs of at least 3 consecutive active laps with the same distance (≥ 50 m) and the same stroke.
 * A different distance or stroke closes the run, and so does a rest between two reps longer than
 * max(60 s, 2 × the median rest seen so far in the run) (e.g. a warm-up and the main set). Slower
 * reps never close it: that is the fade being measured.
 */
export function detectSets(laps: MetricLap[]): RepeatSet[] {
  const sets: RepeatSet[] = [];
  let run: MetricLap[] = [];
  let runRests: number[] = [];
  let restSinceLastRep = 0;
  const close = () => {
    if (run.length >= MIN_REPS && run[0].distanceMeters >= MIN_REP_DISTANCE) {
      sets.push({
        distanceMeters: run[0].distanceMeters,
        stroke: run[0].stroke,
        repSeconds: run.map((lap) => lap.seconds),
        ...repStrokeData(run),
      });
    }
    run = [];
    runRests = [];
  };
  for (const lap of [...laps].sort((a, b) => a.lapIndex - b.lapIndex)) {
    if (isRest(lap)) {
      restSinceLastRep += lap.seconds;
      continue;
    }
    if (!isActive(lap)) continue;
    const previous = run[run.length - 1];
    if (previous) {
      const sameRep = previous.distanceMeters === lap.distanceMeters && previous.stroke === lap.stroke;
      const restLimit = Math.max(MIN_SPLIT_REST_SECONDS, 2 * (median(runRests) ?? 0));
      if (!sameRep || restSinceLastRep > restLimit) close();
      else runRests.push(restSinceLastRep);
    }
    run.push(lap);
    restSinceLastRep = 0;
  }
  close();
  return sets;
}

/**
 * CV = sample SD (n − 1) / mean × 100; fade = (mean of last third − mean of first third) / first
 * × 100. A set has at least 3 reps, so n − 1 ≥ 2.
 */
export function setStats(times: number[]): { cv: number; fade: number } {
  const n = times.length;
  const avg = times.reduce((sum, t) => sum + t, 0) / n;
  const variance = times.reduce((sum, t) => sum + (t - avg) ** 2, 0) / (n - 1);
  const third = Math.ceil(n / 3);
  const first = times.slice(0, third).reduce((sum, t) => sum + t, 0) / third;
  const last = times.slice(n - third).reduce((sum, t) => sum + t, 0) / third;
  return { cv: (Math.sqrt(variance) / avg) * 100, fade: ((last - first) / first) * 100 };
}

const meanOf = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/** Means of the first and the last third (a third = ceil(n/3) reps). */
function thirds(values: number[]): { first: number; last: number } {
  const third = Math.ceil(values.length / 3);
  return { first: meanOf(values.slice(0, third)), last: meanOf(values.slice(values.length - third)) };
}

/**
 * Stroke holding of a set (Craig & Pendergast 1979; Keskinen & Komi 1993: with fatigue the
 * distance per cycle shortens and the stroke rate rises): DPS drop = (first third − last third) /
 * first third × 100, stroke rate rise = (last third − first third) / first third × 100. Null
 * without stroke data on every rep.
 */
export function setStrokeStats(set: RepeatSet): { dpsDropPct: number; strokeRateRisePct: number } | null {
  if (!set.repDps || !set.repStrokeRates) return null;
  const dps = thirds(set.repDps);
  const rate = thirds(set.repStrokeRates);
  return {
    dpsDropPct: ((dps.first - dps.last) / dps.first) * 100,
    strokeRateRisePct: ((rate.last - rate.first) / rate.first) * 100,
  };
}

/** Distance-weighted CV, fade, DPS drop and stroke rate rise of the sets of a swim. */
export function sessionPacing(laps: MetricLap[]): {
  cv: number | null;
  fade: number | null;
  dpsDrop: number | null;
  strokeRateRise: number | null;
  sets: RepeatSet[];
} {
  const sets = detectSets(laps);
  const cv: Array<[number, number]> = [];
  const fade: Array<[number, number]> = [];
  const dpsDrop: Array<[number, number]> = [];
  const rateRise: Array<[number, number]> = [];
  for (const set of sets) {
    const stats = setStats(set.repSeconds);
    const metres = set.distanceMeters * set.repSeconds.length;
    cv.push([stats.cv, metres]);
    fade.push([stats.fade, metres]);
    const stroke = setStrokeStats(set);
    if (stroke) {
      dpsDrop.push([stroke.dpsDropPct, metres]);
      rateRise.push([stroke.strokeRateRisePct, metres]);
    }
  }
  return {
    cv: weightedMean(cv),
    fade: weightedMean(fade),
    dpsDrop: weightedMean(dpsDrop),
    strokeRateRise: weightedMean(rateRise),
    sets,
  };
}

type PacingSession = {
  date: string;
  pacingCv: number | null;
  pacingFade: number | null;
  dpsDrop: number | null;
  strokeRateRise: number | null;
  lastSet: RepeatSet | null;
};

export type PacingSummary = {
  cv28: number | null;
  fade28: number | null;
  dpsDrop28: number | null;
  strokeRateRise28: number | null;
  latestSet: {
    date: string;
    distanceMeters: number;
    stroke: string;
    repSeconds: number[];
    repDps: number[] | null;
    dpsDropPct: number | null;
  } | null;
  missing: string | null;
};

export const PACING_MISSING =
  "Servono serie di almeno 3 ripetute uguali (stessa distanza, almeno 50 m, e stesso stile) negli ultimi 28 giorni.";

const medianOf = (values: Array<number | null>) => median(values.filter((v): v is number => v !== null));

/** Medians of the last 28 days and the most recent set. `sessions` are oldest first. */
export function pacingSummary(sessions: PacingSession[], now: Date): PacingSummary {
  const today = dayKey(now);
  const from28 = addDaysToKey(today, -27);
  const recent = sessions.filter((s) => s.date >= from28 && s.date <= today && s.pacingCv !== null);
  const latest = [...sessions].reverse().find((s) => s.lastSet !== null);
  const latestStroke = latest?.lastSet ? setStrokeStats(latest.lastSet) : null;
  return {
    cv28: medianOf(recent.map((s) => s.pacingCv)),
    fade28: medianOf(recent.map((s) => s.pacingFade)),
    dpsDrop28: medianOf(recent.map((s) => s.dpsDrop)),
    strokeRateRise28: medianOf(recent.map((s) => s.strokeRateRise)),
    latestSet: latest?.lastSet
      ? {
          date: latest.date,
          distanceMeters: latest.lastSet.distanceMeters,
          stroke: latest.lastSet.stroke ?? "other",
          repSeconds: latest.lastSet.repSeconds,
          repDps: latest.lastSet.repDps,
          dpsDropPct: latestStroke ? latestStroke.dpsDropPct : null,
        }
      : null,
    missing: recent.length === 0 ? PACING_MISSING : null,
  };
}
