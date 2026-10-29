import { describe, expect, it } from "vitest";
import { activeLaps, normalizeStroke, toMetricLap } from "./laps";

describe("normalizeStroke", () => {
  it.each([
    ["FREESTYLE", "freestyle"],
    ["freestyle", "freestyle"],
    ["Stile libero", "freestyle"],
    ["BACKSTROKE", "backstroke"],
    ["rana", "breaststroke"],
    ["BUTTERFLY", "butterfly"],
    ["DRILL", "drill"],
    ["mixed", "mixed"],
    ["IM", "mixed"],
    ["kick", "other"],
  ])("%s → %s", (raw, expected) => {
    expect(normalizeStroke(raw)).toBe(expected);
  });

  it("null or empty → null", () => {
    expect(normalizeStroke(null)).toBeNull();
    expect(normalizeStroke("  ")).toBeNull();
  });
});

describe("toMetricLap", () => {
  const row = {
    activityId: 1,
    lapIndex: 3,
    distanceMeters: 100,
    durationSeconds: 95,
    movingDurationSeconds: 90,
    totalNumberOfStrokes: 40,
    averageSwolf: 38,
    strokeType: "FREESTYLE",
  };

  it("uses the moving time when present", () => {
    expect(toMetricLap(row)).toEqual({
      lapIndex: 3, distanceMeters: 100, seconds: 90, strokes: 40, swolf: 38, stroke: "freestyle",
    });
  });

  it("falls back to the duration, and reads a null distance as a rest", () => {
    expect(toMetricLap({ ...row, movingDurationSeconds: null }).seconds).toBe(95);
    expect(toMetricLap({ ...row, movingDurationSeconds: 0 }).seconds).toBe(95);
    expect(toMetricLap({ ...row, distanceMeters: null }).distanceMeters).toBe(0);
  });
});

describe("activeLaps", () => {
  it("drops rests and orders by lap index", () => {
    const laps = [
      { lapIndex: 3, distanceMeters: 100, seconds: 90, strokes: null, swolf: null, stroke: null },
      { lapIndex: 2, distanceMeters: 0, seconds: 30, strokes: null, swolf: null, stroke: null },
      { lapIndex: 1, distanceMeters: 100, seconds: 88, strokes: null, swolf: null, stroke: null },
    ];
    expect(activeLaps(laps).map((lap) => lap.lapIndex)).toEqual([1, 3]);
  });
});
