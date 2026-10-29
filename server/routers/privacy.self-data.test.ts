import { beforeEach, describe, expect, it, vi } from "vitest";

// Responses about the caller themself (auth.me, profile.get) must not carry
// secrets: password hash, session token version, encrypted Garmin tokens.

const m = vi.hoisted(() => ({
  getSwimmerProfile: vi.fn(),
  getNextLevelThreshold: vi.fn(),
  getLevelForXp: vi.fn(),
  getUserPublicProfile: vi.fn(),
  getUserProfileBadge: vi.fn(),
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return {
    ...actual,
    getUserPublicProfile: m.getUserPublicProfile,
    db: {
      ...actual.db,
      getSwimmerProfile: m.getSwimmerProfile,
      getNextLevelThreshold: m.getNextLevelThreshold,
      getLevelForXp: m.getLevelForXp,
    },
  };
});

vi.mock("../db_profile_badges", async () => {
  const actual = await vi.importActual<typeof import("../db_profile_badges")>("../db_profile_badges");
  return {
    ...actual,
    getUserProfileBadge: m.getUserProfileBadge,
    updateUserProfileBadge: vi.fn(),
    updateUserProfileBadgeByLevel: vi.fn(),
  };
});

import { authRouter } from "./auth.router";
import { profileRouter } from "./profile.router";

const fullUserRow = () => ({
  id: 5,
  openId: "open-5",
  name: "Ada",
  email: "ada@example.com",
  passwordHash: "$2b$12$secret-hash",
  loginMethod: "email",
  role: "user" as const,
  sessionTokenVersion: 7,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  lastSignedIn: new Date("2026-01-03T00:00:00Z"),
});

function ctx(user: unknown) {
  return { user, req: { protocol: "https", headers: {} } as any, res: { cookie: vi.fn() } as any } as any;
}

describe("auth.me", () => {
  it("returns null for signed-out callers", async () => {
    expect(await authRouter.createCaller(ctx(null)).me()).toBeNull();
  });

  it("returns the caller without password hash or session token version", async () => {
    const me: any = await authRouter.createCaller(ctx(fullUserRow())).me();
    expect(me).not.toHaveProperty("passwordHash");
    expect(me).not.toHaveProperty("sessionTokenVersion");
    expect(JSON.stringify(me)).not.toContain("secret-hash");
    // What the client reads (useAuth, app shell, settings, onboarding, admin).
    expect(me).toMatchObject({ id: 5, name: "Ada", email: "ada@example.com", role: "user" });
    expect(Object.keys(me).sort()).toEqual(
      ["createdAt", "email", "id", "lastSignedIn", "loginMethod", "name", "openId", "role", "updatedAt"],
    );
  });
});

describe("profile.get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getSwimmerProfile.mockResolvedValue({
      id: 1,
      userId: 5,
      username: "ada",
      level: 3,
      totalXp: 1200,
      aiSkillLevel: null,
      garminConnected: true,
      garminTokenEncrypted: "enc:garmin-oauth-secret",
      notificationSettings: { push: "true" },
      preferences: { units: "metric" },
      privacySettings: { profilePublic: false },
    });
    m.getNextLevelThreshold.mockResolvedValue({ xpRequired: 2000 });
    m.getLevelForXp.mockResolvedValue({ title: "Delfino", color: "#34C6EB" });
    m.getUserProfileBadge.mockResolvedValue({ id: 2 });
    m.getUserPublicProfile.mockResolvedValue({ followerCount: 4, followingCount: 6, profilePublic: false });
  });

  it("omits the encrypted Garmin token but keeps the caller's own settings", async () => {
    const profile: any = await profileRouter.createCaller(ctx(fullUserRow())).get();
    expect(profile).not.toHaveProperty("garminTokenEncrypted");
    expect(JSON.stringify(profile)).not.toContain("garmin-oauth-secret");
    expect(profile.garminConnected).toBe(true);
    // Settings reads the owner's own privacy/preferences from profile.get.
    expect(profile.privacySettings).toEqual({ profilePublic: false });
    expect(profile.preferences).toEqual({ units: "metric" });
    expect(profile.notificationSettings).toEqual({ push: true });
    expect(profile).toMatchObject({ userId: 5, followerCount: 4, followingCount: 6, xpToNextLevel: 800 });
  });
});
