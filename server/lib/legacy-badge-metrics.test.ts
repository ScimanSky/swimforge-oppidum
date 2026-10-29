import { describe, expect, it } from "vitest";
import { legacyBadgeSei, legacyBadgeSer, legacyBadgeTci } from "./legacy-badge-metrics";

// Pins the values the achievement badges were awarded with (formulas moved unchanged from the
// removed server/advanced_metrics.ts).
const base = { distanceMeters: 1000, durationSeconds: 1200 };

describe("legacy badge scores", () => {
  it("SEI", () => {
    // 0.4 × 90 + 0.35 × 80 + 0.25 × 75 = 82.75
    expect(legacyBadgeSei({ ...base, swolfScore: 40, avgStrokeDistance: 200, avgPacePer100m: 120 })).toBe(83);
    expect(legacyBadgeSei(base)).toBeNull();
  });

  it("SER", () => {
    // 0.6 × 80 + 0.4 × 83.3 = 81.3
    expect(legacyBadgeSer({ ...base, avgStrokeDistance: 200, avgStrokes: 12, poolLengthMeters: 25 })).toBe(81);
    expect(legacyBadgeSer(base)).toBeNull();
  });

  it("TCI", () => {
    const paces = [100, 110, 120].map((avgPacePer100m) => ({ ...base, avgPacePer100m }));
    expect(legacyBadgeTci(paces)).toBe(93);
    expect(legacyBadgeTci(paces.slice(0, 2))).toBeNull();
  });
});
