import { describe, expect, it } from "vitest";
import { paceZoneBoundsFromCss } from "@shared/swimMetrics";
import { addZones, intensitySplit, sessionZones, unclassifiedMeters } from "./zones";
import { lapsFrom } from "./test-helpers";

describe("sessionZones", () => {
  // CSS 1:40/100 m (1 m/s): A1 slower than 1:57.6, A2 to 1:51.1, B1 to 1:45.3, B2 to 1:40, C1 to 1:36.2.
  const bounds = paceZoneBoundsFromCss(100);

  it("sums the distance of each active freestyle lap in its zone A1..C3; other strokes are unclassified", () => {
    const laps = lapsFrom([
      [400, 500], // 2:05 → A1
      [0, 60], // rest
      [200, 230], // 1:55 → A2
      [100, 108], // 1:48 → B1
      [100, 103], // 1:43 → B2
      [100, 100], // 1:40, the CSS → C1
      [100, 92], // 1:32 → C2
      [25, 11], // 0:44 over 25 m → C3
      [50, 25], // 0:50 over 50 m in a 25 m pool → C2
      [100, 90, "backstroke"], // not zoned: the CSS is a freestyle pace
      [50, 70, "drill"],
      [50, 60, "kick"],
      [100, 95, null], // no stroke: not zoned
    ]);
    expect(sessionZones(laps, bounds, 25)).toEqual([400, 200, 100, 100, 100, 150, 25]);
    expect(unclassifiedMeters(laps)).toBe(300);
  });

  it("a sprint of one length of a 50 m pool is C3", () => {
    expect(sessionZones(lapsFrom([[50, 25]]), bounds, 50)).toEqual([0, 0, 0, 0, 0, 0, 50]);
  });

  it("uses manual bounds as given", () => {
    const manual = { a1a2: 130, a2b1: 122, b1b2: 116, b2c1: 110, c1c2: 105 };
    expect(sessionZones(lapsFrom([[100, 125], [100, 110]]), manual, 25)).toEqual([0, 100, 0, 0, 100, 0, 0]);
  });
});

describe("addZones", () => {
  it("adds the seven zones", () => {
    expect(addZones([1, 2, 3, 4, 5, 6, 7], [7, 6, 5, 4, 3, 2, 1])).toEqual([8, 8, 8, 8, 8, 8, 8]);
  });
});

describe("intensitySplit", () => {
  it("facile = A1+A2, medio = B1+B2, intenso = C1+C2+C3, summing to 100", () => {
    expect(intensitySplit([300, 300, 100, 100, 100, 50, 50])).toEqual({ easyPct: 60, mediumPct: 20, hardPct: 20 });
  });

  it("rounds by largest remainder", () => {
    expect(intensitySplit([1, 0, 1, 0, 1, 0, 0])).toEqual({ easyPct: 34, mediumPct: 33, hardPct: 33 });
  });

  it("no distance: null", () => {
    expect(intensitySplit([0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });
});
