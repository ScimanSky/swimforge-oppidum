import { beforeEach, describe, expect, it, vi } from "vitest";
import { garminActivityLaps, swimmerProfiles, swimmingActivities } from "../../drizzle/schema";

// Fake db: each select resolves to the rows of the table it reads (and of the columns it selects).
const m = vi.hoisted(() => {
  const state = {
    tables: [] as unknown[],
    selections: [] as Array<Record<string, unknown>>,
    grouped: [] as boolean[],
    /** Selects issued when the first query resolved: 5 means all ran in parallel. */
    selectsAtFirstResolve: null as number | null,
    rowsFor: (_table: unknown, _selection: Record<string, unknown>): unknown[] => [],
  };
  const db = {
    deleted: [] as unknown[],
    delete: vi.fn((table: unknown) => {
      db.deleted.push(table);
      return { where: async () => undefined };
    }),
    select: vi.fn((selection: Record<string, unknown>) => {
      let table: unknown;
      const index = state.selections.length;
      state.selections.push(selection);
      state.grouped.push(false);
      const chain: any = {
        from: (t: unknown) => {
          table = t;
          state.tables.push(t);
          return chain;
        },
        innerJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        groupBy: () => {
          state.grouped[index] = true;
          return chain;
        },
        limit: () => chain,
        then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => {
              state.selectsAtFirstResolve ??= state.selections.length;
              return state.rowsFor(table, selection);
            })
            .then(resolve, reject),
      };
      return chain;
    }),
  };
  return { state, db, getOrSetCached: vi.fn(), deleteCached: vi.fn(async () => {}) };
});

vi.mock("../db", () => ({ getDb: async () => m.db }));
vi.mock("../lib/cache", async () => {
  const actual = await vi.importActual<typeof import("../lib/cache")>("../lib/cache");
  return { ...actual, getOrSetCached: m.getOrSetCached, deleteCached: m.deleteCached };
});

import { aiInsightsCache } from "../../drizzle/schema";
import { getSwimMetrics, invalidateSwimMetrics, loadStrokeIndexProgress, parseCssTest, parsePaceZones } from "./index";

let lapId = 0;
function laps(activityId: number, specs: Array<[number, number, string | null, number | null, number | null]>) {
  return specs.map(([distance, seconds, stroke, strokes, swolf], index) => ({
    activityId,
    lapIndex: index + 1,
    distanceMeters: distance,
    durationSeconds: seconds,
    movingDurationSeconds: distance > 0 ? seconds : 0,
    totalNumberOfStrokes: strokes,
    averageSwolf: swolf,
    strokeType: stroke,
    id: ++lapId,
  }));
}

const NOW = new Date("2026-10-29T18:00:00Z"); // Thursday

// Three swims: two 25 m pool swims with laps, one open-water swim without laps.
const ACTIVITIES = [
  { id: 1, activityDate: new Date("2026-10-06T17:00:00Z"), distanceMeters: 1600, durationSeconds: 1814, poolLengthMeters: 25, isOpenWater: false },
  { id: 2, activityDate: new Date("2026-10-15T17:00:00Z"), distanceMeters: 1600, durationSeconds: 1748, poolLengthMeters: 25, isOpenWater: false },
  { id: 3, activityDate: new Date("2026-10-27T07:00:00Z"), distanceMeters: 2000, durationSeconds: 2400, poolLengthMeters: null, isOpenWater: true },
];
const REPS_A = [92, 93, 92, 94, 93, 95, 94, 96];
const LAPS = [
  ...laps(1, [
    [400, 380, "FREESTYLE", 160, 34],
    [0, 60, null, null, null],
    [200, 175, "FREESTYLE", 84, 32],
    [0, 60, null, null, null],
    ...REPS_A.flatMap((t) => [
      [100, t, "FREESTYLE", 42, 34] as [number, number, string, number, number],
      [0, 20, null, null, null] as [number, number, null, null, null],
    ]),
    [200, 230, "BACKSTROKE", null, null],
  ]),
  ...laps(2, [
    [800, 800, "FREESTYLE", 330, 36],
    [0, 90, null, null, null],
    [200, 190, "FREESTYLE", 84, 35],
    [0, 30, null, null, null],
    [200, 192, "FREESTYLE", 84, 35],
    [0, 30, null, null, null],
    [200, 191, "FREESTYLE", 84, 35],
    [0, 30, null, null, null],
    [200, 195, "FREESTYLE", 84, 35],
  ]),
];

// The light CSS query (300 days): the active laps with their swim's day and pool.
const ACTIVITY_BY_ID = new Map(ACTIVITIES.map((a) => [a.id, a]));
const OLD_CSS_LAPS = [
  // 20/03: older than the 180 days, inside the 90-day window of the end of May.
  { activityDate: new Date("2026-03-20T17:00:00Z"), poolLengthMeters: 25, isOpenWater: false, distanceMeters: 200, durationSeconds: 170, movingDurationSeconds: 170, strokeType: "FREESTYLE" },
  { activityDate: new Date("2026-03-20T17:00:00Z"), poolLengthMeters: 25, isOpenWater: false, distanceMeters: 400, durationSeconds: 360, movingDurationSeconds: 360, strokeType: "FREESTYLE" },
];
const cssLapRows = () => [
  ...OLD_CSS_LAPS,
  ...LAPS.filter((lap) => lap.distanceMeters >= 177 && !ACTIVITY_BY_ID.get(lap.activityId)!.isOpenWater).map((lap) => {
    const a = ACTIVITY_BY_ID.get(lap.activityId)!;
    return { activityDate: a.activityDate, poolLengthMeters: a.poolLengthMeters, isOpenWater: a.isOpenWater, distanceMeters: lap.distanceMeters, durationSeconds: lap.durationSeconds, movingDurationSeconds: lap.movingDurationSeconds, strokeType: lap.strokeType };
  }),
];
// Swims per Rome week of all the history, as the grouped streak query returns them: a run of 4
// weeks in the spring, then 3 weeks up to now.
const STREAK_WEEKS = [
  { weekStart: "2025-03-03", swims: 2 },
  { weekStart: "2025-03-10", swims: 4 },
  { weekStart: "2025-03-17", swims: 2 },
  { weekStart: "2025-03-24", swims: 3 },
  { weekStart: "2025-03-31", swims: 1 },
  { weekStart: "2026-10-05", swims: 2 },
  { weekStart: "2026-10-12", swims: 2 },
  { weekStart: "2026-10-19", swims: 3 },
  { weekStart: "2026-10-26", swims: 1 },
];

function useData(preferences: unknown = {}) {
  m.state.rowsFor = (table, selection) => {
    if (table === swimmingActivities) return "weekStart" in selection ? STREAK_WEEKS : ACTIVITIES;
    if (table === garminActivityLaps) return "activityDate" in selection ? cssLapRows() : LAPS;
    if (table === swimmerProfiles) return [{ preferences }];
    return [];
  };
}

describe("getSwimMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.state.tables.length = 0;
    m.state.selections.length = 0;
    m.state.grouped.length = 0;
    m.state.selectsAtFirstResolve = null;
    m.getOrSetCached.mockImplementation((_key: string, fetcher: () => Promise<unknown>) => fetcher());
  });

  it("caches per user and Rome day for one hour, so today's load rolls at midnight", async () => {
    useData();
    await getSwimMetrics(42, NOW);
    expect(m.getOrSetCached).toHaveBeenCalledWith("swim-metrics:v4:42:2026-10-29", expect.any(Function), 3600);
    // 23:30Z on 29/10 is already 30/10 in Rome.
    await getSwimMetrics(42, new Date("2026-10-29T23:30:00Z"));
    expect(m.getOrSetCached).toHaveBeenLastCalledWith("swim-metrics:v4:42:2026-10-30", expect.any(Function), 3600);
  });

  it("invalidation drops today's cached metrics and the AI insights rows", async () => {
    m.db.deleted.length = 0;
    await invalidateSwimMetrics(42, NOW);
    expect(m.deleteCached).toHaveBeenCalledWith("swim-metrics:v4:42:2026-10-29");
    expect(m.db.deleted).toEqual([aiInsightsCache]);
  });

  it("reads swims, laps, profile, CSS laps and swims per week with independent queries in parallel", async () => {
    useData();
    await getSwimMetrics(42, NOW);
    expect(m.state.tables).toEqual([swimmingActivities, garminActivityLaps, swimmerProfiles, garminActivityLaps, swimmingActivities]);
    expect(m.state.selectsAtFirstResolve).toBe(5);
    // The streaks are one grouped count per Rome week over all the history, not a list of dates.
    expect(Object.keys(m.state.selections[4]).sort()).toEqual(["swims", "weekStart"]);
    expect(m.state.grouped).toEqual([false, false, false, false, true]);
  });

  it("computes the six metrics from 3 swims", async () => {
    useData();
    const metrics = await getSwimMetrics(42, NOW);

    expect(metrics.generatedAt).toBe(NOW.toISOString());
    expect(metrics.sessions.map((s) => s.activityId)).toEqual([1, 2, 3]);

    // CSS: best 200 (175 s), 400 (380 s) and 800 (800 s); regression ≈ 1:44.3/100 m.
    expect(metrics.css.current).toMatchObject({ source: "stima", confidence: "alta", testDate: null });
    expect(metrics.css.current!.paceSecondsPer100).toBeCloseTo(104.3, 1);
    expect(metrics.css.current!.points.map((p) => [p.distanceMeters, p.seconds, p.date])).toEqual([
      [200, 175, "2026-10-06"],
      [400, 380, "2026-10-06"],
      [800, 800, "2026-10-15"],
    ]);
    expect(metrics.css.history).toHaveLength(6);
    expect(metrics.css.history[5].month).toBe("2026-10");
    expect(metrics.css.history[5].paceSecondsPer100).toBeCloseTo(104.3, 1);
    expect(metrics.css.history[4].paceSecondsPer100).toBeNull();
    // May's window (from 03/03) is complete thanks to the 300 days of CSS laps: 200 / 190 m/s.
    expect(metrics.css.history[0]).toEqual({ month: "2026-05", paceSecondsPer100: 95 });
    expect(metrics.css.missing).toBeNull();

    // Per swim: the pool swim of 6/10 has zones, SI and a set; open water only load.
    const [a, , ow] = metrics.sessions;
    expect(a).toMatchObject({ date: "2026-10-06", poolLengthMeters: 25, hasLaps: true, isOpenWater: false });
    expect(a.movingSeconds).toBe(380 + 175 + REPS_A.reduce((s, t) => s + t, 0) + 230);
    expect(a.zoneMeters!.reduce((s, z) => s + z, 0)).toBe(1400); // the 200 backstroke is not zoned
    expect(a.unclassifiedMeters).toBe(200);
    expect(a.swimDistanceMeters).toBe(1600);
    expect(a.loadEstimated).toBe(false);
    expect(a.intensityFactor).toBeGreaterThan(0.9);
    expect(a.stss).toBeGreaterThan(0);
    expect(a.strokeIndex).toBeGreaterThan(2);
    expect(a.pacingCv).toBe(1.5); // the 8×100: sample SD 1.41 s on 93.6 s
    expect(ow).toMatchObject({ isOpenWater: true, hasLaps: false, poolLengthMeters: null, zoneMeters: null, strokeIndex: null, pacingCv: null });
    expect(ow.stss).toBeGreaterThan(0);
    expect(ow.loadEstimated).toBe(true);

    // Load: 90 days, today's reading.
    expect(metrics.load.days).toHaveLength(90);
    expect(metrics.load.days[89].date).toBe("2026-10-29");
    expect(metrics.load.today).not.toBeNull();
    expect(metrics.load.missing).toBeNull();

    // Intensity: 8 weeks; the last 28 days hold both pool swims.
    expect(metrics.intensity.weeks).toHaveLength(8);
    expect(metrics.intensity.last28!.zoneMeters.reduce((s, z) => s + z, 0)).toBe(1400 + 1600);
    expect(metrics.intensity.last28).toMatchObject({ unclassifiedMeters: 200, coveragePct: 58 }); // 3000 of 5200 m
    const { easyPct, mediumPct, hardPct } = metrics.intensity.last28!;
    expect(easyPct + mediumPct + hardPct).toBe(100);

    // Efficiency: 25 m, no baseline yet.
    expect(metrics.efficiency).toMatchObject({ poolLengthMeters: 25, baseline: null, deltaPct: null, n28: 2, nBaseline: 0 });
    expect(metrics.efficiency.latest).toBe(metrics.sessions[1].strokeIndex);
    expect(metrics.efficiency.missing).toMatch(/base/);

    // Pacing: the 4×200 of 15/10 is the most recent set.
    expect(metrics.pacing.latestSet).toEqual({
      date: "2026-10-15",
      distanceMeters: 200,
      stroke: "freestyle",
      repSeconds: [190, 192, 191, 195],
      repDps: [2.38, 2.38, 2.38, 2.38], // 84 cycles every 200
      dpsDropPct: 0,
    });
    // The 8×100 of 06/10 also holds its 42 cycles: no stroke shortening in 28 days.
    expect(metrics.pacing).toMatchObject({ dpsDrop28: 0 });
    expect(metrics.pacing.cv28).not.toBeNull();

    // Volume.
    expect(metrics.volume.weeks).toHaveLength(12);
    expect(metrics.volume.weeks[11]).toEqual({ weekStart: "2026-10-26", km: 2, sessions: 1 });
    expect(metrics.volume.streakWeeks).toBe(3); // weeks of 5, 12 and 19/10; the current one has 1
    expect(metrics.volume.bestStreakWeeks).toBe(4); // 3 to 24 March 2025
  });

  it("uses a CSS test of the last 90 days and ignores an expired one", async () => {
    useData({ units: "metric", cssTest: { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" } });
    const fresh = await getSwimMetrics(42, NOW);
    expect(fresh.css.current).toMatchObject({ source: "test", confidence: null, testDate: "2026-10-20" });
    expect(fresh.css.current!.paceSecondsPer100).toBe(95); // 200 / (360 − 170) m/s

    useData({ cssTest: { t200Seconds: 170, t400Seconds: 360, date: "2026-06-01" } });
    const expired = await getSwimMetrics(42, NOW);
    expect(expired.css.current).toMatchObject({ source: "stima", testDate: null });
  });

  it("uses the manual zones saved in the preferences", async () => {
    const bounds = { a1a2: 130, a2b1: 122, b1b2: 116, b2c1: 110, c1c2: 105 };
    useData({ cssTest: null, paceZones: { bounds, updatedAt: "2026-10-25T09:00:00.000Z" } });
    const metrics = await getSwimMetrics(42, NOW);
    expect(metrics.zones).toMatchObject({ source: "manuali", bounds, manualUpdatedAt: "2026-10-25T09:00:00.000Z" });
    expect(metrics.zones.autoBounds!.b2c1).toBeCloseTo(104.3, 1);
  });

  it("without swims says what is missing", async () => {
    m.state.rowsFor = (table) => (table === swimmerProfiles ? [{ preferences: null }] : []);
    const metrics = await getSwimMetrics(42, NOW);
    expect(metrics.sessions).toEqual([]);
    expect(metrics.css.current).toBeNull();
    expect(metrics.css.missing).toBe(
      "Servono almeno due tratti continui a stile libero in vasca negli ultimi 90 giorni, tra 2 e 30 minuti, uno lungo almeno il doppio dell'altro (es. 200 e 400 m), nuotati a buon ritmo. Oppure inserisci un test.",
    );
    expect(metrics.load).toMatchObject({ today: null, rampPerWeek: null, days: [] });
    expect(metrics.load.missing).toMatch(/passo soglia/);
    expect(metrics.intensity.last28).toBeNull();
    expect(metrics.intensity.missing).toBe("Servono il passo soglia (o le tue zone) e nuotate con i giri.");
    expect(metrics.zones).toMatchObject({ source: null, ranges: [] });
    expect(metrics.efficiency.missing).not.toBeNull();
    expect(metrics.pacing.missing).not.toBeNull();
    expect(metrics.volume).toMatchObject({ avgKm4: 0, avgSessions4: 0, changePct: null, streakWeeks: 0, bestStreakWeeks: 0 });
  });
});

describe("parseCssTest", () => {
  it("reads the test from the preferences, as object or JSON", () => {
    const test = { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" };
    expect(parseCssTest({ cssTest: test })).toEqual(test);
    expect(parseCssTest(JSON.stringify({ cssTest: test }))).toEqual(test);
  });

  it("ignores missing or malformed tests", () => {
    expect(parseCssTest(null)).toBeNull();
    expect(parseCssTest({})).toBeNull();
    expect(parseCssTest({ cssTest: { t200Seconds: "x", t400Seconds: 360, date: "2026-10-20" } })).toBeNull();
    expect(parseCssTest({ cssTest: { t200Seconds: 170, t400Seconds: 160, date: "2026-10-20" } })).toBeNull();
    expect(parseCssTest({ cssTest: { t200Seconds: 170, t400Seconds: 360, date: "20/10/2026" } })).toBeNull();
    expect(parseCssTest("{")).toBeNull();
  });
});

describe("parsePaceZones", () => {
  const bounds = { a1a2: 128, a2b1: 121, b1b2: 114, b2c1: 109, c1c2: 104 };

  it("reads the manual bounds from the preferences, as object or JSON", () => {
    const paceZones = { bounds, updatedAt: "2026-10-25T09:00:00.000Z" };
    expect(parsePaceZones({ paceZones })).toEqual(paceZones);
    expect(parsePaceZones(JSON.stringify({ paceZones }))).toEqual(paceZones);
    expect(parsePaceZones({ paceZones: { bounds } })).toEqual({ bounds, updatedAt: null });
  });

  it("ignores missing or malformed bounds", () => {
    expect(parsePaceZones(null)).toBeNull();
    expect(parsePaceZones({})).toBeNull();
    expect(parsePaceZones({ paceZones: { bounds: { ...bounds, b1b2: "1:54" } } })).toBeNull();
    expect(parsePaceZones({ paceZones: { bounds: { ...bounds, b2c1: 121 } } })).toBeNull(); // not decreasing
    expect(parsePaceZones({ paceZones: { bounds: { ...bounds, a1a2: 300 } } })).toBeNull(); // over 4:00
    expect(parsePaceZones({ paceZones: { bounds: { a1a2: 128 } } })).toBeNull();
  });
});

// The owner: a recreational masters swimmer, out of shape, no CSS test and no Garmin CSS. Best
// freestyle laps of the last 90 days: 100 in 1:26, 200 in 3:20, 300 in 5:56 (clearly
// submaximal: slower per 100 m than the 400) and 400 in 6:57.
describe("getSwimMetrics: the owner's CSS (integration fixture)", () => {
  const OWNER_SWIMS = [
    { id: 101, activityDate: new Date("2026-08-20T17:00:00Z"), distanceMeters: 1400, durationSeconds: 1900, poolLengthMeters: 25, isOpenWater: false },
    { id: 102, activityDate: new Date("2026-09-10T17:00:00Z"), distanceMeters: 1000, durationSeconds: 1300, poolLengthMeters: 25, isOpenWater: false },
    { id: 103, activityDate: new Date("2026-10-01T17:00:00Z"), distanceMeters: 1200, durationSeconds: 1600, poolLengthMeters: 25, isOpenWater: false },
    { id: 104, activityDate: new Date("2026-10-22T17:00:00Z"), distanceMeters: 1000, durationSeconds: 1350, poolLengthMeters: 25, isOpenWater: false },
  ];
  const rep = (t: number) => [[100, t, "FREESTYLE", 44, 40], [0, 30, null, null, null]] as Array<[number, number, string | null, number | null, number | null]>;
  const OWNER_LAPS = [
    ...laps(101, [[400, 417, "FREESTYLE", 180, 44], [0, 90, null, null, null], ...rep(96), ...rep(97), ...rep(99), ...rep(101), [200, 260, "BREASTSTROKE", 60, null], [0, 60, null, null, null], [400, 470, "FREESTYLE", 184, 47]]),
    ...laps(102, [[200, 200, "FREESTYLE", 88, 43], [0, 60, null, null, null], [300, 356, "FREESTYLE", 138, 49], [0, 60, null, null, null], [100, 86, "FREESTYLE", 40, 38], [0, 120, null, null, null], [400, 480, "FREESTYLE", 186, 48]]),
    ...laps(103, [[400, 430, "FREESTYLE", 182, 45], [0, 60, null, null, null], [200, 210, "FREESTYLE", 90, 44], [0, 60, null, null, null], ...rep(100), ...rep(102), ...rep(104), [200, 230, "FREESTYLE", 92, 46]]),
    ...laps(104, [[400, 445, "FREESTYLE", 184, 46], [0, 120, null, null, null], [300, 365, "FREESTYLE", 140, 50], [0, 60, null, null, null], [300, 370, "FREESTYLE", 142, 50]]),
  ];
  const byId = new Map(OWNER_SWIMS.map((a) => [a.id, a]));

  beforeEach(() => {
    vi.clearAllMocks();
    m.getOrSetCached.mockImplementation((_key: string, fetcher: () => Promise<unknown>) => fetcher());
    m.state.rowsFor = (table, selection) => {
      if (table === swimmingActivities) return "weekStart" in selection ? [] : OWNER_SWIMS;
      if (table === garminActivityLaps) {
        if (!("activityDate" in selection)) return OWNER_LAPS;
        return OWNER_LAPS.filter((lap) => lap.distanceMeters >= 177).map((lap) => {
          const a = byId.get(lap.activityId)!;
          return { activityDate: a.activityDate, poolLengthMeters: 25, isOpenWater: false, distanceMeters: lap.distanceMeters, durationSeconds: lap.durationSeconds, movingDurationSeconds: lap.movingDurationSeconds, strokeType: lap.strokeType };
        });
      }
      if (table === swimmerProfiles) return [{ preferences: { units: "metric" } }];
      return [];
    };
  });

  it("estimates the CSS from the 200 and the 400 at about 1:48.5/100 m, medium confidence", async () => {
    const metrics = await getSwimMetrics(1, NOW);
    const css = metrics.css.current!;
    expect(css.source).toBe("stima");
    expect(css.confidence).toBe("media");
    expect(css.paceSecondsPer100).toBe(108.5); // 217 s for the 200 m between the 200 and the 400
    expect(css.speedMps).toBeCloseTo(200 / 217, 3);
    expect(css.points.map((p) => [p.distanceMeters, p.seconds, p.date])).toEqual([
      [200, 200, "2026-09-10"],
      [400, 417, "2026-08-20"],
    ]);
    expect(css.droppedPoints!.map((p) => [p.distanceMeters, p.seconds, p.slowerThan.distanceMeters])).toEqual([[300, 356, 400]]);
    expect(css.dPrimeMeters).toBeCloseTo(15.7, 1);
    // The owner's zones A1–C3 for this CSS, to the tenth of a second.
    expect(metrics.zones.source).toBe("auto");
    const tenth = (pace: number | null) => (pace === null ? null : Math.round(pace * 10) / 10);
    expect(metrics.zones.ranges.map((r) => [r.code, tenth(r.fastPace), tenth(r.slowPace)])).toEqual([
      ["A1", 127.6, null],
      ["A2", 120.6, 127.6],
      ["B1", 114.2, 120.6],
      ["B2", 108.5, 114.2],
      ["C1", 104.3, 108.5],
      ["C2", null, 104.3],
      ["C3", null, 104.3],
    ]);
    // The coach reads them as paces with the level and the maximum rep.
    const { swimMetricsForCoach } = await import("./coach-context");
    const text = swimMetricsForCoach(metrics);
    expect(text).toContain("- A2 Fondo lento · livello Aerobico: 2:01–2:08/100 m");
    expect(text).toContain("- C1 Soglia anaerobica · livello Soglia: 1:44–1:49/100 m · max 200 m a ripetuta");
  });
});

describe("loadStrokeIndexProgress (for the «Efficienza Suprema» badge)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.state.tables.length = 0;
    m.state.selections.length = 0;
    m.state.grouped.length = 0;
  });

  it("reads 118 days of pool swims and their laps, and summarises the Stroke Index like the card", async () => {
    // 6 baseline swims (40–100 days ago) at SI 2.0, 6 recent swims at SI 2.2 (+10%).
    const days = [100, 90, 80, 70, 60, 40, 25, 20, 15, 10, 5, 2];
    const swims = days.map((d, i) => ({
      id: 200 + i,
      activityDate: new Date(NOW.getTime() - d * 86_400_000),
      poolLengthMeters: 25,
    }));
    // SI = v × DPS: 100 m in 100 s with 50 cycles = 1 × 2 = 2.0; 100 m in 100/1.1 s with 50 cycles = 2.2.
    const lapRows = swims.flatMap((s, i) =>
      laps(s.id, [[100, i < 6 ? 100 : 100 / 1.1, "FREESTYLE", 50, 40], [0, 20, null, null, null], [100, i < 6 ? 100 : 100 / 1.1, "FREESTYLE", 50, 40]]),
    );
    m.state.rowsFor = (table) => (table === swimmingActivities ? swims : table === garminActivityLaps ? lapRows : []);

    const summary = await loadStrokeIndexProgress(42, NOW);
    expect(m.state.tables).toEqual([swimmingActivities, garminActivityLaps]);
    expect(summary).toMatchObject({ poolLengthMeters: 25, n28: 6, nBaseline: 6 });
    expect(summary.avg28).toBeCloseTo(2.2, 9);
    expect(summary.baseline).toBeCloseTo(2.0, 9);
  });
});
