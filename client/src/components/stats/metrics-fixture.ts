/**
 * Test data: the swim metrics of a realistic swimmer on Thursday 29 October 2026 (Rome), used by
 * the UI tests of the «Metriche» cards. Not imported by the app.
 */
import { addDaysToKey, type SessionMetrics, type SwimMetrics } from "@shared/swimMetrics";

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
  ...values,
});

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
      session("2026-09-01", {
        distanceMeters: 2500, movingSeconds: 2700, intensityFactor: 0.82, stss: 50.4,
        zoneMeters: [800, 900, 500, 300, 0], strokeIndex: 1.4, dpsMeters: 1.95, strokeRate: 30, swolf: 38,
        pacingCv: 3.1, pacingFade: 2,
      }),
      session("2026-09-15", {
        distanceMeters: 3000, movingSeconds: 3200, intensityFactor: 0.85, stss: 54.6,
        zoneMeters: [1000, 1000, 600, 400, 0], strokeIndex: 1.42, dpsMeters: 1.97, strokeRate: 30.5, swolf: 37.5,
        pacingCv: 2.9, pacingFade: 1.5,
      }),
      session("2026-09-29", {
        distanceMeters: 2800, movingSeconds: 2950, intensityFactor: 0.88, stss: 56,
        zoneMeters: [700, 900, 700, 400, 100], strokeIndex: 1.44, dpsMeters: 2, strokeRate: 30, swolf: 37,
      }),
      session("2026-10-06", {
        distanceMeters: 3200, movingSeconds: 3300, intensityFactor: 0.9, stss: 63.2,
        zoneMeters: [900, 1100, 500, 600, 100], strokeIndex: 1.5, dpsMeters: 2.04, strokeRate: 31, swolf: 36.5,
        pacingCv: 2.6, pacingFade: 3,
      }),
      session("2026-10-13", {
        distanceMeters: 2000, movingSeconds: 2400, poolLengthMeters: null, isOpenWater: true, hasLaps: false,
        intensityFactor: 0.78, stss: 31.6,
      }),
      session("2026-10-20", {
        distanceMeters: 3400, movingSeconds: 3500, intensityFactor: 0.91, stss: 69.4,
        zoneMeters: [1000, 1200, 600, 500, 100], strokeIndex: 1.52, dpsMeters: 2.05, strokeRate: 31, swolf: 36,
        pacingCv: 2.4, pacingFade: 4,
      }),
      session("2026-10-27", {
        distanceMeters: 3000, movingSeconds: 3100, intensityFactor: 0.89, stss: 59.1,
        zoneMeters: [900, 1000, 500, 500, 100], strokeIndex: 1.54, dpsMeters: 2.06, strokeRate: 31.5, swolf: 36,
        pacingCv: 3, pacingFade: 6,
      }),
    ],
    css: {
      current: {
        paceSecondsPer100: 108.4,
        speedMps: 0.922,
        source: "stima",
        confidence: "media",
        points: [
          { distanceMeters: 200, seconds: 196, date: "2026-10-06" },
          { distanceMeters: 400, seconds: 410, date: "2026-10-20" },
        ],
        testDate: null,
      },
      history: [
        { month: "2026-05", paceSecondsPer100: null },
        { month: "2026-06", paceSecondsPer100: null },
        { month: "2026-07", paceSecondsPer100: 112 },
        { month: "2026-08", paceSecondsPer100: 110.5 },
        { month: "2026-09", paceSecondsPer100: 109.2 },
        { month: "2026-10", paceSecondsPer100: 108.4 },
      ],
      missing: null,
    },
    load: {
      today: { ctl: 41.3, atl: 48.6, tsb: -7.3, reading: "in_costruzione" },
      rampPerWeek: 2.1,
      days: loadDays,
      missing: null,
    },
    intensity: {
      last28: { zoneMeters: [2800, 3300, 1600, 1600, 300], easyPct: 64, mediumPct: 17, hardPct: 19 },
      weeks: [
        { weekStart: "2026-09-07", zoneMeters: [0, 0, 0, 0, 0] },
        { weekStart: "2026-09-14", zoneMeters: [1000, 1000, 600, 400, 0] },
        { weekStart: "2026-09-21", zoneMeters: [0, 0, 0, 0, 0] },
        { weekStart: "2026-09-28", zoneMeters: [700, 900, 700, 400, 100] },
        { weekStart: "2026-10-05", zoneMeters: [900, 1100, 500, 600, 100] },
        { weekStart: "2026-10-12", zoneMeters: [0, 0, 0, 0, 0] },
        { weekStart: "2026-10-19", zoneMeters: [1000, 1200, 600, 500, 100] },
        { weekStart: "2026-10-26", zoneMeters: [900, 1000, 500, 500, 100] },
      ],
      missing: null,
    },
    efficiency: { poolLengthMeters: 25, latest: 1.54, avg28: 1.52, baseline: 1.42, deltaPct: 7, missing: null },
    pacing: {
      cv28: 2.6,
      fade28: 4,
      latestSet: { date: "2026-10-27", distanceMeters: 100, stroke: "freestyle", repSeconds: [92, 93, 92.5, 94, 95, 96] },
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
        "Servono almeno due nuotate continue a stile libero, una fino a 400 m e una da 400 m in su, negli ultimi 90 giorni. Oppure inserisci un test.",
    },
    load: {
      today: null,
      rampPerWeek: null,
      days: [],
      missing:
        "Serve il passo soglia: inserisci un test o nuota tratti continui a stile libero (una fino a 400 m e una da 400 m in su).",
    },
    intensity: {
      last28: null,
      weeks: base.intensity.weeks.map((week) => ({ weekStart: week.weekStart, zoneMeters: [0, 0, 0, 0, 0] })),
      missing: "Servono il passo soglia e nuotate con i giri.",
    },
    efficiency: {
      poolLengthMeters: null, latest: null, avg28: null, baseline: null, deltaPct: null,
      missing:
        "Servono nuotate in vasca a stile libero con i giri e il conteggio delle bracciate negli ultimi 28 giorni.",
    },
    pacing: {
      cv28: null,
      fade28: null,
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
