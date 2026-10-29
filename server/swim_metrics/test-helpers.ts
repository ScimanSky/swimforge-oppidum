import {
  dayKey,
  paceZoneBoundsFromCss,
  paceZoneRanges,
  type SessionMetrics,
  type SwimMetrics,
} from "@shared/swimMetrics";
import { normalizeStroke, type MetricActivity, type MetricLap } from "./laps";

/** [distance, seconds, stroke?, strokes?, swolf?]; distance 0 is a rest. */
export type LapSpec = [number, number, (string | null)?, (number | null)?, (number | null)?];

export function lapsFrom(specs: LapSpec[]): MetricLap[] {
  return specs.map(([distanceMeters, seconds, stroke = "freestyle", strokes = null, swolf = null], index) => ({
    lapIndex: index + 1,
    distanceMeters,
    seconds,
    strokes,
    swolf,
    stroke: normalizeStroke(stroke),
  }));
}

export function activity(
  id: number,
  iso: string,
  specs: LapSpec[],
  extra: Partial<Omit<MetricActivity, "id" | "date" | "day" | "laps">> = {},
): MetricActivity {
  const laps = lapsFrom(specs);
  const active = laps.filter((lap) => lap.distanceMeters > 0);
  const date = new Date(iso);
  return {
    id,
    date,
    day: dayKey(date),
    distanceMeters: active.reduce((sum, lap) => sum + lap.distanceMeters, 0),
    durationSeconds: laps.reduce((sum, lap) => sum + lap.seconds, 0),
    poolLengthMeters: 25,
    isOpenWater: false,
    laps,
    ...extra,
  };
}

/** A complete, hand-written result (values of a regular masters swimmer). */
export function sampleSwimMetrics(): SwimMetrics {
  const session = (overrides: Partial<SessionMetrics>): SessionMetrics => ({
    activityId: 1, date: "2026-10-27", poolLengthMeters: 25, isOpenWater: false,
    distanceMeters: 2500, movingSeconds: 2600, hasLaps: true,
    intensityFactor: 0.92, stss: 56.3, zoneMeters: [500, 1000, 300, 200, 300, 100, 100],
    strokeIndex: 2.15, dpsMeters: 2.05, strokeRate: 30.2, swolf: 36.5,
    pacingCv: 2.8, pacingFade: 3.1,
    swimDistanceMeters: 2500, loadEstimated: false, unclassifiedMeters: 0,
    cssPaceSecondsPer100: 104.3, cssSource: "stima", dpsDropPct: 2.0, strokeRateRisePct: 1.5,
    ...overrides,
  });
  return {
    generatedAt: "2026-10-29T18:00:00.000Z",
    sessions: [
      session({ activityId: 1, date: "2026-10-15", distanceMeters: 2000 }),
      session({ activityId: 2, date: "2026-10-20" }),
      session({ activityId: 3, date: "2026-10-22" }),
      session({ activityId: 4, date: "2026-10-24" }),
      session({ activityId: 5, date: "2026-10-26" }),
      session({
        activityId: 6, date: "2026-10-27", poolLengthMeters: null, isOpenWater: true, distanceMeters: 2000,
        movingSeconds: 2400, hasLaps: false, intensityFactor: 0.86, stss: 42.4, zoneMeters: null,
        strokeIndex: null, dpsMeters: null, strokeRate: null, swolf: null, pacingCv: null, pacingFade: null,
        swimDistanceMeters: null, loadEstimated: true, unclassifiedMeters: null, dpsDropPct: null, strokeRateRisePct: null,
      }),
    ],
    css: {
      current: {
        paceSecondsPer100: 104.3, speedMps: 0.959, source: "stima", confidence: "alta",
        points: [
          { distanceMeters: 200, seconds: 175, date: "2026-10-06" },
          { distanceMeters: 400, seconds: 380, date: "2026-10-06" },
          { distanceMeters: 800, seconds: 800, date: "2026-10-15" },
        ],
        testDate: null,
        dPrimeMeters: 33.6, r2: 0.999,
        droppedPoints: [
          {
            distanceMeters: 300, seconds: 300, date: "2026-10-10",
            slowerThan: { distanceMeters: 400, seconds: 380, date: "2026-10-06" },
          },
        ],
      },
      history: [{ month: "2026-10", paceSecondsPer100: 104.3 }],
      missing: null,
    },
    zones: {
      source: "auto",
      ranges: paceZoneRanges(paceZoneBoundsFromCss(104.3)),
      bounds: paceZoneBoundsFromCss(104.3),
      autoBounds: paceZoneBoundsFromCss(104.3),
      manualUpdatedAt: null,
    },
    load: {
      threshold: { paceSecondsPer100: 104.3, source: "stima" },
      today: { ctl: 12.3, atl: 20.1, tsb: -7.8, reading: "neutro" },
      rampPerWeek: 2.1,
      days: [],
      missing: null,
    },
    intensity: {
      last28: {
        zoneMeters: [3000, 4200, 1000, 800, 600, 300, 100], easyPct: 72, mediumPct: 18, hardPct: 10,
        unclassifiedMeters: 1200, coveragePct: 80,
      },
      weeks: [],
      missing: null,
    },
    efficiency: {
      poolLengthMeters: 25, latest: 2.15, avg28: 2.1, baseline: 2.02, deltaPct: 4, missing: null,
      n28: 5, nBaseline: 9, dps28: 2.05, dpsBaseline: 1.98, pace28: 112, paceBaseline: 115,
    },
    pacing: {
      cv28: 2.8, fade28: 3.1,
      latestSet: {
        date: "2026-10-26", distanceMeters: 100, stroke: "freestyle", repSeconds: [92, 93, 94],
        repDps: [2.4, 2.35, 2.25], dpsDropPct: 6.3,
      },
      missing: null,
      dpsDrop28: 2.0, strokeRateRise28: 1.5,
    },
    volume: { weeks: [], avgKm4: 7.4, avgSessions4: 2.8, changePct: 12, streakWeeks: 5 },
  };
}
