import { beforeEach, describe, expect, it, vi } from "vitest";

const d = vi.hoisted(() => ({
  upsertDeviceToken: vi.fn(),
  deleteDeviceToken: vi.fn(),
}));

vi.mock("../db_device_tokens", () => d);

import { pushRouter } from "./push.router";

const ctx = { user: { id: 42 } as any, req: { protocol: "https", headers: {} } as any, res: {} as any };
const token = "fcm-token-0123456789-abcdef";

describe("push router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("registers the token for the caller", async () => {
    d.upsertDeviceToken.mockResolvedValue(undefined);
    await expect(
      pushRouter.createCaller(ctx).register({ token, platform: "android", appVersion: "1.0.0" }),
    ).resolves.toEqual({ success: true });
    expect(d.upsertDeviceToken).toHaveBeenCalledWith(42, { token, platform: "android", appVersion: "1.0.0" });
  });

  it("rejects short tokens and unknown platforms", async () => {
    await expect(pushRouter.createCaller(ctx).register({ token: "short", platform: "android" })).rejects.toThrow();
    await expect(pushRouter.createCaller(ctx).register({ token, platform: "symbian" as any })).rejects.toThrow();
    expect(d.upsertDeviceToken).not.toHaveBeenCalled();
  });

  it("unregisters only the caller's token", async () => {
    d.deleteDeviceToken.mockResolvedValue(undefined);
    await expect(pushRouter.createCaller(ctx).unregister({ token })).resolves.toEqual({ success: true });
    expect(d.deleteDeviceToken).toHaveBeenCalledWith(42, token);
  });

  it("requires authentication", async () => {
    await expect(pushRouter.createCaller({ ...ctx, user: null }).register({ token, platform: "web" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
