import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDbMock } = vi.hoisted(() => ({ getDbMock: vi.fn() }));
vi.mock("./db", () => ({ getDb: getDbMock }));

import { ACTION_XP_DAILY_CAP, ACTION_XP_RULES, awardActionXp, getActionXpStatus } from "./xp_actions";

describe("xp_actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDbMock.mockResolvedValue(null);
  });

  it("keeps the historical rule table", () => {
    expect(ACTION_XP_RULES).toEqual({
      comment: { xp: 16 },
      splash: { xp: 10 },
      reaction: { xp: 8 },
      rsvp: { xp: 12 },
      club_post: { xp: 20 },
    });
    expect(ACTION_XP_DAILY_CAP).toBe(90);
  });

  it("returns unavailable when the database is not configured", async () => {
    const result = await awardActionXp({ userId: 1, actionType: "comment", entityId: 10 });
    expect(result.awardedXp).toBe(0);
    expect(result.reason).toBe("unavailable");
  });

  it("reports an empty status without database", async () => {
    const status = await getActionXpStatus(7, new Date("2026-10-27T10:00:00Z"));
    expect(status).toMatchObject({ dayKey: "2026-10-27", earnedToday: 0, cap: 90, remaining: 90 });
  });
});
