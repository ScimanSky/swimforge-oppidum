import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const { setActivityShareMock, invalidateUserCacheMock } = vi.hoisted(() => ({
  setActivityShareMock: vi.fn(),
  invalidateUserCacheMock: vi.fn(),
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return {
    ...actual,
    setActivityShare: setActivityShareMock,
    invalidateUserCache: invalidateUserCacheMock,
  };
});

import { communityRouter } from "./community.router";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 42,
    openId: "toggle-share-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("community.toggleShare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivityShareMock.mockResolvedValue(undefined);
    invalidateUserCacheMock.mockResolvedValue(undefined);
  });

  it("updates share flag and invalidates user cache", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    const result = await caller.toggleShare({
      activityId: 123,
      share: true,
    });

    expect(result).toEqual({ success: true });
    expect(setActivityShareMock).toHaveBeenCalledTimes(1);
    expect(setActivityShareMock).toHaveBeenCalledWith(42, 123, true);
    expect(invalidateUserCacheMock).toHaveBeenCalledTimes(1);
    expect(invalidateUserCacheMock).toHaveBeenCalledWith("42");
  });

  it("supports disabling share flag", async () => {
    const caller = communityRouter.createCaller(createAuthContext());

    await caller.toggleShare({
      activityId: 555,
      share: false,
    });

    expect(setActivityShareMock).toHaveBeenCalledWith(42, 555, false);
  });

  it("propagates setActivityShare errors", async () => {
    const caller = communityRouter.createCaller(createAuthContext());
    setActivityShareMock.mockRejectedValue(new Error("db write failed"));

    await expect(
      caller.toggleShare({
        activityId: 321,
        share: true,
      })
    ).rejects.toThrow("db write failed");
    expect(invalidateUserCacheMock).not.toHaveBeenCalled();
  });
});
