import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { trackProductEventMock } = vi.hoisted(() => ({
  trackProductEventMock: vi.fn(),
}));

vi.mock("./product_analytics", () => ({
  trackProductEvent: trackProductEventMock,
}));

import { seasonRouter } from "./routers/gameplay.router";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 77): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `weekly-action-${userId}`,
    email: `weekly${userId}@example.com`,
    name: "Weekly Action User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("season.markWeeklyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackProductEventMock.mockResolvedValue(undefined);
  });

  it("tracks weekly action mark event with metadata", async () => {
    const caller = seasonRouter.createCaller(createAuthContext(91));
    const result = await caller.markWeeklyAction({
      actionType: "daily",
      sourceCard: "season_v2_focus",
    });

    expect(result.success).toBe(true);
    expect(result.actionType).toBe("daily");
    expect(result.sourceCard).toBe("season_v2_focus");
    expect(result.dayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(trackProductEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 91,
        eventName: "season_weekly_action_marked",
        source: "season_page",
        metadata: expect.objectContaining({
          actionType: "daily",
          sourceCard: "season_v2_focus",
        }),
      }),
    );
  });

  it("accepts action marks without explicit source card", async () => {
    const caller = seasonRouter.createCaller(createAuthContext(92));
    const result = await caller.markWeeklyAction({
      actionType: "club_contribution",
    });

    expect(result.success).toBe(true);
    expect(result.sourceCard).toBeNull();
    expect(trackProductEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 92,
        eventName: "season_weekly_action_marked",
        metadata: expect.objectContaining({
          actionType: "club_contribution",
          sourceCard: null,
        }),
      }),
    );
  });
});

