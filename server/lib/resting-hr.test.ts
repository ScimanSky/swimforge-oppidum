import { describe, expect, it } from "vitest";
import { DEFAULT_RESTING_HR, resolveBaselineRestingHr } from "./resting-hr";

describe("resolveBaselineRestingHr", () => {
  it("falls back to the default without data", () => expect(resolveBaselineRestingHr([])).toBe(DEFAULT_RESTING_HR));
  it("ignores null and implausible values", () => expect(resolveBaselineRestingHr([{ restingHeartRate: null }, { restingHeartRate: 5 }, { restingHeartRate: 180 }, { restingHeartRate: 52 }])).toBe(52));
  it("uses the median", () => expect(resolveBaselineRestingHr([{ restingHeartRate: 50 }, { restingHeartRate: 70 }, { restingHeartRate: 54 }])).toBe(54));
  it("averages the two middle values for an even count", () => expect(resolveBaselineRestingHr([{ restingHeartRate: 50 }, { restingHeartRate: 60 }])).toBe(55));
  it("rounds the even-count average", () => expect(resolveBaselineRestingHr([{ restingHeartRate: 51 }, { restingHeartRate: 52 }])).toBe(52));
  it("falls back to the default when only the scored activity exists", () =>
    expect(resolveBaselineRestingHr([{ restingHeartRate: 48 }].slice(1))).toBe(DEFAULT_RESTING_HR));
  it("keeps the 30 and 120 boundaries and drops 29 and 121", () => {
    expect(resolveBaselineRestingHr([{ restingHeartRate: 30 }])).toBe(30);
    expect(resolveBaselineRestingHr([{ restingHeartRate: 120 }])).toBe(120);
    expect(resolveBaselineRestingHr([{ restingHeartRate: 29 }, { restingHeartRate: 121 }])).toBe(DEFAULT_RESTING_HR);
  });
  it("drops NaN and Infinity", () =>
    expect(resolveBaselineRestingHr([{ restingHeartRate: Number.NaN }, { restingHeartRate: Number.POSITIVE_INFINITY }, { restingHeartRate: 56 }])).toBe(56));
  it("tolerates a missing key", () => expect(resolveBaselineRestingHr([{}, { restingHeartRate: 58 }])).toBe(58));
});
