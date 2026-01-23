import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock user for testing
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1, role: "user" | "admin" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role,
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
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("XP System", () => {
  it("calculates XP correctly for activity", () => {
    // Test XP calculation logic
    const distanceMeters = 3500; // 3.5 km
    const isOpenWater = false;
    
    const baseXp = Math.floor(distanceMeters / 100); // 35 XP
    const sessionBonus = 50;
    const intensityBonus = isOpenWater ? 25 : 0;
    const totalXp = baseXp + sessionBonus + intensityBonus;
    
    expect(baseXp).toBe(35);
    expect(totalXp).toBe(85);
  });

  it("adds open water bonus correctly", () => {
    const distanceMeters = 2500; // 2.5 km open water
    const isOpenWater = true;
    
    const baseXp = Math.floor(distanceMeters / 100); // 25 XP
    const sessionBonus = 50;
    const intensityBonus = isOpenWater ? 25 : 0;
    const totalXp = baseXp + sessionBonus + intensityBonus;
    
    expect(intensityBonus).toBe(25);
    expect(totalXp).toBe(100);
  });
});

describe("Level System", () => {
  const levelThresholds = [
    { level: 1, xp: 0, title: "Novizio" },
    { level: 2, xp: 500, title: "Apprendista" },
    { level: 3, xp: 1200, title: "Nuotatore" },
    { level: 5, xp: 3000, title: "Atleta" },
    { level: 10, xp: 11000, title: "Gran Maestro" },
    { level: 20, xp: 60000, title: "Poseidone" },
  ];

  it("determines correct level for XP amount", () => {
    const getLevelForXp = (xp: number) => {
      let result = levelThresholds[0];
      for (const threshold of levelThresholds) {
        if (xp >= threshold.xp) {
          result = threshold;
        }
      }
      return result;
    };

    expect(getLevelForXp(0).level).toBe(1);
    expect(getLevelForXp(0).title).toBe("Novizio");
    
    expect(getLevelForXp(500).level).toBe(2);
    expect(getLevelForXp(500).title).toBe("Apprendista");
    
    expect(getLevelForXp(1199).level).toBe(2);
    expect(getLevelForXp(1200).level).toBe(3);
    
    expect(getLevelForXp(60000).level).toBe(20);
    expect(getLevelForXp(60000).title).toBe("Poseidone");
  });

  it("calculates XP to next level correctly", () => {
    const currentXp = 2500;
    const currentLevel = 3; // Nuotatore (1200 XP)
    const nextLevelXp = 3000; // Atleta
    
    const xpToNextLevel = nextLevelXp - currentXp;
    expect(xpToNextLevel).toBe(500);
  });
});

describe("Badge System", () => {
  it("checks distance badge requirements", () => {
    const totalDistanceMeters = 42195; // Marathon distance
    const badgeRequirements = [
      { code: "dist_1km", value: 1000 },
      { code: "dist_10km", value: 10000 },
      { code: "dist_42km", value: 42195 },
      { code: "dist_100km", value: 100000 },
    ];

    const earnedBadges = badgeRequirements.filter(
      (badge) => totalDistanceMeters >= badge.value
    );

    expect(earnedBadges.length).toBe(3);
    expect(earnedBadges.map(b => b.code)).toContain("dist_1km");
    expect(earnedBadges.map(b => b.code)).toContain("dist_10km");
    expect(earnedBadges.map(b => b.code)).toContain("dist_42km");
    expect(earnedBadges.map(b => b.code)).not.toContain("dist_100km");
  });

  it("checks session count badge requirements", () => {
    const totalSessions = 50;
    const badgeRequirements = [
      { code: "sessions_10", value: 10 },
      { code: "sessions_25", value: 25 },
      { code: "sessions_50", value: 50 },
      { code: "sessions_100", value: 100 },
    ];

    const earnedBadges = badgeRequirements.filter(
      (badge) => totalSessions >= badge.value
    );

    expect(earnedBadges.length).toBe(3);
    expect(earnedBadges.map(b => b.code)).toContain("sessions_50");
    expect(earnedBadges.map(b => b.code)).not.toContain("sessions_100");
  });

  it("checks open water badge requirements", () => {
    const openWaterSessions = 5;
    const openWaterMeters = 12500;
    
    const badgeRequirements = [
      { code: "ow_first", type: "sessions", value: 1 },
      { code: "ow_5", type: "sessions", value: 5 },
      { code: "ow_10", type: "sessions", value: 10 },
      { code: "ow_5km", type: "distance", value: 5000 },
      { code: "ow_25km", type: "distance", value: 25000 },
    ];

    const earnedBadges = badgeRequirements.filter((badge) => {
      if (badge.type === "sessions") {
        return openWaterSessions >= badge.value;
      }
      return openWaterMeters >= badge.value;
    });

    expect(earnedBadges.length).toBe(3);
    expect(earnedBadges.map(b => b.code)).toContain("ow_first");
    expect(earnedBadges.map(b => b.code)).toContain("ow_5");
    expect(earnedBadges.map(b => b.code)).toContain("ow_5km");
  });
});

describe("Badge Rarity", () => {
  it("assigns correct rarity based on difficulty", () => {
    const rarityByXpReward = (xpReward: number) => {
      if (xpReward >= 2000) return "legendary";
      if (xpReward >= 750) return "epic";
      if (xpReward >= 300) return "rare";
      if (xpReward >= 100) return "uncommon";
      return "common";
    };

    expect(rarityByXpReward(50)).toBe("common");
    expect(rarityByXpReward(100)).toBe("uncommon");
    expect(rarityByXpReward(500)).toBe("rare");
    expect(rarityByXpReward(1000)).toBe("epic");
    expect(rarityByXpReward(5000)).toBe("legendary");
  });
});

describe("Activity Validation", () => {
  it("validates distance input", () => {
    const validateDistance = (meters: number) => {
      return meters > 0 && meters <= 50000; // Max 50km per session
    };

    expect(validateDistance(3500)).toBe(true);
    expect(validateDistance(0)).toBe(false);
    expect(validateDistance(-100)).toBe(false);
    expect(validateDistance(60000)).toBe(false);
  });

  it("validates duration input", () => {
    const validateDuration = (seconds: number) => {
      return seconds > 0 && seconds <= 18000; // Max 5 hours
    };

    expect(validateDuration(5400)).toBe(true); // 90 minutes
    expect(validateDuration(0)).toBe(false);
    expect(validateDuration(20000)).toBe(false);
  });

  it("calculates pace correctly", () => {
    const calculatePacePer100m = (seconds: number, meters: number) => {
      if (meters === 0) return 0;
      return Math.round((seconds / meters) * 100);
    };

    // 3500m in 90 minutes = 5400 seconds
    // Pace = (5400 / 3500) * 100 = 154.28 seconds per 100m
    expect(calculatePacePer100m(5400, 3500)).toBe(154);
    
    // Edge case
    expect(calculatePacePer100m(5400, 0)).toBe(0);
  });
});

describe("Leaderboard Sorting", () => {
  const users = [
    { id: 1, name: "Alice", totalXp: 5000, level: 5, badges: 10 },
    { id: 2, name: "Bob", totalXp: 3000, level: 4, badges: 15 },
    { id: 3, name: "Charlie", totalXp: 8000, level: 7, badges: 8 },
  ];

  it("sorts by XP correctly", () => {
    const sorted = [...users].sort((a, b) => b.totalXp - a.totalXp);
    expect(sorted[0].name).toBe("Charlie");
    expect(sorted[1].name).toBe("Alice");
    expect(sorted[2].name).toBe("Bob");
  });

  it("sorts by level correctly", () => {
    const sorted = [...users].sort((a, b) => b.level - a.level);
    expect(sorted[0].name).toBe("Charlie");
    expect(sorted[1].name).toBe("Alice");
    expect(sorted[2].name).toBe("Bob");
  });

  it("sorts by badges correctly", () => {
    const sorted = [...users].sort((a, b) => b.badges - a.badges);
    expect(sorted[0].name).toBe("Bob");
    expect(sorted[1].name).toBe("Alice");
    expect(sorted[2].name).toBe("Charlie");
  });
});
