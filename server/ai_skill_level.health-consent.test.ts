import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
vi.mock("./db_profile_badges", () => ({ updateUserProfileBadgeByLevel: vi.fn() }));

import { detectIntensity } from "./ai_skill_level";

// The skill level reads training effect and heart-rate zones only with the health-data consent.
const hardSwim = {
  rawData: { activity: { aerobicTrainingEffect: 4.2 } },
  trainingEffect: 42,
  hrZone1Seconds: 0,
  hrZone2Seconds: 0,
  hrZone3Seconds: 100,
  hrZone4Seconds: 600,
  hrZone5Seconds: 300,
} as unknown as Parameters<typeof detectIntensity>[0];

describe("skill level intensity", () => {
  it("uses training effect and heart-rate zones with the consent", () => {
    expect(detectIntensity(hardSwim, true)).toBe("high");
  });

  it("ignores them without the consent", () => {
    expect(detectIntensity(hardSwim, false)).toBe("medium");
  });
});
