import { describe, expect, it, vi } from "vitest";

// The pure helper does not touch the database; keep the module graph light.
vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./ai_insights", () => ({ generateAIInsights: vi.fn() }));

import { computeTrendIndicator } from "./db_statistics";

describe("computeTrendIndicator", () => {
  it("keeps the sign within the stable band", () => {
    expect(computeTrendIndicator(9.7, 10)).toEqual({
      direction: "stable",
      percentage: 3,
      signedPercentage: -3,
    });
  });

  it("up and down beyond ±5 %", () => {
    expect(computeTrendIndicator(12, 10)).toEqual({ direction: "up", percentage: 20, signedPercentage: 20 });
    expect(computeTrendIndicator(8, 10)).toEqual({ direction: "down", percentage: 20, signedPercentage: -20 });
  });

  it("no baseline → stable 0", () => {
    expect(computeTrendIndicator(5, 0)).toEqual({ direction: "stable", percentage: 0, signedPercentage: 0 });
  });
});
