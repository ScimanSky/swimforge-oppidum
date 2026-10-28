import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  calls: [] as string[],
  incrementSessionTokenVersion: vi.fn(),
  deleteUserDeviceTokens: vi.fn(),
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return {
    ...actual,
    db: { ...actual.db, incrementSessionTokenVersion: m.incrementSessionTokenVersion },
  };
});
vi.mock("../db_device_tokens", () => ({ deleteUserDeviceTokens: m.deleteUserDeviceTokens }));

import { authRouter } from "./auth.router";

const user = {
  id: 7,
  openId: "u7",
  email: "a@b.it",
  name: "A",
  loginMethod: "email",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("auth.logoutAllDevices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.calls.length = 0;
    m.incrementSessionTokenVersion.mockImplementation(async () => {
      m.calls.push("bump");
    });
    m.deleteUserDeviceTokens.mockImplementation(async () => {
      m.calls.push("purge");
    });
  });

  it("purges every device token of the user after invalidating the sessions", async () => {
    const clearCookie = vi.fn();
    const caller = authRouter.createCaller({
      user,
      req: { protocol: "https", headers: {} },
      res: { clearCookie },
    } as never);
    await expect(caller.logoutAllDevices()).resolves.toEqual({ success: true });
    expect(m.incrementSessionTokenVersion).toHaveBeenCalledWith(7);
    expect(m.deleteUserDeviceTokens).toHaveBeenCalledWith(7);
    expect(m.calls).toEqual(["bump", "purge"]);
    expect(clearCookie).toHaveBeenCalled();
  });
});
