import { beforeEach, describe, expect, it, vi } from "vitest";

// syncSupabaseUser finds the account by email. When that row belongs to another identity (open_id
// null from the removed local registration, a Manus id, an older Supabase user), it is bound to the
// Supabase user that just proved the email, every session issued before for it is revoked and an
// unusable local password is dropped, all before the new session exists.

const m = vi.hoisted(() => ({
  order: [] as string[],
  verifySupabaseAccessToken: vi.fn(),
  getUserByEmail: vi.fn(),
  updateUserLastSignedIn: vi.fn(),
  relinkUserToSupabaseIdentity: vi.fn(),
  createSessionToken: vi.fn(),
  hasRequiredLegalConsents: vi.fn(),
  recordLegalAcceptance: vi.fn(),
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
      relinkUserToSupabaseIdentity: m.relinkUserToSupabaseIdentity,
    },
    sdk: { createSessionToken: m.createSessionToken },
  };
});
vi.mock("../consent", async () => {
  const actual = await vi.importActual<typeof import("../consent")>("../consent");
  return { ...actual, hasRequiredLegalConsents: m.hasRequiredLegalConsents, recordLegalAcceptance: m.recordLegalAcceptance };
});

import { authRouter } from "./auth.router";

const SUPABASE_ID = "3f0c1d9e-6a4b-4c2d-9e8f-1a2b3c4d5e6f";
const input = { accessToken: "sb-access", user: { id: SUPABASE_ID, email: "a@b.it", name: null } };

function ctx() {
  return {
    user: null,
    req: { protocol: "https", headers: { "x-swimforge-client": "native" } } as any,
    res: { cookie: vi.fn(() => m.order.push("cookie")) } as any,
  };
}

const row = (overrides: Record<string, unknown>) => ({
  id: 5,
  email: "a@b.it",
  name: "A",
  openId: SUPABASE_ID,
  passwordHash: null,
  sessionTokenVersion: 3,
  ...overrides,
});

describe("auth.syncSupabaseUser binds the row to the Supabase identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.order.length = 0;
    m.verifySupabaseAccessToken.mockResolvedValue({ id: SUPABASE_ID, email: "a@b.it", app_metadata: { provider: "google" }, user_metadata: {} });
    m.hasRequiredLegalConsents.mockResolvedValue(true);
    m.updateUserLastSignedIn.mockResolvedValue(undefined);
    m.relinkUserToSupabaseIdentity.mockImplementation(async () => {
      m.order.push("relink");
      return 4;
    });
    m.createSessionToken.mockImplementation(async (_id: string, options: { tokenVersion: number }) => {
      m.order.push(`session:v${options.tokenVersion}`);
      return "jwt-token";
    });
  });

  it.each([
    ["a local password row (removed auth.register)", { openId: null, passwordHash: "$2a$10$attacker" }],
    ["a Manus id", { openId: "manus-123" }],
    ["another Supabase user", { openId: "11111111-2222-4333-8444-555555555555" }],
  ])("%s: relinked and earlier sessions revoked before the new token", async (_label, overrides) => {
    m.getUserByEmail.mockResolvedValue(row(overrides));
    const result = await authRouter.createCaller(ctx()).syncSupabaseUser(input);
    expect(m.relinkUserToSupabaseIdentity).toHaveBeenCalledWith(5, SUPABASE_ID);
    // The new session carries the new version: every token issued before for the row is dead.
    expect(m.order).toEqual(["relink", "session:v4", "cookie", "cookie"]);
    expect(result).toMatchObject({ success: true, sessionToken: "jwt-token" });
  });

  it("the row already bound to this Supabase user: nothing changes, nobody is logged out", async () => {
    m.getUserByEmail.mockResolvedValue(row({}));
    await authRouter.createCaller(ctx()).syncSupabaseUser(input);
    expect(m.relinkUserToSupabaseIdentity).not.toHaveBeenCalled();
    expect(m.order).toEqual(["session:v3", "cookie", "cookie"]);
  });

  it("relink fails → no session, no cookie", async () => {
    m.getUserByEmail.mockResolvedValue(row({ openId: null }));
    m.relinkUserToSupabaseIdentity.mockRejectedValue(new Error("connection reset"));
    const c = ctx();
    await expect(authRouter.createCaller(c).syncSupabaseUser(input)).rejects.toThrow();
    expect(m.createSessionToken).not.toHaveBeenCalled();
    expect(c.res.cookie).not.toHaveBeenCalled();
  });

  it("the Supabase id already belongs to another row → CONFLICT, no session", async () => {
    m.getUserByEmail.mockResolvedValue(row({ openId: null }));
    m.relinkUserToSupabaseIdentity.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));
    const c = ctx();
    await expect(authRouter.createCaller(c).syncSupabaseUser(input)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(c.res.cookie).not.toHaveBeenCalled();
  });
});
