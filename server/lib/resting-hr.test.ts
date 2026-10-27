import { describe, expect, it } from "vitest";
import { resolveBaselineRestingHr } from "./resting-hr";

describe("resolveBaselineRestingHr", () => {
  it("falls back to 60 without data", () => expect(resolveBaselineRestingHr([])).toBe(60));
  it("ignores null and implausible values", () => expect(resolveBaselineRestingHr([{ restingHeartRate: null }, { restingHeartRate: 5 }, { restingHeartRate: 180 }, { restingHeartRate: 52 }])).toBe(52));
  it("uses the median", () => expect(resolveBaselineRestingHr([{ restingHeartRate: 50 }, { restingHeartRate: 70 }, { restingHeartRate: 54 }])).toBe(54));
  it("averages the two middle values for an even count", () => expect(resolveBaselineRestingHr([{ restingHeartRate: 50 }, { restingHeartRate: 60 }])).toBe(55));
});
