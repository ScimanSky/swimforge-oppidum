import { beforeEach, describe, expect, it, vi } from "vitest";

// Termini, Privacy and the age are recorded before any session exists: when recording fails there
// is no session cookie, no CSRF cookie and no native token.

const m = vi.hoisted(() => ({
  order: [] as string[],
  verifySupabaseAccessToken: vi.fn(),
  getUserByEmail: vi.fn(),
  updateUserLastSignedIn: vi.fn(),
  createSessionToken: vi.fn(),
  hasRequiredLegalConsents: vi.fn(),
  recordLegalAcceptance: vi.fn(),
  createOAuthUser: vi.fn(),
  registerUser: vi.fn(),
  deleteUserAccount: vi.fn(),
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return {
    ...actual,
    applyRateLimit: vi.fn(async () => {}),
    verifySupabaseAccessToken: m.verifySupabaseAccessToken,
    db: {
      ...actual.db,
      getUserByEmail: m.getUserByEmail,
      updateUserLastSignedIn: m.updateUserLastSignedIn,
      createOAuthUser: m.createOAuthUser,
      registerUser: m.registerUser,
      deleteUserAccount: m.deleteUserAccount,
    },
    sdk: { createSessionToken: m.createSessionToken },
  };
});

vi.mock("../consent", async () => {
  const actual = await vi.importActual<typeof import("../consent")>("../consent");
  return {
    ...actual,
    hasRequiredLegalConsents: m.hasRequiredLegalConsents,
    recordLegalAcceptance: m.recordLegalAcceptance,
  };
});

import { authRouter } from "./auth.router";

function ctx(headers: Record<string, string> = {}) {
  return {
    user: null,
    req: { protocol: "https", headers } as any,
    res: { cookie: vi.fn(() => m.order.push("cookie")) } as any,
  };
}

const acceptance = { terms: true, privacy: true, minimumAge: true } as const;
const syncInput = { accessToken: "sb-access", user: { id: "sb-1", email: "a@b.it", name: null } };

beforeEach(() => {
  vi.clearAllMocks();
  m.order.length = 0;
  m.verifySupabaseAccessToken.mockResolvedValue({ id: "sb-1", email: "a@b.it", app_metadata: { provider: "google" }, user_metadata: {} });
  m.getUserByEmail.mockResolvedValue(undefined);
  m.createOAuthUser.mockImplementation(async () => {
    m.order.push("create");
    return { success: true, user: { id: 8, email: "a@b.it", name: null, sessionTokenVersion: 1 } };
  });
  m.registerUser.mockImplementation(async () => {
    m.order.push("create");
    return { success: true, user: { id: 8, email: "a@b.it", name: "a", sessionTokenVersion: 1 } };
  });
  m.createSessionToken.mockImplementation(async () => {
    m.order.push("session");
    return "jwt-token";
  });
  m.hasRequiredLegalConsents.mockResolvedValue(false);
  m.recordLegalAcceptance.mockImplementation(async () => {
    m.order.push("record");
  });
  m.deleteUserAccount.mockResolvedValue({ id: 8 });
});

describe("auth.syncSupabaseUser", () => {
  it("records the acceptance right after creating the account, before the session", async () => {
    const result = await authRouter.createCaller(ctx({ "x-swimforge-client": "native" })).syncSupabaseUser({
      ...syncInput,
      legalAcceptance: acceptance,
    });
    expect(result).toMatchObject({ success: true, sessionToken: "jwt-token" });
    expect(m.order).toEqual(["create", "record", "session", "cookie", "cookie"]);
  });

  it("record fails → no Set-Cookie, no native token", async () => {
    m.recordLegalAcceptance.mockRejectedValue(new Error("connection reset"));
    const c = ctx({ "x-swimforge-client": "native" });
    await expect(
      authRouter.createCaller(c).syncSupabaseUser({ ...syncInput, legalAcceptance: acceptance }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(c.res.cookie).not.toHaveBeenCalled();
    expect(m.createSessionToken).not.toHaveBeenCalled();
  });

  it("record fails for an existing account that had not accepted → no session either", async () => {
    m.getUserByEmail.mockResolvedValue({ id: 5, email: "a@b.it", name: "A", sessionTokenVersion: 1 });
    m.recordLegalAcceptance.mockRejectedValue(new Error("connection reset"));
    const c = ctx();
    await expect(
      authRouter.createCaller(c).syncSupabaseUser({ ...syncInput, legalAcceptance: acceptance }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(c.res.cookie).not.toHaveBeenCalled();
    expect(m.createSessionToken).not.toHaveBeenCalled();
  });
});

describe("auth.register", () => {
  const registerInput = { email: "a@b.it", password: "Abcdefgh123!", legalAcceptance: acceptance };

  it("records the acceptance before the session", async () => {
    await authRouter.createCaller(ctx()).register(registerInput);
    expect(m.order).toEqual(["create", "record", "session", "cookie", "cookie"]);
  });

  it("record fails → no Set-Cookie, and the account without acceptance is removed", async () => {
    m.recordLegalAcceptance.mockRejectedValue(new Error("connection reset"));
    const c = ctx();
    await expect(authRouter.createCaller(c).register(registerInput)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(c.res.cookie).not.toHaveBeenCalled();
    expect(m.createSessionToken).not.toHaveBeenCalled();
    expect(m.deleteUserAccount).toHaveBeenCalledWith(8);
  });
});
