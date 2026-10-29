import { describe, expect, it } from "vitest";
import { detectSets, pacingSummary, sessionPacing, setStats, setStrokeStats } from "./pacing";
import { lapsFrom, type LapSpec } from "./test-helpers";

const withRests = (specs: LapSpec[]): LapSpec[] => specs.flatMap((spec) => [spec, [0, 20] as LapSpec]);

describe("detectSets", () => {
  it("8×100 with rests in between is one set", () => {
    const times = [90, 91, 92, 90, 93, 92, 94, 95];
    const laps = lapsFrom([[400, 400], [0, 60], ...withRests(times.map((t) => [100, t] as LapSpec)), [200, 230]]);
    const sets = detectSets(laps);
    expect(sets).toEqual([{ distanceMeters: 100, stroke: "freestyle", repSeconds: times, repDps: null, repStrokeRates: null }]);
  });

  it("a long rest splits the run: 4×100 warm-up, 3 minutes, then 6×100 are two sets", () => {
    const warmUp = [100, 101, 100, 102];
    const main = [92, 93, 92, 94, 95, 97];
    const laps = lapsFrom([
      ...withRests(warmUp.map((t) => [100, t] as LapSpec)).slice(0, -1),
      [0, 180],
      ...withRests(main.map((t) => [100, t] as LapSpec)),
    ]);
    expect(detectSets(laps).map((set) => set.repSeconds)).toEqual([warmUp, main]);
  });

  it("a rest splits only above max(60 s, 2 × the median rest so far)", () => {
    const rep = [100, 90] as LapSpec;
    // Rests 40, 40, 40, then 90 > max(60, 80): split.
    const split = lapsFrom([rep, [0, 40], rep, [0, 40], rep, [0, 40], rep, [0, 90], rep, [0, 40], rep, [0, 40], rep]);
    expect(detectSets(split).map((s) => s.repSeconds.length)).toEqual([4, 3]);
    // Rests 50, 50, then 95 ≤ max(60, 100): same set.
    const kept = lapsFrom([rep, [0, 50], rep, [0, 50], rep, [0, 95], rep]);
    expect(detectSets(kept).map((s) => s.repSeconds.length)).toEqual([4]);
    // The first gap of a run is compared with 60 s: 61 s splits.
    const early = lapsFrom([rep, [0, 61], rep, [0, 20], rep, [0, 20], rep]);
    expect(detectSets(early).map((s) => s.repSeconds.length)).toEqual([3]);
    // Two rest laps in a row add up.
    const twoRests = lapsFrom([rep, [0, 20], rep, [0, 20], rep, [0, 40], [0, 40], rep, [0, 20], rep, [0, 20], rep]);
    expect(detectSets(twoRests).map((s) => s.repSeconds.length)).toEqual([3, 3]);
  });

  it("a slower rep never splits the set: that is the fade being measured", () => {
    const times = [90, 90, 91, 99, 105, 112];
    const laps = lapsFrom(withRests(times.map((t) => [100, t] as LapSpec)));
    expect(detectSets(laps).map((s) => s.repSeconds)).toEqual([times]);
  });

  it("a stroke change splits the set", () => {
    const laps = lapsFrom(
      withRests([
        [100, 90], [100, 91], [100, 92], [100, 93],
        [100, 105, "backstroke"], [100, 106, "backstroke"], [100, 104, "backstroke"],
      ]),
    );
    expect(detectSets(laps).map((s) => [s.stroke, s.repSeconds.length])).toEqual([
      ["freestyle", 4],
      ["backstroke", 3],
    ]);
  });

  it("2 laps are not a set, nor are laps under 50 m", () => {
    expect(detectSets(lapsFrom(withRests([[100, 90], [100, 91], [200, 190]])))).toEqual([]);
    expect(detectSets(lapsFrom(withRests([[25, 20], [25, 21], [25, 20], [25, 19]])))).toEqual([]);
  });
});

describe("setStats", () => {
  it("CV (sample SD, n − 1, / mean) and fade (last third against first third)", () => {
    const { cv, fade } = setStats([90, 92, 94, 96, 98, 100]);
    // mean 95, squared deviations 70, sample variance 70/5 = 14, SD 3.742 → CV 3.94%.
    expect(cv).toBeCloseTo((Math.sqrt(70 / 5) / 95) * 100, 9);
    expect(cv).toBeCloseTo(3.94, 2);
    // thirds of 2: (99 − 91) / 91 = 8.79%.
    expect(fade).toBeCloseTo((8 / 91) * 100, 9);
  });

  it("a third is ceil(n/3) reps", () => {
    // n = 7 → thirds of 3: first 90, 90, 90; last 93, 93, 93.
    expect(setStats([90, 90, 90, 100, 93, 93, 93]).fade).toBeCloseTo((3 / 90) * 100, 9);
  });

  it("even pace: 0 and 0", () => {
    expect(setStats([80, 80, 80])).toEqual({ cv: 0, fade: 0 });
  });
});

describe("stroke holding in repeat sets (tenuta della bracciata)", () => {
  // 6×100 freestyle: the stroke shortens and the rate rises at the end.
  const times = [90, 90, 91, 93, 95, 97];
  const strokes = [40, 40, 41, 43, 44, 45];
  const reps = (stroke = "freestyle", counts: Array<number | null> = strokes) =>
    withRests(times.map((t, i) => [100, t, stroke, counts[i]] as LapSpec));

  it("keeps the distance per cycle and the cycles per minute of each rep", () => {
    const [set] = detectSets(lapsFrom(reps()));
    expect(set.repDps).toEqual(strokes.map((n) => 100 / n));
    expect(set.repStrokeRates!.map((r) => Math.round(r * 100) / 100)).toEqual(
      strokes.map((n, i) => Math.round((n / (times[i] / 60)) * 100) / 100),
    );
  });

  it("DPS drop = (first third − last third) / first third; rate rise the other way round", () => {
    const [set] = detectSets(lapsFrom(reps()));
    const stats = setStrokeStats(set)!;
    const firstDps = (100 / 40 + 100 / 40) / 2; // 2.5 m
    const lastDps = (100 / 44 + 100 / 45) / 2; // 2.247 m
    expect(stats.dpsDropPct).toBeCloseTo(((firstDps - lastDps) / firstDps) * 100, 9); // 10.1%
    const rate = (i: number) => strokes[i] / (times[i] / 60);
    const firstRate = (rate(0) + rate(1)) / 2;
    const lastRate = (rate(4) + rate(5)) / 2;
    expect(stats.strokeRateRisePct).toBeCloseTo(((lastRate - firstRate) / firstRate) * 100, 9); // 4.3%
  });

  it("no stroke data on every rep, a drill set or implausible counts: no stroke holding", () => {
    const missing = detectSets(lapsFrom(reps("freestyle", [40, 40, null, 43, 44, 45])))[0];
    expect(missing.repDps).toBeNull();
    expect(setStrokeStats(missing)).toBeNull();
    expect(detectSets(lapsFrom(reps("drill")))[0].repDps).toBeNull();
    // 100 m in 20 cycles = 5 m per cycle: miscounted.
    expect(detectSets(lapsFrom(reps("freestyle", [40, 40, 20, 43, 44, 45])))[0].repDps).toBeNull();
  });

  it("per swim: distance-weighted mean over the sets with stroke data", () => {
    const laps = lapsFrom([...reps(), [0, 120], ...withRests([[200, 200, "freestyle", 80], [200, 200, "freestyle", 80], [200, 200, "freestyle", 80]])]);
    const result = sessionPacing(laps);
    const first = setStrokeStats(result.sets[0])!;
    // The 3×200 holds its stroke (0%): weights 600 and 600 m.
    expect(result.dpsDrop).toBeCloseTo((first.dpsDropPct * 600 + 0 * 600) / 1200, 9);
    expect(result.strokeRateRise).toBeCloseTo((first.strokeRateRisePct * 600 + 0 * 600) / 1200, 9);
  });
});

describe("sessionPacing", () => {
  it("distance-weighted mean of the sets", () => {
    // 4×100 (400 m) and 4×200 (800 m).
    const laps = lapsFrom(withRests([
      [100, 90], [100, 90], [100, 90], [100, 90],
      [200, 180], [200, 200], [200, 180], [200, 200],
    ]));
    const result = sessionPacing(laps);
    const second = setStats([180, 200, 180, 200]);
    expect(result.cv).toBeCloseTo((0 * 400 + second.cv * 800) / 1200, 9);
    expect(result.fade).toBeCloseTo((0 * 400 + second.fade * 800) / 1200, 9);
    expect(result.sets).toHaveLength(2);
  });

  it("no sets: null", () => {
    expect(sessionPacing(lapsFrom([[1500, 1500]]))).toEqual({ cv: null, fade: null, dpsDrop: null, strokeRateRise: null, sets: [] });
  });
});

describe("pacingSummary", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const set = { distanceMeters: 100, stroke: "freestyle" as const, repSeconds: [90, 91, 92], repDps: null, repStrokeRates: null };
  const row = (date: string, pacingCv: number | null, pacingFade: number | null, lastSet: any, dpsDrop: number | null = null, strokeRateRise: number | null = null) =>
    ({ date, pacingCv, pacingFade, lastSet, dpsDrop, strokeRateRise });

  it("medians of the last 28 days and the most recent set", () => {
    const result = pacingSummary(
      [
        row("2026-09-01", 9, 9, set, 20, 20),
        row("2026-10-10", 2, 1, set, 2, 1),
        row("2026-10-20", 3, 6, set, 8, 5),
        row("2026-10-24", null, null, null),
        row("2026-10-25", 5, 2, { ...set, repSeconds: [80, 82, 84], repDps: [2.5, 2.4, 2.2], repStrokeRates: [30, 31, 33] }, 12, 10),
      ],
      now,
    );
    expect(result.cv28).toBe(3);
    expect(result.fade28).toBe(2);
    expect(result.dpsDrop28).toBe(8);
    expect(result.strokeRateRise28).toBe(5);
    expect(result.latestSet).toEqual({
      date: "2026-10-25",
      distanceMeters: 100,
      stroke: "freestyle",
      repSeconds: [80, 82, 84],
      repDps: [2.5, 2.4, 2.2],
      dpsDropPct: expect.closeTo(12, 9), // (2.5 − 2.2) / 2.5
    });
    expect(result.missing).toBeNull();
  });

  it("the latest set without stroke data has no DPS", () => {
    const result = pacingSummary([row("2026-10-25", 2, 1, set)], now);
    expect(result.latestSet).toMatchObject({ repDps: null, dpsDropPct: null });
    expect(result.dpsDrop28).toBeNull();
  });

  it("without sets in the last 28 days it says what is needed", () => {
    const result = pacingSummary([row("2026-09-01", 2, 1, set)], now);
    expect(result.cv28).toBeNull();
    expect(result.fade28).toBeNull();
    expect(result.latestSet?.date).toBe("2026-09-01");
    expect(result.missing).toMatch(/almeno 3 ripetute/);
  });
});
