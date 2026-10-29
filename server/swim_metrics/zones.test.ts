import { describe, expect, it } from "vitest";
import { intensitySplit, sessionZones, unclassifiedMeters, zoneOf } from "./zones";
import { lapsFrom } from "./test-helpers";

describe("zoneOf", () => {
  it.each([
    [0.5, 0],
    [0.8499, 0],
    [0.85, 1], // a boundary goes to the upper zone
    [0.9199, 1],
    [0.92, 2],
    [0.97, 3],
    [1.0, 3],
    [1.0299, 3],
    [1.03, 4],
    [1.3, 4],
  ])("speed ratio %s → Z%s (0-based)", (ratio, zone) => {
    expect(zoneOf(ratio)).toBe(zone);
  });
});

describe("sessionZones", () => {
  it("sums the distance of each active freestyle lap in its zone; other strokes are unclassified", () => {
    // CSS 1 m/s (1:40/100 m).
    const laps = lapsFrom([
      [400, 500], // 0.80 → Z1
      [0, 60], // rest
      [200, 230], // 0.87 → Z2
      [100, 105], // 0.95 → Z3
      [100, 100], // 1.00 → Z4
      [100, 90, "backstroke"], // not zoned: the CSS is a freestyle pace
      [50, 70, "drill"],
      [50, 60, "kick"],
      [100, 95, null], // no stroke: not zoned
    ]);
    expect(sessionZones(laps, 1)).toEqual([400, 200, 100, 100, 0]);
    expect(unclassifiedMeters(laps)).toBe(300);
  });
});

describe("intensitySplit", () => {
  it("easy = Z1+Z2, medium = Z3, hard = Z4+Z5, summing to 100", () => {
    expect(intensitySplit([400, 200, 100, 100, 100])).toEqual({ easyPct: 67, mediumPct: 11, hardPct: 22 });
  });

  it("rounds by largest remainder", () => {
    expect(intensitySplit([1, 0, 1, 1, 0])).toEqual({ easyPct: 34, mediumPct: 33, hardPct: 33 });
  });

  it("no distance: null", () => {
    expect(intensitySplit([0, 0, 0, 0, 0])).toBeNull();
  });
});
