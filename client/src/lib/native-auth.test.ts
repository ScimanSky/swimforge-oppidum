import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  open: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  setNativeSessionToken: vi.fn(async () => {}),
}));

vi.mock("./supabase", () => ({
  supabase: { auth: { signInWithOAuth: mocks.signInWithOAuth, exchangeCodeForSession: mocks.exchangeCodeForSession } },
}));
vi.mock("@capacitor/browser", () => ({ Browser: { open: mocks.open, close: mocks.close } }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("./session-token", () => ({ setNativeSessionToken: mocks.setNativeSessionToken }));

import { completeNativeAuthCallback, startNativeGoogleLogin } from "./native-auth";

const session = { access_token: "access", user: { id: "u1", email: "a@b.it", user_metadata: { name: "Ada" } } };

beforeEach(() => vi.clearAllMocks());

describe("startNativeGoogleLogin", () => {
  it("asks Supabase for the URL without redirecting and opens it in the Custom Tab", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: "https://supabase.example/authorize" }, error: null });
    await startNativeGoogleLogin();
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "swimforge://auth/callback", skipBrowserRedirect: true },
    });
    expect(mocks.open).toHaveBeenCalledWith({ url: "https://supabase.example/authorize" });
  });

  it("throws without opening anything when Supabase fails", async () => {
    mocks.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error("boom") });
    await expect(startNativeGoogleLogin()).rejects.toThrow("boom");
    expect(mocks.open).not.toHaveBeenCalled();
  });
});

describe("completeNativeAuthCallback", () => {
  it("exchanges the code, syncs the session and goes home", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
    const syncUser = vi.fn(async () => ({ isNewUser: false, sessionToken: "native-token" }));
    const onSignedIn = vi.fn();
    await expect(completeNativeAuthCallback({ code: "abc", error: null }, { syncUser, onSignedIn })).resolves.toBe(true);
    expect(mocks.close).toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(syncUser).toHaveBeenCalledWith({ accessToken: "access", user: { id: "u1", email: "a@b.it", name: "Ada" } });
    expect(mocks.setNativeSessionToken).toHaveBeenCalledWith("native-token");
    expect(onSignedIn).toHaveBeenCalledWith("/home");
  });

  it("sends new users to the onboarding", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
    const onSignedIn = vi.fn();
    await completeNativeAuthCallback(
      { code: "abc", error: null },
      { syncUser: async () => ({ isNewUser: true }), onSignedIn },
    );
    expect(onSignedIn).toHaveBeenCalledWith("/settings?tab=profile&onboarding=1");
  });

  it("shows a toast for an OAuth error and does not exchange", async () => {
    const onSignedIn = vi.fn();
    await expect(
      completeNativeAuthCallback({ code: null, error: "access_denied" }, { syncUser: vi.fn(), onSignedIn }),
    ).resolves.toBe(false);
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it("shows a toast when the exchange fails and still works if Browser.close fails", async () => {
    mocks.close.mockRejectedValueOnce(new Error("not open"));
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new Error("PKCE code verifier not found") });
    const syncUser = vi.fn();
    const onSignedIn = vi.fn();
    await expect(completeNativeAuthCallback({ code: "abc", error: null }, { syncUser, onSignedIn })).resolves.toBe(false);
    expect(syncUser).not.toHaveBeenCalled();
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalled();
  });
});
