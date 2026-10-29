import { describe, expect, it } from "vitest";
import { detectSets, pacingSummary, sessionPacing, setStats } from "./pacing";
import { lapsFrom, type LapSpec } from "./test-helpers";

const withRests = (specs: LapSpec[]): LapSpec[] => specs.flatMap((spec) => [spec, [0, 20] as LapSpec]);

describe("detectSets", () => {
  it("8×100 with rests in between is one set", () => {
    const times = [90, 91, 92, 90, 93, 92, 94, 95];
    const laps = lapsFrom([[400, 400], [0, 60], ...withRests(times.map((t) => [100, t] as LapSpec)), [200, 230]]);
    const sets = detectSets(laps);
    expect(sets).toEqual([{ distanceMeters: 100, stroke: "freestyle", repSeconds: times }]);
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
  it("CV (population SD / mean) and fade (last third against first third)", () => {
    const { cv, fade } = setStats([90, 92, 94, 96, 98, 100]);
    // mean 95, variance 70/6, SD 3.416 → CV 3.60%.
    expect(cv).toBeCloseTo((Math.sqrt(70 / 6) / 95) * 100, 9);
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
    expect(sessionPacing(lapsFrom([[1500, 1500]]))).toEqual({ cv: null, fade: null, sets: [] });
  });
});

describe("pacingSummary", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const set = { distanceMeters: 100, stroke: "freestyle" as const, repSeconds: [90, 91, 92] };

  it("medians of the last 28 days and the most recent set", () => {
    const result = pacingSummary(
      [
        { date: "2026-09-01", pacingCv: 9, pacingFade: 9, lastSet: set },
        { date: "2026-10-10", pacingCv: 2, pacingFade: 1, lastSet: set },
        { date: "2026-10-20", pacingCv: 3, pacingFade: 6, lastSet: set },
        { date: "2026-10-24", pacingCv: null, pacingFade: null, lastSet: null },
        { date: "2026-10-25", pacingCv: 5, pacingFade: 2, lastSet: { ...set, repSeconds: [80, 82, 84] } },
      ],
      now,
    );
    expect(result.cv28).toBe(3);
    expect(result.fade28).toBe(2);
    expect(result.latestSet).toEqual({ date: "2026-10-25", distanceMeters: 100, stroke: "freestyle", repSeconds: [80, 82, 84] });
    expect(result.missing).toBeNull();
  });

  it("without sets in the last 28 days it says what is needed", () => {
    const result = pacingSummary([{ date: "2026-09-01", pacingCv: 2, pacingFade: 1, lastSet: set }], now);
    expect(result.cv28).toBeNull();
    expect(result.fade28).toBeNull();
    expect(result.latestSet?.date).toBe("2026-09-01");
    expect(result.missing).toMatch(/almeno 3 ripetute/);
  });
});
