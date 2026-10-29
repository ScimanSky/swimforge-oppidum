import { describe, expect, it } from "vitest";
import { loadSeries, rampPerWeek, sessionLoad, tsbReading } from "./load";

describe("sessionLoad (sTSS)", () => {
  it("IF 1 for one hour is 100", () => {
    const result = sessionLoad(3600, 3600, 1);
    expect(result.intensityFactor).toBe(1);
    expect(result.stss).toBeCloseTo(100, 9);
  });

  it("cubes the intensity factor", () => {
    // 0.9 m/s against 1 m/s for 30 minutes: 0.729 × 0.5 × 100.
    const result = sessionLoad(1620, 1800, 1);
    expect(result.intensityFactor).toBeCloseTo(0.9, 9);
    expect(result.stss).toBeCloseTo(36.45, 9);
  });

  it("caps IF at 1.3", () => {
    const result = sessionLoad(2000, 1000, 1);
    expect(result.intensityFactor).toBe(1.3);
    expect(result.stss).toBeCloseTo(1.3 ** 3 * (1000 / 3600) * 100, 9);
  });

  it("no time or no CSS: no load", () => {
    expect(sessionLoad(1000, 0, 1)).toEqual({ intensityFactor: null, stss: null });
    expect(sessionLoad(1000, 900, 0)).toEqual({ intensityFactor: null, stss: null });
  });
});

describe("loadSeries (CTL 42 days, ATL 7 days)", () => {
  it("3 known days", () => {
    const daily = new Map([
      ["2026-10-01", 100],
      ["2026-10-03", 50],
    ]);
    const series = loadSeries(daily, "2026-10-01", "2026-10-03");
    expect(series.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(series.map((d) => d.stss)).toEqual([100, 0, 50]);

    // Day 1: TSB from the day before (0); CTL = 100/42, ATL = 100/7.
    expect(series[0].tsb).toBe(0);
    expect(series[0].ctl).toBeCloseTo(2.380952, 5);
    expect(series[0].atl).toBeCloseTo(14.285714, 5);
    // Day 2: no swim; TSB = CTL − ATL at the end of day 1.
    expect(series[1].tsb).toBeCloseTo(-11.904762, 5);
    expect(series[1].ctl).toBeCloseTo(2.324263, 5);
    expect(series[1].atl).toBeCloseTo(12.244898, 5);
    // Day 3: 50.
    expect(series[2].tsb).toBeCloseTo(-9.920635, 5);
    expect(series[2].ctl).toBeCloseTo(3.4594, 4);
    expect(series[2].atl).toBeCloseTo(17.638484, 5);
  });

  it("ramp is CTL today minus CTL 7 days earlier", () => {
    const daily = new Map<string, number>();
    for (let d = 1; d <= 20; d += 1) daily.set(`2026-10-${String(d).padStart(2, "0")}`, 60);
    const series = loadSeries(daily, "2026-10-01", "2026-10-20");
    expect(rampPerWeek(series)).toBeCloseTo(series[19].ctl - series[12].ctl, 9);
    expect(rampPerWeek(series.slice(0, 7))).toBeNull();
  });
});

describe("tsbReading (TrainingPeaks conventions)", () => {
  // > +25 | (+5, +25] | [−10, +5] | [−30, −10) | < −30
  it.each([
    [40, "molto_riposato"],
    [25.1, "molto_riposato"],
    [25, "fresco"],
    [15.1, "fresco"],
    [5.1, "fresco"],
    [5, "neutro"],
    [0, "neutro"],
    [-10, "neutro"],
    [-10.1, "in_costruzione"],
    [-30, "in_costruzione"],
    [-30.1, "carico_alto"],
  ] as const)("%s → %s", (tsb, reading) => {
    expect(tsbReading(tsb)).toBe(reading);
  });
});
