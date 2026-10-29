import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  db: {
    getSwimmerProfile: vi.fn(),
    updateSwimmerProfile: vi.fn(),
    updateUser: vi.fn(),
    getUserByEmail: vi.fn(),
  },
  mergeSwimmerPreferences: vi.fn(async () => true),
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return { ...actual, db: m.db };
});
vi.mock("../lib/preferences", async () => {
  const actual = await vi.importActual<typeof import("../lib/preferences")>("../lib/preferences");
  return { ...actual, mergeSwimmerPreferences: m.mergeSwimmerPreferences };
});

import { profileRouter } from "./profile.router";

const ctx = { user: { id: 42, name: "Ada", email: "ada@example.com" } as any, req: { protocol: "https", headers: {} } as any, res: {} as any };

describe("profile.update preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("merges the Settings preferences into the stored ones in SQL, without reading them first", async () => {
    await profileRouter.createCaller(ctx).update({ preferences: { units: "imperial", autoplayVideos: false } });
    expect(m.mergeSwimmerPreferences).toHaveBeenCalledWith(42, { units: "imperial", autoplayVideos: false });
    expect(m.db.getSwimmerProfile).not.toHaveBeenCalled();
    expect(m.db.updateSwimmerProfile.mock.calls[0][1]).not.toHaveProperty("preferences");
  });

  it("keys sent as undefined are left as stored, not deleted", async () => {
    await profileRouter.createCaller(ctx).update({ preferences: { units: "metric", language: undefined } });
    const [, patch] = m.mergeSwimmerPreferences.mock.calls[0] as unknown as [number, Record<string, unknown>];
    expect(patch).toEqual({ units: "metric" });
    expect("language" in patch).toBe(false);
  });

  it("does not touch the preferences when none are sent", async () => {
    await profileRouter.createCaller(ctx).update({ bio: "ciao" });
    expect(m.mergeSwimmerPreferences).not.toHaveBeenCalled();
    expect(m.db.updateSwimmerProfile).toHaveBeenCalledWith(42, expect.objectContaining({ bio: "ciao" }));
  });

  it("a cssTest sent through the profile is ignored (it has its own procedure)", async () => {
    await profileRouter.createCaller(ctx).update({ preferences: { units: "metric", cssTest: { t200Seconds: 1 } } as any });
    const [, patch] = m.mergeSwimmerPreferences.mock.calls[0] as unknown as [number, Record<string, unknown>];
    expect(patch).toEqual({ units: "metric" });
  });
});
