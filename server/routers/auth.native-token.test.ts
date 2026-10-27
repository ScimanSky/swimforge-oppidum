import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  verifySupabaseAccessToken: vi.fn(),
  getUserByEmail: vi.fn(),
  updateUserLastSignedIn: vi.fn(),
  createSessionToken: vi.fn(),
  ensureRequiredLegalConsents: vi.fn(),
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
    },
    sdk: { createSessionToken: m.createSessionToken },
  };
});

vi.mock("../consent", async () => {
  const actual = await vi.importActual<typeof import("../consent")>("../consent");
  return { ...actual, ensureRequiredLegalConsents: m.ensureRequiredLegalConsents };
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
    m.ensureRequiredLegalConsents.mockResolvedValue(undefined);
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
});
