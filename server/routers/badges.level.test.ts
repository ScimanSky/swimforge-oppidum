import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

// Badge XP adds to the total: the level follows at once (shared calculation, level_thresholds).

const m = vi.hoisted(() => ({
  db: {
    getSwimmerProfile: vi.fn(),
    getAllBadgeDefinitions: vi.fn(),
    hasUserBadge: vi.fn(async () => false),
    awardBadge: vi.fn(async () => undefined),
    createXpTransaction: vi.fn(async () => 1),
    updateSwimmerProfile: vi.fn(async () => undefined),
    getMaxSessionDistance: vi.fn(async () => 0),
    getUserBadges: vi.fn(async () => []),
  },
  healLevel: vi.fn(async () => 4),
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return { ...actual, db: m.db, invalidateLeaderboardCache: vi.fn(async () => undefined) };
});
vi.mock("../lib/levels", () => ({ healLevel: m.healLevel }));

import { badgesRouter, checkAndAwardBadges } from "./badges.router";

const profile = {
  userId: 42,
  totalXp: 1000,
  level: 2,
  totalDistanceMeters: 50_000,
  totalSessions: 3,
  totalTimeSeconds: 3600,
  totalOpenWaterSessions: 0,
  totalOpenWaterMeters: 0,
};
const badge = { id: 9, name: "Dieci chilometri", requirementType: "total_distance_km", requirementValue: 10, xpReward: 1500 };

const ctx = {
  user: { id: 42 } as TrpcContext["user"],
  req: { protocol: "https", headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
} as TrpcContext;

beforeEach(() => {
  vi.clearAllMocks();
  m.db.getSwimmerProfile.mockResolvedValue(profile);
  m.db.getAllBadgeDefinitions.mockResolvedValue([badge]);
});

describe("badge XP and the level", () => {
  it("checkAndAwardBadges: after adding the badge XP the level is recomputed", async () => {
    await checkAndAwardBadges(42);
    expect(m.db.updateSwimmerProfile).toHaveBeenCalledWith(42, { totalXp: 2500 });
    expect(m.healLevel).toHaveBeenCalledWith(42);
  });

  it("badges.recalculate: the same", async () => {
    await badgesRouter.createCaller(ctx).recalculate();
    expect(m.db.updateSwimmerProfile).toHaveBeenCalledWith(42, { totalXp: 2500 });
    expect(m.healLevel).toHaveBeenCalledWith(42);
  });

  it("no new badge: nothing to recompute", async () => {
    m.db.hasUserBadge.mockResolvedValue(true);
    m.db.getUserBadges.mockResolvedValue([{ badge: { id: 9 } }] as never);
    await checkAndAwardBadges(42);
    await badgesRouter.createCaller(ctx).recalculate();
    expect(m.healLevel).not.toHaveBeenCalled();
  });
});
