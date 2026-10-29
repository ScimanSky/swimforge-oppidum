import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  verifySupabaseAccessToken: vi.fn(),
  getUserByEmail: vi.fn(),
  updateUserLastSignedIn: vi.fn(),
  createSessionToken: vi.fn(),
  hasRequiredLegalConsents: vi.fn(),
  recordLegalAcceptance: vi.fn(),
  createOAuthUser: vi.fn(),
}));

vi.mock("./_shared", async () => {
  const actual = await vi.importActual<typeof import("./_shared")>("./_shared");
  return {
    ...actual,
    verifySupabaseAccessToken: m.verifySupabaseAccessToken,
    db: {
      ...actual.db,
      getUserByEmail: m.getUserByEmail,
      updateUserLastSignedIn: m.updateUserLastSignedIn,
      createOAuthUser: m.createOAuthUser,
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

function ctx(headers: Record<string, string>) {
  return { user: null, req: { protocol: "https", headers } as any, res: { cookie: vi.fn() } as any };
}

describe("auth.syncSupabaseUser native token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.verifySupabaseAccessToken.mockResolvedValue({ id: "sb-1", email: "a@b.it", app_metadata: { provider: "email" }, user_metadata: {} });
    m.getUserByEmail.mockResolvedValue({ id: 5, email: "a@b.it", name: "A", sessionTokenVersion: 1 });
    m.updateUserLastSignedIn.mockResolvedValue(undefined);
    m.createSessionToken.mockResolvedValue("jwt-token");
    m.hasRequiredLegalConsents.mockResolvedValue(true);
    m.recordLegalAcceptance.mockResolvedValue(undefined);
  });
  const input = { accessToken: "sb-access", user: { id: "sb-1", email: "a@b.it", name: null } };

  it("omits the token for web clients", async () => {
    const result = await authRouter.createCaller(ctx({})).syncSupabaseUser(input);
    expect(result).not.toHaveProperty("sessionToken");
  });

  it("returns the token for native clients", async () => {
    const result = await authRouter.createCaller(ctx({ "x-swimforge-client": "native" })).syncSupabaseUser(input);
    expect(result.sessionToken).toBe("jwt-token");
  });

  describe("Termini, Privacy and age acceptance", () => {
    const acceptance = { terms: true, privacy: true, minimumAge: true } as const;

    it("a new Google user without the checkboxes: no account, no session, no consent recorded", async () => {
      m.getUserByEmail.mockResolvedValue(undefined);
      const c = ctx({ "x-swimforge-client": "native" });
      const result = await authRouter.createCaller(c).syncSupabaseUser(input);
      expect(result).toEqual({ success: false, needsLegalAcceptance: true, isNewUser: true });
      expect(m.createOAuthUser).not.toHaveBeenCalled();
      expect(m.createSessionToken).not.toHaveBeenCalled();
      expect(c.res.cookie).not.toHaveBeenCalled();
      expect(m.recordLegalAcceptance).not.toHaveBeenCalled();
    });

    it("a new Google user with the checkboxes: account, consents recorded, session", async () => {
      m.getUserByEmail.mockResolvedValue(undefined);
      m.createOAuthUser.mockResolvedValue({ success: true, user: { id: 8, email: "a@b.it", name: null, sessionTokenVersion: 1 } });
      const result = await authRouter.createCaller(ctx({ "x-swimforge-client": "native" })).syncSupabaseUser({
        ...input,
        legalAcceptance: acceptance,
      });
      expect(result).toMatchObject({ success: true, isNewUser: true, sessionToken: "jwt-token" });
      expect(m.recordLegalAcceptance).toHaveBeenCalledWith(8, expect.anything());
    });

    it("an existing user who already accepted is not asked again and nothing is re-recorded", async () => {
      const result = await authRouter.createCaller(ctx({})).syncSupabaseUser(input);
      expect(result).toMatchObject({ success: true, isNewUser: false });
      expect(m.hasRequiredLegalConsents).toHaveBeenCalledWith(5);
      expect(m.recordLegalAcceptance).not.toHaveBeenCalled();
    });

    it("an existing account that never accepted is asked, like a new one", async () => {
      m.hasRequiredLegalConsents.mockResolvedValue(false);
      const result = await authRouter.createCaller(ctx({})).syncSupabaseUser(input);
      expect(result).toEqual({ success: false, needsLegalAcceptance: true, isNewUser: false });
      expect(m.createSessionToken).not.toHaveBeenCalled();
    });

    it("refuses an acceptance without the age confirmation", async () => {
      m.getUserByEmail.mockResolvedValue(undefined);
      await expect(
        authRouter.createCaller(ctx({})).syncSupabaseUser({
          ...input,
          legalAcceptance: { terms: true, privacy: true, minimumAge: false } as any,
        }),
      ).rejects.toThrow();
      expect(m.createOAuthUser).not.toHaveBeenCalled();
    });
  });
});
