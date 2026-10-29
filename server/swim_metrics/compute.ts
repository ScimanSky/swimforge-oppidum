/**
 * All six swim metrics from 180 days of swims with their laps (pure, no I/O).
 * Design: docs/plans/2026-10-29-swim-metrics-design.md.
 */
import {
  addDaysToKey,
  dayKey,
  daysBetweenKeys,
  paceZoneBoundsFromCss,
  paceZoneRanges,
  weekStartOfKey,
  type CssResult,
  type PaceZoneBounds,
  type SessionMetrics,
  type SwimMetrics,
  type ThresholdSource,
  type Zones7,
} from "@shared/swimMetrics";
import { cssFromTest, cssHistory, cssLapsOf, CSS_WINDOW_DAYS, type CssEstimate, type CssLap } from "./css";
import { efficiencySummary, sessionEfficiency } from "./efficiency";
import { activeLaps, isPoolSwim, type MetricActivity } from "./laps";
import { lapsLoad, loadSeries, rampPerWeek, sessionLoad, tsbReading } from "./load";
import { round } from "./math";
import { pacingSummary, sessionPacing, type RepeatSet } from "./pacing";
import { volumeSummary } from "./volume";
import { addZones, emptyZones, intensitySplit, sessionZones, unclassifiedMeters } from "./zones";

export type CssTest = { t200Seconds: number; t400Seconds: number; date: string };
/** The user's own zone bounds («Le tue zone»), from preferences.paceZones. */
export type ManualPaceZones = { bounds: PaceZoneBounds; updatedAt: string | null };

export type SwimMetricsInput = {
  /** Swims of the last 180 days, with their laps. */
  activities: MetricActivity[];
  /** The user's 400/200 test, whatever its age. */
  cssTest: CssTest | null;
  /** The user's manual zone bounds: they win over the ones from the CSS. */
  paceZones?: ManualPaceZones | null;
  /** Dates of the swims over a longer window, for the weekly streak. */
  streakDates?: Date[];
  /** Or the swims per Rome week (Monday «YYYY-MM-DD») over that window, counted by the database. */
  streakWeekCounts?: Map<string, number>;
  /**
   * Active pool laps for the CSS estimates over a longer window (300 days), so that every month's
   * 90-day window is complete. Default: the laps of `activities`.
   */
  cssLaps?: CssLap[];
  /** First Rome day `cssLaps` cover. Default: the first of the 180 days. */
  cssLapsFrom?: string;
};

/** Days of swims read; the load curve starts this far back to settle. */
export const HISTORY_DAYS = 180;
const SHOWN_DAYS = 90;
const INTENSITY_WEEKS = 8;

export const MISSING = {
  css: "Servono almeno due tratti continui a stile libero in vasca negli ultimi 90 giorni, tra 2 e 30 minuti, uno lungo almeno il doppio dell'altro (es. 200 e 400 m), nuotati a buon ritmo. Oppure inserisci un test.",
  load: "Serve il passo soglia: inserisci un test o nuota due tratti continui a stile libero, uno lungo almeno il doppio dell'altro (es. 200 e 400 m).",
  intensity: "Servono il passo soglia (o le tue zone) e nuotate con i giri.",
  intensityNoLaps: "Nessuna nuotata in vasca con i giri negli ultimi 28 giorni.",
  intensityNoFreestyle:
    "Nelle ultime 4 settimane non ci sono giri a stile libero da classificare: le zone si calcolano solo sullo stile libero.",
} as const;

type SwimCss = { speedMps: number; source: "stima" | "test" };
/** The threshold of a swim's load: its CSS, or the B2/C1 boundary of the manual zones. */
type SwimThreshold = { speedMps: number; source: ThresholdSource };

type InternalSession = {
  activity: MetricActivity;
  cssSpeed: number | null;
  cssSource: ThresholdSource | null;
  /** Σ active laps; null without laps. */
  swimDistanceMeters: number | null;
  movingSeconds: number;
  hasLaps: boolean;
  intensityFactor: number | null;
  stss: number | null;
  loadEstimated: boolean;
  zoneMeters: Zones7 | null;
  unclassifiedMeters: number | null;
  strokeIndex: number | null;
  dpsMeters: number | null;
  strokeRate: number | null;
  swolf: number | null;
  speedMps: number | null;
  pacingCv: number | null;
  pacingFade: number | null;
  dpsDrop: number | null;
  strokeRateRise: number | null;
  lastSet: RepeatSet | null;
};

function cssResultFromEstimate(estimate: CssEstimate): CssResult {
  return {
    paceSecondsPer100: round(estimate.paceSecondsPer100, 1)!,
    speedMps: round(estimate.speedMps, 3)!,
    source: "stima",
    confidence: estimate.confidence,
    points: estimate.points,
    testDate: null,
    dPrimeMeters: round(estimate.dPrimeMeters, 1),
    r2: round(estimate.r2, 3),
    droppedPoints: estimate.dropped,
  };
}

function cssResultFromTest(test: CssTest): CssResult {
  const speed = cssFromTest(test.t200Seconds, test.t400Seconds);
  return {
    paceSecondsPer100: round(100 / speed, 1)!,
    speedMps: round(speed, 3)!,
    source: "test",
    confidence: null,
    points: [
      { distanceMeters: 200, seconds: test.t200Seconds, date: test.date },
      { distanceMeters: 400, seconds: test.t400Seconds, date: test.date },
    ],
    testDate: test.date,
  };
}

const monthIndex = (month: string) => {
  const [year, m] = month.split("-").map(Number);
  return year * 12 + m;
};

/** A test is valid from its date to date + 89 (inclusive), forward only. */
export function testValidOn(test: CssTest, day: string): boolean {
  const age = daysBetweenKeys(test.date, day);
  return age >= 0 && age <= CSS_WINDOW_DAYS - 1;
}

/**
 * CSS for a swim day: the test when the day is within its validity, else the nearest monthly
 * estimate (the swim's month first, an earlier month on a tie), else null. An expired test is
 * never used.
 */
function cssResolver(
  history: { month: string; estimate: CssEstimate | null }[],
  test: CssTest | null,
): (day: string) => SwimCss | null {
  const testSpeed = test ? cssFromTest(test.t200Seconds, test.t400Seconds) : null;
  const monthly = history.filter((h) => h.estimate !== null);
  return (day) => {
    if (test && testSpeed && testValidOn(test, day)) return { speedMps: testSpeed, source: "test" };
    if (monthly.length === 0) return null;
    const target = monthIndex(day.slice(0, 7));
    let best = monthly[0];
    for (const entry of monthly) {
      if (Math.abs(monthIndex(entry.month) - target) < Math.abs(monthIndex(best.month) - target)) best = entry;
    }
    return { speedMps: best.estimate!.speedMps, source: "stima" };
  };
}

/**
 * One swim: the load on its threshold; the zones on the manual bounds, else on the bounds of its
 * own CSS (the automatic zones follow the CSS valid on the swim's day).
 */
function computeSession(
  activity: MetricActivity,
  css: SwimThreshold | null,
  manualBounds: PaceZoneBounds | null,
): InternalSession {
  const cssSpeed = css?.speedMps ?? null;
  const zoneBounds = manualBounds ?? (cssSpeed ? paceZoneBoundsFromCss(100 / cssSpeed) : null);
  const active = activeLaps(activity.laps);
  const hasLaps = active.length > 0;
  const pool = isPoolSwim(activity);
  const swimDistanceMeters = hasLaps ? active.reduce((sum, lap) => sum + lap.distanceMeters, 0) : null;
  const movingSeconds = hasLaps ? active.reduce((sum, lap) => sum + lap.seconds, 0) : activity.durationSeconds;
  // With laps: sTSS on the swum laps (like the zones). Without: TrainingPeaks on the whole swim.
  const load = !cssSpeed
    ? { intensityFactor: null, stss: null }
    : hasLaps
      ? lapsLoad(active, cssSpeed, { allFreestyle: !pool })
      : sessionLoad(activity.distanceMeters, activity.durationSeconds, cssSpeed);
  const efficiency = pool
    ? sessionEfficiency(activity.laps)
    : { strokeIndex: null, dpsMeters: null, strokeRate: null, swolf: null, speedMps: null };
  const pacing = pool
    ? sessionPacing(activity.laps)
    : { cv: null, fade: null, dpsDrop: null, strokeRateRise: null, sets: [] };
  return {
    activity,
    cssSpeed,
    cssSource: css?.source ?? null,
    swimDistanceMeters,
    movingSeconds,
    hasLaps,
    ...load,
    loadEstimated: load.stss !== null && !hasLaps,
    zoneMeters: pool && hasLaps && zoneBounds ? sessionZones(active, zoneBounds, activity.poolLengthMeters) : null,
    unclassifiedMeters: pool && hasLaps ? unclassifiedMeters(active) : null,
    ...efficiency,
    pacingCv: pacing.cv,
    pacingFade: pacing.fade,
    dpsDrop: pacing.dpsDrop,
    strokeRateRise: pacing.strokeRateRise,
    lastSet: pacing.sets[pacing.sets.length - 1] ?? null,
  };
}

function toSessionMetrics(s: InternalSession): SessionMetrics {
  return {
    activityId: s.activity.id,
    date: s.activity.day,
    poolLengthMeters: s.activity.isOpenWater ? null : s.activity.poolLengthMeters,
    isOpenWater: s.activity.isOpenWater,
    distanceMeters: s.activity.distanceMeters,
    swimDistanceMeters: s.swimDistanceMeters,
    movingSeconds: Math.round(s.movingSeconds),
    hasLaps: s.hasLaps,
    intensityFactor: round(s.intensityFactor, 2),
    stss: round(s.stss, 1),
    loadEstimated: s.loadEstimated,
    zoneMeters: s.zoneMeters,
    unclassifiedMeters: s.unclassifiedMeters,
    cssPaceSecondsPer100: s.cssSpeed ? round(100 / s.cssSpeed, 1) : null,
    cssSource: s.cssSource,
    strokeIndex: round(s.strokeIndex, 2),
    dpsMeters: round(s.dpsMeters, 2),
    strokeRate: round(s.strokeRate, 1),
    swolf: round(s.swolf, 1),
    pacingCv: round(s.pacingCv, 1),
    pacingFade: round(s.pacingFade, 1),
    dpsDropPct: round(s.dpsDrop, 1),
    strokeRateRisePct: round(s.strokeRateRise, 1),
  };
}

export function computeSwimMetrics(input: SwimMetricsInput, now: Date): SwimMetrics {
  const today = dayKey(now);
  const historyFrom = addDaysToKey(today, -(HISTORY_DAYS - 1));
  const shownFrom = addDaysToKey(today, -(SHOWN_DAYS - 1));
  const from28 = addDaysToKey(today, -27);
  const activities = input.activities
    .filter((a) => a.day >= historyFrom && a.day <= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // ── CSS ──
  // Seven month-end estimates: the swims of the 180 days fall in these months (a swim uses its
  // month's estimate) and the chart shows the last six. Each estimate reads the 90 days before
  // its month's end, so the CSS laps cover 300 days; months not covered stay null.
  const cssLaps = input.cssLaps ?? cssLapsOf(activities);
  const history = cssHistory(cssLaps, now, 7, input.cssLapsFrom ?? historyFrom);
  const test = input.cssTest;
  const testIsCurrent = test !== null && testValidOn(test, today);
  const estimateNow = history[history.length - 1].estimate;
  const current = testIsCurrent ? cssResultFromTest(test!) : estimateNow ? cssResultFromEstimate(estimateNow) : null;
  const css: SwimMetrics["css"] = {
    current,
    history: history.slice(1).map((h) => ({
      month: h.month,
      paceSecondsPer100: h.estimate ? round(h.estimate.paceSecondsPer100, 1) : null,
    })),
    missing: current ? null : MISSING.css,
  };

  // ── Zones in effect ──
  const manual = input.paceZones ?? null;
  const autoBounds = current ? paceZoneBoundsFromCss(current.paceSecondsPer100) : null;
  const effectiveBounds = manual?.bounds ?? autoBounds;
  const zones: SwimMetrics["zones"] = {
    source: manual ? "manuali" : autoBounds ? "auto" : null,
    ranges: effectiveBounds ? paceZoneRanges(effectiveBounds) : [],
    bounds: effectiveBounds,
    autoBounds,
    manualUpdatedAt: manual?.updatedAt ?? null,
  };

  // ── Sessions ──
  // The load and the automatic zones need today's CSS, so that they always agree with
  // css.current. Without it, manual zones lend their B2/C1 boundary as the threshold.
  const resolveCss = cssResolver(history, test);
  const manualThreshold: SwimThreshold | null = manual
    ? { speedMps: 100 / manual.bounds.b2c1, source: "zone manuali" }
    : null;
  const thresholdOf = (day: string): SwimThreshold | null =>
    current ? (resolveCss(day) ?? manualThreshold) : manualThreshold;
  const sessions = activities.map((a) => computeSession(a, thresholdOf(a.day), manual?.bounds ?? null));
  const hasThreshold = current !== null || manual !== null;

  // ── Load ──
  let load: SwimMetrics["load"] = { threshold: null, today: null, rampPerWeek: null, days: [], missing: MISSING.load };
  if (hasThreshold) {
    const daily = new Map<string, number>();
    for (const s of sessions) {
      if (s.stss !== null) daily.set(s.activity.day, (daily.get(s.activity.day) ?? 0) + s.stss);
    }
    const series = loadSeries(daily, historyFrom, today);
    const last = series[series.length - 1];
    load = {
      threshold: current
        ? { paceSecondsPer100: current.paceSecondsPer100, source: current.source }
        : { paceSecondsPer100: manual!.bounds.b2c1, source: "zone manuali" },
      today: {
        ctl: round(last.ctl, 1)!,
        atl: round(last.atl, 1)!,
        tsb: round(last.tsb, 1)!,
        reading: tsbReading(last.tsb),
      },
      rampPerWeek: round(rampPerWeek(series), 1),
      days: series.slice(-SHOWN_DAYS).map((d) => ({
        date: d.date,
        stss: round(d.stss, 1)!,
        ctl: round(d.ctl, 1)!,
        atl: round(d.atl, 1)!,
        tsb: round(d.tsb, 1)!,
      })),
      missing: null,
    };
  }

  // ── Intensity ──
  const currentWeek = weekStartOfKey(today);
  const weekKeys = Array.from({ length: INTENSITY_WEEKS }, (_, i) =>
    addDaysToKey(currentWeek, -7 * (INTENSITY_WEEKS - 1 - i)),
  );
  const perWeek = new Map(weekKeys.map((key) => [key, { zones: emptyZones(), unclassified: 0 }]));
  let zones28 = emptyZones();
  let unclassified28 = 0;
  let volume28 = 0;
  for (const s of sessions) {
    const recent = s.activity.day >= from28;
    if (recent) volume28 += s.activity.distanceMeters;
    if (!s.zoneMeters) continue;
    const week = perWeek.get(weekStartOfKey(s.activity.day));
    if (week) {
      week.zones = addZones(week.zones, s.zoneMeters);
      week.unclassified += s.unclassifiedMeters ?? 0;
    }
    if (recent) {
      zones28 = addZones(zones28, s.zoneMeters);
      unclassified28 += s.unclassifiedMeters ?? 0;
    }
  }
  const split = intensitySplit(zones28);
  const zoned28 = zones28.reduce((sum, metres) => sum + metres, 0);
  const intensity: SwimMetrics["intensity"] = {
    last28: hasThreshold && split
      ? {
          zoneMeters: zones28,
          ...split,
          unclassifiedMeters: unclassified28,
          coveragePct: volume28 > 0 ? Math.min(100, Math.round((zoned28 / volume28) * 100)) : 0,
        }
      : null,
    weeks: weekKeys.map((weekStart) => ({
      weekStart,
      zoneMeters: perWeek.get(weekStart)!.zones,
      unclassifiedMeters: perWeek.get(weekStart)!.unclassified,
    })),
    missing: !hasThreshold
      ? MISSING.intensity
      : split
        ? null
        : unclassified28 > 0
          ? MISSING.intensityNoFreestyle
          : MISSING.intensityNoLaps,
  };

  // ── Efficiency, pacing, volume ──
  const summaryRows = sessions.map((s) => ({
    date: s.activity.day,
    strokeIndex: s.strokeIndex,
    dpsMeters: s.dpsMeters,
    speedMps: s.speedMps,
    poolLengthMeters: s.activity.poolLengthMeters,
    isOpenWater: s.activity.isOpenWater,
    pacingCv: s.pacingCv,
    pacingFade: s.pacingFade,
    dpsDrop: s.dpsDrop,
    strokeRateRise: s.strokeRateRise,
    lastSet: s.lastSet,
  }));
  const eff = efficiencySummary(summaryRows, now);
  const pacing = pacingSummary(summaryRows, now);

  return {
    generatedAt: now.toISOString(),
    sessions: sessions.filter((s) => s.activity.day >= shownFrom).map(toSessionMetrics),
    css,
    zones,
    load,
    intensity,
    efficiency: {
      poolLengthMeters: eff.poolLengthMeters,
      latest: round(eff.latest, 2),
      avg28: round(eff.avg28, 2),
      baseline: round(eff.baseline, 2),
      deltaPct: round(eff.deltaPct, 1),
      missing: eff.missing,
      n28: eff.n28,
      nBaseline: eff.nBaseline,
      dps28: round(eff.dps28, 2),
      dpsBaseline: round(eff.dpsBaseline, 2),
      pace28: round(eff.pace28, 1),
      paceBaseline: round(eff.paceBaseline, 1),
    },
    pacing: {
      cv28: round(pacing.cv28, 1),
      fade28: round(pacing.fade28, 1),
      latestSet: pacing.latestSet
        ? {
            ...pacing.latestSet,
            repDps: pacing.latestSet.repDps?.map((dps) => round(dps, 2)!) ?? null,
            dpsDropPct: round(pacing.latestSet.dpsDropPct, 1),
          }
        : null,
      missing: pacing.missing,
      dpsDrop28: round(pacing.dpsDrop28, 1),
      strokeRateRise28: round(pacing.strokeRateRise28, 1),
    },
    volume: volumeSummary(activities, now, input.streakWeekCounts ?? input.streakDates),
  };
}
