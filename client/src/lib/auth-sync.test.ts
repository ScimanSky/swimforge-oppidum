import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setNativeSessionToken: vi.fn(async () => {}),
  registerPushToken: vi.fn(async () => {}),
}));
vi.mock("./session-token", () => ({ setNativeSessionToken: mocks.setNativeSessionToken }));
vi.mock("./push", () => ({ registerPushToken: mocks.registerPushToken }));
const platform = vi.hoisted(() => ({ native: false }));
vi.mock("./platform", () => ({ isNativePlatform: () => platform.native }));

import { postLoginPath, syncSupabaseSession } from "./auth-sync";

const session = (user: Record<string, unknown>) =>
  ({ access_token: "access", user: { id: "u1", email: "a@b.it", user_metadata: {}, ...user } }) as never;

describe("syncSupabaseSession", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls auth.syncSupabaseUser with the session user and stores the native token", async () => {
    const syncUser = vi.fn(async () => ({ isNewUser: true, sessionToken: "native-token" }));
    const result = await syncSupabaseSession(session({ user_metadata: { full_name: "Ada Lovelace" } }), syncUser);
    expect(syncUser).toHaveBeenCalledWith({
      accessToken: "access",
      user: { id: "u1", email: "a@b.it", name: "Ada Lovelace" },
    });
    expect(mocks.setNativeSessionToken).toHaveBeenCalledWith("native-token");
    expect(mocks.registerPushToken).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ isNewUser: true });
  });

  it("does not store anything on the web (no token in the response)", async () => {
    const syncUser = vi.fn(async () => ({ isNewUser: false }));
    await expect(syncSupabaseSession(session({}), syncUser)).resolves.toEqual({ isNewUser: false });
    expect(mocks.setNativeSessionToken).not.toHaveBeenCalled();
    expect(mocks.registerPushToken).not.toHaveBeenCalled();
  });

  it("uses metadata name, then the fallback, then null", async () => {
    const syncUser = vi.fn(async () => ({ isNewUser: false }));
    await syncSupabaseSession(session({ user_metadata: { name: "Ada" } }), syncUser);
    await syncSupabaseSession(session({ email: undefined }), syncUser, { email: "form@b.it", name: "Form Name" });
    await syncSupabaseSession(session({}), syncUser);
    expect(syncUser.mock.calls.map(([input]) => (input as { user: unknown }).user)).toEqual([
      { id: "u1", email: "a@b.it", name: "Ada" },
      { id: "u1", email: "form@b.it", name: "Form Name" },
      { id: "u1", email: "a@b.it", name: null },
    ]);
  });

  it("propagates server errors without storing a token", async () => {
    const syncUser = vi.fn(async () => {
      throw new Error("UNAUTHORIZED");
    });
    await expect(syncSupabaseSession(session({}), syncUser)).rejects.toThrow("UNAUTHORIZED");
    expect(mocks.setNativeSessionToken).not.toHaveBeenCalled();
  });
});

describe("postLoginPath", () => {
  beforeEach(() => {
    platform.native = false;
  });

  it("sends new users to the profile onboarding on both platforms", () => {
    expect(postLoginPath(true)).toBe("/settings?tab=profile&onboarding=1");
    platform.native = true;
    expect(postLoginPath(true)).toBe("/settings?tab=profile&onboarding=1");
  });

  it("sends returning users to the feed on the web", () => {
    expect(postLoginPath(false)).toBe("/home");
  });

  it("sends returning users to Oggi in the app", () => {
    platform.native = true;
    expect(postLoginPath(false)).toBe("/today");
  });
});
