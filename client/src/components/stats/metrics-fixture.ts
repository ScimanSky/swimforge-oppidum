/**
 * Test data: the swim metrics of a realistic swimmer on Thursday 29 October 2026 (Rome), like the
 * owner: CSS 1:48,5 («media») from a 200 in 3:20 and a 400 in 6:57, a 300 in 5:56 dropped (slower
 * per 100 m than the 400), sessions of 100 m repeats in a 25 m pool, one open-water swim without
 * laps. Used by the UI tests of the «Metriche» cards. Not imported by the app.
 */
import { addDaysToKey, type CssPoint, type SessionMetrics, type SwimMetrics } from "@shared/swimMetrics";

const session = (
  date: string,
  values: Partial<SessionMetrics> & Pick<SessionMetrics, "distanceMeters" | "movingSeconds">
): SessionMetrics => ({
  activityId: Number(date.replace(/-/g, "")),
  date,
  poolLengthMeters: 25,
  isOpenWater: false,
  hasLaps: true,
  intensityFactor: null,
  stss: null,
  zoneMeters: null,
  strokeIndex: null,
  dpsMeters: null,
  strokeRate: null,
  swolf: null,
  pacingCv: null,
  pacingFade: null,
  swimDistanceMeters: values.hasLaps === false ? null : values.distanceMeters,
  loadEstimated: false,
  unclassifiedMeters: null,
  cssPaceSecondsPer100: null,
  cssSource: null,
  dpsDropPct: null,
  strokeRateRisePct: null,
  ...values,
});

/** A pool swim with laps, its load on the CSS estimate of its month. */
const poolSwim = (
  date: string,
  values: Partial<SessionMetrics> & Pick<SessionMetrics, "distanceMeters" | "movingSeconds">
) =>
  session(date, {
    cssPaceSecondsPer100: date < "2026-10-01" ? 109.2 : 108.5,
    cssSource: "stima",
    ...values,
  });

const effort = (distanceMeters: number, seconds: number, date: string): CssPoint => ({
  distanceMeters,
  seconds,
  date,
  nominalDistance: distanceMeters,
  distanceUnit: "m",
});
const best200 = effort(200, 200, "2026-10-06");
const best400 = effort(400, 417, "2026-10-20");

/** 90 days of load ending today: form 30 → 41,3, fatigue 40 → 48,6. */
const loadDays = Array.from({ length: 90 }, (_, index) => {
  const ctl = 30 + (11.3 * index) / 89;
  const atl = 40 + (8.6 * index) / 89;
  return {
    date: addDaysToKey("2026-08-01", index),
    stss: index % 4 === 0 ? 60 : 0,
    ctl: Math.round(ctl * 10) / 10,
    atl: Math.round(atl * 10) / 10,
    tsb: Math.round((ctl - atl) * 10) / 10,
  };
});

export function swimMetricsFixture(): SwimMetrics {
  return {
    generatedAt: "2026-10-29T10:00:00.000Z",
    sessions: [
      poolSwim("2026-09-01", {
        distanceMeters: 2500, movingSeconds: 2950, intensityFactor: 0.82, stss: 50.4,
        zoneMeters: [700, 800, 400, 300, 0], unclassifiedMeters: 300,
        strokeIndex: 1.4, dpsMeters: 1.68, strokeRate: 29.8, swolf: 38,
        pacingCv: 3.1, pacingFade: 2, dpsDropPct: 1.8, strokeRateRisePct: 2.5,
      }),
      poolSwim("2026-09-15", {
        distanceMeters: 3000, movingSeconds: 3540, intensityFactor: 0.85, stss: 54.6,
        zoneMeters: [900, 900, 500, 400, 0], unclassifiedMeters: 300,
        strokeIndex: 1.42, dpsMeters: 1.7, strokeRate: 29.5, swolf: 37.5,
        pacingCv: 2.9, pacingFade: 1.5, dpsDropPct: 2, strokeRateRisePct: 2.8,
      }),
      poolSwim("2026-09-29", {
        distanceMeters: 2800, movingSeconds: 3300, intensityFactor: 0.88, stss: 56,
        zoneMeters: [600, 800, 600, 400, 100], unclassifiedMeters: 300,
        strokeIndex: 1.44, dpsMeters: 1.71, strokeRate: 29.5, swolf: 37,
      }),
      poolSwim("2026-10-06", {
        distanceMeters: 3200, movingSeconds: 3700, intensityFactor: 0.9, stss: 63.2,
        zoneMeters: [800, 1000, 400, 500, 100], unclassifiedMeters: 400,
        strokeIndex: 1.5, dpsMeters: 1.72, strokeRate: 30.4, swolf: 36.5,
        pacingCv: 2.6, pacingFade: 3, dpsDropPct: 2.1, strokeRateRisePct: 3,
      }),
      session("2026-10-13", {
        distanceMeters: 2000, movingSeconds: 2400, poolLengthMeters: null, isOpenWater: true, hasLaps: false,
        intensityFactor: 0.78, stss: 31.6, loadEstimated: true, cssPaceSecondsPer100: 108.5, cssSource: "stima",
      }),
      poolSwim("2026-10-20", {
        distanceMeters: 3400, movingSeconds: 3850, intensityFactor: 0.91, stss: 69.4,
        zoneMeters: [900, 1000, 500, 500, 100], unclassifiedMeters: 400,
        strokeIndex: 1.52, dpsMeters: 1.72, strokeRate: 30.8, swolf: 36,
        pacingCv: 2.4, pacingFade: 4, dpsDropPct: 3.4, strokeRateRisePct: 4.1,
      }),
      poolSwim("2026-10-27", {
        distanceMeters: 3000, movingSeconds: 3380, intensityFactor: 0.89, stss: 59.1,
        zoneMeters: [800, 900, 400, 400, 100], unclassifiedMeters: 400,
        strokeIndex: 1.54, dpsMeters: 1.73, strokeRate: 30.9, swolf: 36,
        pacingCv: 2.7, pacingFade: 5.8, dpsDropPct: 5.6, strokeRateRisePct: 6.2,
      }),
    ],
    css: {
      current: {
        paceSecondsPer100: 108.5,
        speedMps: 0.922,
        source: "stima",
        confidence: "media",
        points: [best200, best400],
        testDate: null,
        dPrimeMeters: 15.7,
        r2: 1,
        droppedPoints: [{ ...effort(300, 356, "2026-09-29"), slowerThan: best400 }],
      },
      history: [
        { month: "2026-05", paceSecondsPer100: null },
        { month: "2026-06", paceSecondsPer100: null },
        { month: "2026-07", paceSecondsPer100: 112 },
        { month: "2026-08", paceSecondsPer100: 110.5 },
        { month: "2026-09", paceSecondsPer100: 109.2 },
        { month: "2026-10", paceSecondsPer100: 108.5 },
      ],
      missing: null,
    },
    load: {
      today: { ctl: 41.3, atl: 48.6, tsb: -7.3, reading: "neutro" },
      rampPerWeek: 2.1,
      days: loadDays,
      missing: null,
    },
    intensity: {
      // Zoned 8,4 km of the 11,6 km swum in the 28 days: 1,2 km other strokes, 2 km open water.
      last28: {
        zoneMeters: [2500, 2900, 1300, 1400, 300], easyPct: 64, mediumPct: 16, hardPct: 20,
        unclassifiedMeters: 1200, coveragePct: 72,
      },
      weeks: [
        { weekStart: "2026-09-07", zoneMeters: [0, 0, 0, 0, 0], unclassifiedMeters: 0 },
        { weekStart: "2026-09-14", zoneMeters: [900, 900, 500, 400, 0], unclassifiedMeters: 300 },
        { weekStart: "2026-09-21", zoneMeters: [0, 0, 0, 0, 0], unclassifiedMeters: 0 },
        { weekStart: "2026-09-28", zoneMeters: [600, 800, 600, 400, 100], unclassifiedMeters: 300 },
        { weekStart: "2026-10-05", zoneMeters: [800, 1000, 400, 500, 100], unclassifiedMeters: 400 },
        { weekStart: "2026-10-12", zoneMeters: [0, 0, 0, 0, 0], unclassifiedMeters: 0 },
        { weekStart: "2026-10-19", zoneMeters: [900, 1000, 500, 500, 100], unclassifiedMeters: 400 },
        { weekStart: "2026-10-26", zoneMeters: [800, 900, 400, 400, 100], unclassifiedMeters: 400 },
      ],
      missing: null,
    },
    efficiency: {
      poolLengthMeters: 25, latest: 1.54, avg28: 1.52, baseline: 1.42, deltaPct: 7, missing: null,
      n28: 3, nBaseline: 3, dps28: 1.72, dpsBaseline: 1.7, pace28: 113.2, paceBaseline: 119.7,
    },
    pacing: {
      cv28: 2.6,
      fade28: 4,
      dpsDrop28: 3.4,
      strokeRateRise28: 4.1,
      latestSet: {
        date: "2026-10-27", distanceMeters: 100, stroke: "freestyle",
        repSeconds: [103, 105, 106, 108, 109, 111],
        repDps: [1.8, 1.78, 1.76, 1.74, 1.7, 1.68],
        dpsDropPct: 5.6,
      },
      missing: null,
    },
    volume: {
      weeks: [
        { weekStart: "2026-08-10", km: 5.2, sessions: 2 },
        { weekStart: "2026-08-17", km: 0, sessions: 0 },
        { weekStart: "2026-08-24", km: 6.1, sessions: 2 },
        { weekStart: "2026-08-31", km: 7, sessions: 3 },
        { weekStart: "2026-09-07", km: 4.8, sessions: 2 },
        { weekStart: "2026-09-14", km: 6.4, sessions: 2 },
        { weekStart: "2026-09-21", km: 5.5, sessions: 2 },
        { weekStart: "2026-09-28", km: 7.2, sessions: 3 },
        { weekStart: "2026-10-05", km: 8.1, sessions: 3 },
        { weekStart: "2026-10-12", km: 6.9, sessions: 2 },
        { weekStart: "2026-10-19", km: 8.6, sessions: 3 },
        { weekStart: "2026-10-26", km: 3, sessions: 1 },
      ],
      avgKm4: 7.7,
      avgSessions4: 2.8,
      changePct: 30,
      streakWeeks: 9,
    },
  };
}

/** A new swimmer: two swims without laps, no CSS, nothing else. */
export function emptySwimMetricsFixture(): SwimMetrics {
  const base = swimMetricsFixture();
  return {
    generatedAt: base.generatedAt,
    sessions: [
      session("2026-10-27", { distanceMeters: 1500, movingSeconds: 2100, hasLaps: false }),
      session("2026-10-28", { distanceMeters: 1200, movingSeconds: 1700, hasLaps: false }),
    ],
    css: {
      current: null,
      history: base.css.history.map((entry) => ({ month: entry.month, paceSecondsPer100: null })),
      missing:
        "Servono almeno due tratti continui a stile libero in vasca negli ultimi 90 giorni, tra 2 e 30 minuti, uno lungo almeno il doppio dell'altro (es. 200 e 400 m), nuotati a buon ritmo. Oppure inserisci un test.",
    },
    load: {
      today: null,
      rampPerWeek: null,
      days: [],
      missing:
        "Serve il passo soglia: inserisci un test o nuota due tratti continui a stile libero, uno lungo almeno il doppio dell'altro (es. 200 e 400 m).",
    },
    intensity: {
      last28: null,
      weeks: base.intensity.weeks.map((week) => ({
        weekStart: week.weekStart,
        zoneMeters: [0, 0, 0, 0, 0],
        unclassifiedMeters: 0,
      })),
      missing: "Servono il passo soglia e nuotate con i giri.",
    },
    efficiency: {
      poolLengthMeters: null, latest: null, avg28: null, baseline: null, deltaPct: null,
      n28: 0, nBaseline: 0, dps28: null, dpsBaseline: null, pace28: null, paceBaseline: null,
      missing:
        "Servono nuotate in vasca a stile libero con i giri e il conteggio delle bracciate negli ultimi 28 giorni.",
    },
    pacing: {
      cv28: null,
      fade28: null,
      dpsDrop28: null,
      strokeRateRise28: null,
      latestSet: null,
      missing:
        "Servono serie di almeno 3 ripetute uguali (stessa distanza, almeno 50 m, e stesso stile) negli ultimi 28 giorni.",
    },
    volume: {
      weeks: base.volume.weeks.map((week, index) =>
        index === 11 ? { weekStart: week.weekStart, km: 2.7, sessions: 2 } : { weekStart: week.weekStart, km: 0, sessions: 0 }
      ),
      avgKm4: 0,
      avgSessions4: 0,
      changePct: null,
      streakWeeks: 1,
    },
  };
}
