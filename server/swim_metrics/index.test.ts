import { beforeEach, describe, expect, it, vi } from "vitest";
import { garminActivityLaps, swimmerProfiles, swimmingActivities } from "../../drizzle/schema";

// Fake db: each select resolves to the rows of the table it reads. The streak query is the one
// that selects only the activity dates.
const m = vi.hoisted(() => {
  const state = {
    activities: [] as any[],
    laps: [] as any[],
    profile: [] as any[],
    tables: [] as unknown[],
    rowsFor: (_table: unknown, _selection: Record<string, unknown>): unknown[] => [],
  };
  const db = {
    select: vi.fn((selection: Record<string, unknown>) => {
      let table: unknown;
      const chain: any = {
        from: (t: unknown) => {
          table = t;
          state.tables.push(t);
          return chain;
        },
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve().then(() => state.rowsFor(table, selection)).then(resolve, reject),
      };
      return chain;
    }),
  };
  return { state, db, getOrSetCached: vi.fn() };
});

vi.mock("../db", () => ({ getDb: async () => m.db }));
vi.mock("../lib/cache", async () => {
  const actual = await vi.importActual<typeof import("../lib/cache")>("../lib/cache");
  return { ...actual, getOrSetCached: m.getOrSetCached };
});

import { getSwimMetrics, parseCssTest } from "./index";

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

function useData(preferences: unknown = {}) {
  m.state.rowsFor = (table, selection) => {
    if (table === swimmingActivities) {
      return Object.keys(selection).length === 1
        ? ACTIVITIES.map((a) => ({ activityDate: a.activityDate }))
        : ACTIVITIES;
    }
    if (table === garminActivityLaps) return LAPS;
    if (table === swimmerProfiles) return [{ preferences }];
    return [];
  };
}

describe("getSwimMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.state.tables.length = 0;
    m.getOrSetCached.mockImplementation((_key: string, fetcher: () => Promise<unknown>) => fetcher());
  });

  it("caches per user for one hour", async () => {
    useData();
    await getSwimMetrics(42, NOW);
    expect(m.getOrSetCached).toHaveBeenCalledWith("swim-metrics:v1:42", expect.any(Function), 3600);
  });

  it("reads swims, laps, profile and streak dates", async () => {
    useData();
    await getSwimMetrics(42, NOW);
    expect(m.state.tables).toEqual([swimmingActivities, garminActivityLaps, swimmerProfiles, swimmingActivities]);
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
    expect(metrics.css.missing).toBeNull();

    // Per swim: the pool swim of 6/10 has zones, SI and a set; open water only load.
    const [a, , ow] = metrics.sessions;
    expect(a).toMatchObject({ date: "2026-10-06", poolLengthMeters: 25, hasLaps: true, isOpenWater: false });
    expect(a.movingSeconds).toBe(380 + 175 + REPS_A.reduce((s, t) => s + t, 0) + 230);
    expect(a.zoneMeters!.reduce((s, z) => s + z, 0)).toBe(1600);
    expect(a.intensityFactor).toBeGreaterThan(0.9);
    expect(a.stss).toBeGreaterThan(0);
    expect(a.strokeIndex).toBeGreaterThan(2);
    expect(a.pacingCv).toBe(1.4); // the 8×100: SD 1.32 s on 93.6 s
    expect(ow).toMatchObject({ isOpenWater: true, hasLaps: false, poolLengthMeters: null, zoneMeters: null, strokeIndex: null, pacingCv: null });
    expect(ow.stss).toBeGreaterThan(0);

    // Load: 90 days, today's reading.
    expect(metrics.load.days).toHaveLength(90);
    expect(metrics.load.days[89].date).toBe("2026-10-29");
    expect(metrics.load.today).not.toBeNull();
    expect(metrics.load.missing).toBeNull();

    // Intensity: 8 weeks; the last 28 days hold both pool swims.
    expect(metrics.intensity.weeks).toHaveLength(8);
    expect(metrics.intensity.last28!.zoneMeters.reduce((s, z) => s + z, 0)).toBe(1600 + 1600);
    const { easyPct, mediumPct, hardPct } = metrics.intensity.last28!;
    expect(easyPct + mediumPct + hardPct).toBe(100);

    // Efficiency: 25 m, no baseline yet.
    expect(metrics.efficiency).toMatchObject({ poolLengthMeters: 25, baseline: null, deltaPct: null });
    expect(metrics.efficiency.latest).toBe(metrics.sessions[1].strokeIndex);
    expect(metrics.efficiency.missing).toMatch(/base/);

    // Pacing: the 4×200 of 15/10 is the most recent set.
    expect(metrics.pacing.latestSet).toEqual({ date: "2026-10-15", distanceMeters: 200, stroke: "freestyle", repSeconds: [190, 192, 191, 195] });
    expect(metrics.pacing.cv28).not.toBeNull();

    // Volume.
    expect(metrics.volume.weeks).toHaveLength(12);
    expect(metrics.volume.weeks[11]).toEqual({ weekStart: "2026-10-26", km: 2, sessions: 1 });
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

  it("without swims says what is missing", async () => {
    m.state.rowsFor = (table) => (table === swimmerProfiles ? [{ preferences: null }] : []);
    const metrics = await getSwimMetrics(42, NOW);
    expect(m.state.tables).not.toContain(garminActivityLaps);
    expect(metrics.sessions).toEqual([]);
    expect(metrics.css.current).toBeNull();
    expect(metrics.css.missing).toBe(
      "Servono almeno due nuotate continue a stile libero, una fino a 400 m e una da 400 m in su, negli ultimi 90 giorni. Oppure inserisci un test.",
    );
    expect(metrics.load).toMatchObject({ today: null, rampPerWeek: null, days: [] });
    expect(metrics.load.missing).toMatch(/passo soglia/);
    expect(metrics.intensity.last28).toBeNull();
    expect(metrics.intensity.missing).toBe("Servono il passo soglia e nuotate con i giri.");
    expect(metrics.efficiency.missing).not.toBeNull();
    expect(metrics.pacing.missing).not.toBeNull();
    expect(metrics.volume).toMatchObject({ avgKm4: 0, avgSessions4: 0, changePct: null, streakWeeks: 0 });
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
