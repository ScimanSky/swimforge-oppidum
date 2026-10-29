import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  db: {
    getSwimmerProfile: vi.fn(),
    updateSwimmerProfile: vi.fn(),
    updateUser: vi.fn(),
    getUserByEmail: vi.fn(),
  },
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return { ...actual, db: m.db };
});

import { profileRouter } from "./profile.router";

const ctx = { user: { id: 42, name: "Ada", email: "ada@example.com" } as any, req: { protocol: "https", headers: {} } as any, res: {} as any };
const cssTest = { t200Seconds: 170, t400Seconds: 360, date: "2026-10-20" };

describe("profile.update preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.db.getSwimmerProfile.mockResolvedValue({ userId: 42, preferences: { units: "metric", cssTest } });
  });

  it("merges the Settings preferences into the stored ones, keeping the CSS test", async () => {
    await profileRouter.createCaller(ctx).update({ preferences: { units: "imperial", autoplayVideos: false } });
    expect(m.db.updateSwimmerProfile).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ preferences: { units: "imperial", autoplayVideos: false, cssTest } }),
    );
  });

  it("does not touch the preferences when none are sent", async () => {
    await profileRouter.createCaller(ctx).update({ bio: "ciao" });
    expect(m.db.getSwimmerProfile).not.toHaveBeenCalled();
    expect(m.db.updateSwimmerProfile).toHaveBeenCalledWith(42, expect.objectContaining({ bio: "ciao", preferences: undefined }));
  });

  it("a cssTest sent through the profile is ignored (it has its own procedure)", async () => {
    await profileRouter.createCaller(ctx).update({ preferences: { units: "metric", cssTest: { t200Seconds: 1 } } as any });
    const saved = m.db.updateSwimmerProfile.mock.calls[0][1].preferences;
    expect(saved.cssTest).toEqual(cssTest);
  });
});
