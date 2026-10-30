import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  db: {
    getSwimmerProfile: vi.fn(),
    getNextLevelThreshold: vi.fn(),
    getLevelThreshold: vi.fn(),
  },
  getUserPublicProfile: vi.fn(),
  levelForXp: vi.fn(),
  healLevel: vi.fn(),
}));

vi.mock("../lib/levels", () => ({ levelForXp: m.levelForXp, healLevel: m.healLevel }));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return { ...actual, db: m.db, getUserPublicProfile: m.getUserPublicProfile };
});

vi.mock("../db_profile_badges", async () => {
  const actual = await vi.importActual<typeof import("../db_profile_badges")>("../db_profile_badges");
  return {
    ...actual,
    getUserProfileBadge: vi.fn().mockResolvedValue({ id: 1 }),
    updateUserProfileBadge: vi.fn(),
    updateUserProfileBadgeByLevel: vi.fn(),
  };
});

import { profileRouter } from "./profile.router";

const ctx = {
  user: { id: 42 } as any,
  req: { protocol: "https", headers: {} } as any,
  res: {} as any,
};

describe("profile.get: soglie del livello", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.db.getSwimmerProfile.mockResolvedValue({
      userId: 42,
      level: 12,
      totalXp: 8420,
      notificationSettings: {},
    });
    m.levelForXp.mockResolvedValue(12);
    m.healLevel.mockResolvedValue(null);
    m.getUserPublicProfile.mockResolvedValue({ followerCount: 3, followingCount: 4 });
  });

  it("restituisce gli XP di inizio del livello attuale", async () => {
    m.db.getLevelThreshold.mockResolvedValue({ level: 12, xpRequired: 8000, title: "Delfino", color: "#000000" });
    m.db.getNextLevelThreshold.mockResolvedValue({ level: 13, xpRequired: 9000 });
    const profile = await profileRouter.createCaller(ctx).get();
    expect(m.levelForXp).toHaveBeenCalledWith(8420);
    expect(m.db.getLevelThreshold).toHaveBeenCalledWith(12);
    expect(m.healLevel).not.toHaveBeenCalled();
    expect(profile.level).toBe(12);
    expect(profile.levelTitle).toBe("Delfino");
    expect(profile.currentLevelXp).toBe(8000);
    expect(profile.nextLevelXp).toBe(9000);
    expect(profile.xpToNextLevel).toBe(580);
  });

  it("usa 0 se la soglia del livello attuale manca", async () => {
    m.db.getLevelThreshold.mockResolvedValue(undefined);
    m.db.getNextLevelThreshold.mockResolvedValue(undefined);
    const profile = await profileRouter.createCaller(ctx).get();
    expect(profile.currentLevelXp).toBe(0);
    expect(profile.nextLevelXp).toBeNull();
  });

  it("un livello salvato che non torna con gli XP totali si ricalcola e si salva (auto-riparazione)", async () => {
    // 8420 XP are level 10 in the thresholds, the stored 12 came from an old table.
    m.levelForXp.mockResolvedValue(10);
    m.healLevel.mockResolvedValue(10);
    m.db.getLevelThreshold.mockResolvedValue({ level: 10, xpRequired: 7700, title: "Elite", color: "#1d4ed8" });
    m.db.getNextLevelThreshold.mockResolvedValue({ level: 11, xpRequired: 9600 });
    const profile = await profileRouter.createCaller(ctx).get();
    expect(m.healLevel).toHaveBeenCalledWith(42);
    expect(m.db.getLevelThreshold).toHaveBeenCalledWith(10);
    expect(m.db.getNextLevelThreshold).toHaveBeenCalledWith(10);
    expect(profile).toMatchObject({
      level: 10,
      xpLevel: 10,
      levelTitle: "Elite",
      currentLevelXp: 7700,
      nextLevelXp: 9600,
      xpToNextLevel: 1180,
    });
  });
});
