/**
 * All six swim metrics from 180 days of swims with their laps (pure, no I/O).
 * Design: docs/plans/2026-10-29-swim-metrics-design.md.
 */
import {
  addDaysToKey,
  dayKey,
  daysBetweenKeys,
  weekStartOfKey,
  type CssResult,
  type SessionMetrics,
  type SwimMetrics,
  type Zones5,
} from "@shared/swimMetrics";
import { cssFromTest, cssHistory, CSS_WINDOW_DAYS, type CssEstimate } from "./css";
import { efficiencySummary, sessionEfficiency } from "./efficiency";
import { activeLaps, isPoolSwim, type MetricActivity } from "./laps";
import { loadSeries, rampPerWeek, sessionLoad, tsbReading } from "./load";
import { round } from "./math";
import { pacingSummary, sessionPacing, type RepeatSet } from "./pacing";
import { volumeSummary } from "./volume";
import { addZones, emptyZones, intensitySplit, sessionZones } from "./zones";

export type CssTest = { t200Seconds: number; t400Seconds: number; date: string };

export type SwimMetricsInput = {
  /** Swims of the last 180 days, with their laps. */
  activities: MetricActivity[];
  /** The user's 400/200 test, whatever its age. */
  cssTest: CssTest | null;
  /** Dates of the swims over a longer window, for the weekly streak. */
  streakDates: Date[];
};

/** Days of swims read; the load curve starts this far back to settle. */
export const HISTORY_DAYS = 180;
const SHOWN_DAYS = 90;
const INTENSITY_WEEKS = 8;

export const MISSING = {
  css: "Servono almeno due nuotate continue a stile libero, una fino a 400 m e una da 400 m in su, negli ultimi 90 giorni. Oppure inserisci un test.",
  load: "Serve il passo soglia: inserisci un test o nuota tratti continui a stile libero (una fino a 400 m e una da 400 m in su).",
  intensity: "Servono il passo soglia e nuotate con i giri.",
  intensityNoLaps: "Nessuna nuotata in vasca con i giri negli ultimi 28 giorni.",
} as const;

type InternalSession = {
  activity: MetricActivity;
  cssSpeed: number | null;
  distanceMeters: number;
  movingSeconds: number;
  hasLaps: boolean;
  intensityFactor: number | null;
  stss: number | null;
  zoneMeters: Zones5 | null;
  strokeIndex: number | null;
  dpsMeters: number | null;
  strokeRate: number | null;
  swolf: number | null;
  pacingCv: number | null;
  pacingFade: number | null;
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

/**
 * CSS speed for a swim day: the test when it is within 90 days of the swim, else the nearest
 * monthly estimate (the swim's month first, an earlier month on a tie), else the test at any
 * distance, else null.
 */
function cssResolver(
  history: { month: string; estimate: CssEstimate | null }[],
  test: CssTest | null,
): (day: string) => number | null {
  const testSpeed = test ? cssFromTest(test.t200Seconds, test.t400Seconds) : null;
  const monthly = history.filter((h) => h.estimate !== null);
  return (day) => {
    if (test && testSpeed && Math.abs(daysBetweenKeys(test.date, day)) <= CSS_WINDOW_DAYS) return testSpeed;
    if (monthly.length > 0) {
      const target = monthIndex(day.slice(0, 7));
      let best = monthly[0];
      for (const entry of monthly) {
        if (Math.abs(monthIndex(entry.month) - target) < Math.abs(monthIndex(best.month) - target)) best = entry;
      }
      return best.estimate!.speedMps;
    }
    return testSpeed;
  };
}

function computeSession(activity: MetricActivity, cssSpeed: number | null): InternalSession {
  const active = activeLaps(activity.laps);
  const hasLaps = active.length > 0;
  const distanceMeters = hasLaps ? active.reduce((sum, lap) => sum + lap.distanceMeters, 0) : activity.distanceMeters;
  const movingSeconds = hasLaps ? active.reduce((sum, lap) => sum + lap.seconds, 0) : activity.durationSeconds;
  const load = cssSpeed ? sessionLoad(distanceMeters, movingSeconds, cssSpeed) : { intensityFactor: null, stss: null };
  const pool = isPoolSwim(activity);
  const efficiency = pool
    ? sessionEfficiency(activity.laps)
    : { strokeIndex: null, dpsMeters: null, strokeRate: null, swolf: null };
  const pacing = pool ? sessionPacing(activity.laps) : { cv: null, fade: null, sets: [] };
  return {
    activity,
    cssSpeed,
    distanceMeters,
    movingSeconds,
    hasLaps,
    ...load,
    zoneMeters: pool && hasLaps && cssSpeed ? sessionZones(activity.laps, cssSpeed) : null,
    ...efficiency,
    pacingCv: pacing.cv,
    pacingFade: pacing.fade,
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
    movingSeconds: Math.round(s.movingSeconds),
    hasLaps: s.hasLaps,
    intensityFactor: round(s.intensityFactor, 2),
    stss: round(s.stss, 1),
    zoneMeters: s.zoneMeters,
    strokeIndex: round(s.strokeIndex, 2),
    dpsMeters: round(s.dpsMeters, 2),
    strokeRate: round(s.strokeRate, 1),
    swolf: round(s.swolf, 1),
    pacingCv: round(s.pacingCv, 1),
    pacingFade: round(s.pacingFade, 1),
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
  // Seven months cover the 180 days; the chart shows the last six.
  const history = cssHistory(activities, now, 7);
  const test = input.cssTest;
  const testIsCurrent =
    test !== null && test.date <= today && daysBetweenKeys(test.date, today) < CSS_WINDOW_DAYS;
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

  // ── Sessions ──
  const resolveCss = cssResolver(history, test);
  const sessions = activities.map((a) => computeSession(a, resolveCss(a.day)));
  const anyCss = sessions.some((s) => s.cssSpeed !== null);

  // ── Load ──
  let load: SwimMetrics["load"] = { today: null, rampPerWeek: null, days: [], missing: MISSING.load };
  if (anyCss) {
    const daily = new Map<string, number>();
    for (const s of sessions) {
      if (s.stss !== null) daily.set(s.activity.day, (daily.get(s.activity.day) ?? 0) + s.stss);
    }
    const series = loadSeries(daily, historyFrom, today);
    const last = series[series.length - 1];
    load = {
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
  const perWeek = new Map(weekKeys.map((key) => [key, emptyZones()]));
  let zones28 = emptyZones();
  for (const s of sessions) {
    if (!s.zoneMeters) continue;
    const week = weekStartOfKey(s.activity.day);
    if (perWeek.has(week)) perWeek.set(week, addZones(perWeek.get(week)!, s.zoneMeters));
    if (s.activity.day >= from28) zones28 = addZones(zones28, s.zoneMeters);
  }
  const split = intensitySplit(zones28);
  const intensity: SwimMetrics["intensity"] = {
    last28: split ? { zoneMeters: zones28, ...split } : null,
    weeks: weekKeys.map((weekStart) => ({ weekStart, zoneMeters: perWeek.get(weekStart)! })),
    missing: !anyCss ? MISSING.intensity : split ? null : MISSING.intensityNoLaps,
  };

  // ── Efficiency, pacing, volume ──
  const summaryRows = sessions.map((s) => ({
    date: s.activity.day,
    strokeIndex: s.strokeIndex,
    poolLengthMeters: s.activity.poolLengthMeters,
    isOpenWater: s.activity.isOpenWater,
    pacingCv: s.pacingCv,
    pacingFade: s.pacingFade,
    lastSet: s.lastSet,
  }));
  const eff = efficiencySummary(summaryRows, now);
  const pacing = pacingSummary(summaryRows, now);

  return {
    generatedAt: now.toISOString(),
    sessions: sessions.filter((s) => s.activity.day >= shownFrom).map(toSessionMetrics),
    css,
    load,
    intensity,
    efficiency: {
      poolLengthMeters: eff.poolLengthMeters,
      latest: round(eff.latest, 2),
      avg28: round(eff.avg28, 2),
      baseline: round(eff.baseline, 2),
      deltaPct: round(eff.deltaPct, 1),
      missing: eff.missing,
    },
    pacing: {
      cv28: round(pacing.cv28, 1),
      fade28: round(pacing.fade28, 1),
      latestSet: pacing.latestSet,
      missing: pacing.missing,
    },
    volume: volumeSummary(activities, now, input.streakDates),
  };
}
