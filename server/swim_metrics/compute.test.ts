import { describe, expect, it } from "vitest";
import { paceZoneBoundsFromCss } from "@shared/swimMetrics";
import { computeSwimMetrics } from "./compute";
import { activity } from "./test-helpers";

const NOW = new Date("2026-10-29T18:00:00Z"); // Thursday
// A test with T200 3:00 and T400 6:20 gives CSS 1 m/s (1:40/100 m), valid from 01/10.
const TEST_1MPS = { t200Seconds: 180, t400Seconds: 380, date: "2026-10-01" };

const rest = (seconds: number) => [0, seconds] as [number, number];

describe("computeSwimMetrics: load on laps or on the whole swim", () => {
  // 20/10, 25 m: 400 free at CSS, 4×100 free at 0.909 CSS, 200 back, 100 drill.
  const withLaps = activity(1, "2026-10-20T17:00:00Z", [
    [400, 400], rest(60),
    [100, 110], rest(20), [100, 110], rest(20), [100, 110], rest(20), [100, 110], rest(60),
    [200, 220, "backstroke"], rest(30),
    [100, 150, "drill"],
  ]);
  // 22/10: a Strava swim without laps, 2000 m in 40 minutes in total.
  const lapLess = activity(2, "2026-10-22T17:00:00Z", [], { distanceMeters: 2000, durationSeconds: 2400 });

  const metrics = computeSwimMetrics({ activities: [withLaps, lapLess], cssTest: TEST_1MPS, streakDates: [] }, NOW);
  const [a, b] = metrics.sessions;

  it("a swim with laps: sTSS on each active lap (moving time), non-freestyle at IF 0.80", () => {
    const cubes = 1 * 400 + 4 * (100 / 110) ** 3 * 110 + 0.512 * 220 + 0.512 * 150;
    expect(a.hasLaps).toBe(true);
    expect(a.loadEstimated).toBe(false);
    expect(a.stss).toBe(Math.round((cubes / 3600) * 1000) / 10); // 25.6
    expect(a.intensityFactor).toBe(Math.round(Math.cbrt(cubes / 1210) * 100) / 100); // 0.91
    expect(a.movingSeconds).toBe(1210);
    expect(a.swimDistanceMeters).toBe(1100);
  });

  it("a swim without laps: TrainingPeaks definition (distance / total time), marked as estimated", () => {
    expect(b.hasLaps).toBe(false);
    expect(b.loadEstimated).toBe(true);
    expect(b.intensityFactor).toBe(0.83);
    expect(b.stss).toBe(Math.round((2000 / 2400) ** 3 * (2400 / 3600) * 1000) / 10); // 38.6
    expect(b.swimDistanceMeters).toBeNull();
    expect(b.distanceMeters).toBe(2000);
  });

  it("zones take only freestyle laps; the rest is unclassified, with the coverage of the volume", () => {
    // The 400 at the CSS (1:40) is C1, the 100s at 1:50 are B1.
    expect(a.zoneMeters).toEqual([0, 0, 400, 0, 400, 0, 0]);
    expect(a.unclassifiedMeters).toBe(300);
    expect(b.zoneMeters).toBeNull();
    expect(metrics.intensity.last28).toMatchObject({
      zoneMeters: [0, 0, 400, 0, 400, 0, 0],
      unclassifiedMeters: 300,
      coveragePct: 26, // 800 m zoned of 3100 m swum in 28 days
      easyPct: 0,
      mediumPct: 50,
      hardPct: 50,
    });
    const week = metrics.intensity.weeks.find((w) => w.weekStart === "2026-10-19")!;
    expect(week).toEqual({ weekStart: "2026-10-19", zoneMeters: [0, 0, 400, 0, 400, 0, 0], unclassifiedMeters: 300 });
  });

  it("the zones in effect are computed from today's CSS, with the threshold of the load", () => {
    expect(metrics.zones).toMatchObject({ source: "auto", manualUpdatedAt: null });
    expect(metrics.zones.bounds).toEqual(paceZoneBoundsFromCss(100));
    expect(metrics.zones.autoBounds).toEqual(paceZoneBoundsFromCss(100));
    expect(metrics.zones.ranges.map((r) => [r.code, r.fastPace && Math.round(r.fastPace * 10) / 10, r.slowPace && Math.round(r.slowPace * 10) / 10, r.maxRepMeters])).toEqual([
      ["A1", 117.6, null, null],
      ["A2", 111.1, 117.6, null],
      ["B1", 105.3, 111.1, null],
      ["B2", 100, 105.3, null],
      ["C1", 96.2, 100, 200],
      ["C2", null, 96.2, 150],
      ["C3", null, 96.2, 25],
    ]);
    expect(metrics.load.threshold).toEqual({ paceSecondsPer100: 100, source: "test" });
  });

  it("without freestyle laps in 28 days the zones say why", () => {
    const back = activity(3, "2026-10-20T17:00:00Z", [[200, 220, "backstroke"], rest(30), [200, 215, "backstroke"]]);
    const m = computeSwimMetrics({ activities: [back], cssTest: TEST_1MPS, streakDates: [] }, NOW);
    expect(m.intensity.last28).toBeNull();
    expect(m.intensity.missing).toBe(
      "Nelle ultime 4 settimane non ci sono giri a stile libero da classificare: le zone si calcolano solo sullo stile libero.",
    );
  });
});

describe("computeSwimMetrics: manual zones («Le tue zone»)", () => {
  // Manual bounds a little slower than the CSS ones: 2:10 · 2:02 · 1:56 · 1:50 · 1:45.
  const MANUAL = { bounds: { a1a2: 130, a2b1: 122, b1b2: 116, b2c1: 110, c1c2: 105 }, updatedAt: "2026-10-25T09:00:00.000Z" };
  // 400 at 1:48 (C1 for these bounds, B1 from a CSS of 1:40), 100 at 2:05 (A2), 25 at 0:40 (C3).
  const swim = activity(5, "2026-10-20T17:00:00Z", [[400, 432], rest(30), [100, 125], rest(30), [25, 10]]);

  it("win over the CSS: zones, intensity and the contract say «manuali»", () => {
    const m = computeSwimMetrics({ activities: [swim], cssTest: TEST_1MPS, paceZones: MANUAL, streakDates: [] }, NOW);
    expect(m.sessions[0].zoneMeters).toEqual([0, 100, 0, 0, 400, 0, 25]);
    expect(m.intensity.last28!.zoneMeters).toEqual([0, 100, 0, 0, 400, 0, 25]);
    expect(m.zones).toMatchObject({ source: "manuali", bounds: MANUAL.bounds, manualUpdatedAt: "2026-10-25T09:00:00.000Z" });
    expect(m.zones.autoBounds).toEqual(paceZoneBoundsFromCss(100));
    expect(m.zones.ranges.find((r) => r.code === "B2")).toMatchObject({ fastPace: 110, slowPace: 116, level: "Soglia" });
    // The load keeps the CSS.
    expect(m.sessions[0]).toMatchObject({ cssPaceSecondsPer100: 100, cssSource: "test" });
    expect(m.load.threshold).toEqual({ paceSecondsPer100: 100, source: "test" });
  });

  it("without a CSS the B2/C1 boundary is the threshold of the zones and of the load («zone manuali»)", () => {
    const m = computeSwimMetrics({ activities: [swim], cssTest: null, paceZones: MANUAL, streakDates: [] }, NOW);
    expect(m.css.current).toBeNull();
    expect(m.zones.source).toBe("manuali");
    expect(m.zones.autoBounds).toBeNull();
    expect(m.sessions[0]).toMatchObject({ cssPaceSecondsPer100: 110, cssSource: "zone manuali" });
    expect(m.sessions[0].stss).toBeGreaterThan(0);
    expect(m.load.threshold).toEqual({ paceSecondsPer100: 110, source: "zone manuali" });
    expect(m.load.today).not.toBeNull();
    expect(m.load.missing).toBeNull();
    expect(m.intensity.last28).toMatchObject({ zoneMeters: [0, 100, 0, 0, 400, 0, 25], easyPct: 19, mediumPct: 0, hardPct: 81 });
    expect(m.intensity.missing).toBeNull();
  });

  it("without CSS and manual zones there are no zones", () => {
    const m = computeSwimMetrics({ activities: [swim], cssTest: null, streakDates: [] }, NOW);
    expect(m.zones).toEqual({ source: null, ranges: [], bounds: null, autoBounds: null, manualUpdatedAt: null });
    expect(m.load.threshold).toBeNull();
    expect(m.intensity.missing).toBe("Servono il passo soglia (o le tue zone) e nuotate con i giri.");
  });
});

describe("computeSwimMetrics: which CSS each swim gets", () => {
  // September efforts: 200 in 2:55 and 400 in 6:20 → estimate 200 / 205 m/s (1:42.5/100 m).
  const efforts = activity(10, "2026-09-15T17:00:00Z", [[200, 175], rest(120), [400, 380]]);
  // 900 m is not a CSS distance: these swims do not change the estimates.
  const swim = (id: number, iso: string) => activity(id, iso, [[900, 990]]);
  const ESTIMATE_PACE = 102.5;

  it("a test is valid from its date to date + 89, forward only; swims before it use the monthly estimate", () => {
    const test = { t200Seconds: 180, t400Seconds: 380, date: "2026-10-10" }; // 1:40/100 m
    const m = computeSwimMetrics(
      {
        activities: [efforts, swim(11, "2026-10-09T17:00:00Z"), swim(12, "2026-10-10T17:00:00Z"), swim(13, "2026-10-28T17:00:00Z")],
        cssTest: test,
        streakDates: [],
      },
      NOW,
    );
    const css = Object.fromEntries(m.sessions.map((s) => [s.activityId, [s.cssPaceSecondsPer100, s.cssSource]]));
    expect(css[11]).toEqual([ESTIMATE_PACE, "stima"]); // the day before the test
    expect(css[12]).toEqual([100, "test"]); // the test day
    expect(css[13]).toEqual([100, "test"]);
    expect(m.css.current).toMatchObject({ source: "test", paceSecondsPer100: 100 });
  });

  it("day 89 after the test still uses it, day 90 does not (the test expired before today)", () => {
    const test = { t200Seconds: 180, t400Seconds: 380, date: "2026-07-20" }; // valid to 17/10
    // With these, the October estimate is 200 / 195 m/s (1:37.5/100 m).
    const late = activity(20, "2026-10-12T17:00:00Z", [[200, 170], rest(120), [400, 365]]);
    const m = computeSwimMetrics(
      {
        activities: [efforts, late, swim(21, "2026-10-17T10:00:00Z"), swim(22, "2026-10-18T10:00:00Z")],
        cssTest: test,
        streakDates: [],
      },
      NOW,
    );
    const byId = new Map(m.sessions.map((s) => [s.activityId, s]));
    expect([byId.get(21)!.cssPaceSecondsPer100, byId.get(21)!.cssSource]).toEqual([100, "test"]);
    expect([byId.get(22)!.cssPaceSecondsPer100, byId.get(22)!.cssSource]).toEqual([97.5, "stima"]);
    // Today the test has expired: the current CSS is the estimate, the same one the swim of 18/10 used.
    expect(m.css.current!.source).toBe("stima");
    expect(byId.get(22)!.cssPaceSecondsPer100).toBe(m.css.current!.paceSecondsPer100);
  });

  it("an expired test is never a last resort: without an estimate there is no CSS and no load", () => {
    const test = { t200Seconds: 180, t400Seconds: 380, date: "2026-06-01" }; // expired 29/08
    const m = computeSwimMetrics({ activities: [swim(30, "2026-10-20T17:00:00Z")], cssTest: test, streakDates: [] }, NOW);
    expect(m.css.current).toBeNull();
    expect(m.sessions[0]).toMatchObject({ cssPaceSecondsPer100: null, cssSource: null, stss: null });
    expect(m.load.today).toBeNull();
    expect(m.load.missing).not.toBeNull();
  });

  it("css.current and the load agree: no current CSS, no load (even with older estimates)", () => {
    // Efforts of mid-June: the July estimate exists, today's 90 days hold none.
    const june = activity(40, "2026-06-15T17:00:00Z", [[200, 175], rest(120), [400, 380]]);
    const m = computeSwimMetrics({ activities: [june, swim(41, "2026-10-20T17:00:00Z")], cssTest: null, streakDates: [] }, NOW);
    expect(m.css.current).toBeNull();
    expect(m.load).toMatchObject({ today: null, days: [] });
    expect(m.intensity.last28).toBeNull();
  });
});

describe("computeSwimMetrics: CSS history windows", () => {
  it("months whose 90-day window is not covered by the CSS laps are null", () => {
    const efforts = activity(50, "2026-06-15T17:00:00Z", [[200, 175], rest(120), [400, 380]]);
    // CSS laps covering from 03/01: every month's window is covered; only June to August hold the efforts.
    const covered = computeSwimMetrics(
      { activities: [efforts], cssTest: null, streakDates: [], cssLaps: undefined, cssLapsFrom: "2026-01-03" },
      NOW,
    );
    expect(covered.css.history.map((h) => h.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(covered.css.history.map((h) => h.paceSecondsPer100)).toEqual([null, 102.5, 102.5, 102.5, null, null]);

    const partial = computeSwimMetrics(
      { activities: [efforts], cssTest: null, streakDates: [], cssLapsFrom: "2026-05-01" },
      NOW,
    );
    // June's window starts 02/04, before 01/05: not covered even though June has efforts.
    expect(partial.css.history.map((h) => h.paceSecondsPer100)).toEqual([null, null, 102.5, 102.5, null, null]);
  });
});
