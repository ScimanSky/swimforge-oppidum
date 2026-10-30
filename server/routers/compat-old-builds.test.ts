import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

// Old Android builds stay installed: they still call procedures the server no longer needs.
// These stubs answer them without touching the database (compat: remove after 2027-01-31).

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: vi.fn(async () => {
    throw new Error("no database access expected");
  }),
}));

import { appRouter } from "./index";

function ctx(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "old-build",
      email: "old@example.com",
      name: "Old Build",
      loginMethod: "email",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("compatibility with old Android builds", () => {
  it("strava.status: not connected, so «Account collegati» shows no error", async () => {
    await expect(appRouter.createCaller(ctx()).strava.status()).resolves.toEqual({ connected: false, lastSync: null });
  });

  it("auth.heartbeat: ok, nothing stored (online presence is gone; this app never calls it)", async () => {
    await expect(appRouter.createCaller(ctx()).auth.heartbeat()).resolves.toEqual({ ok: true });
  });

  it("both still need a signed-in user", async () => {
    const anonymous = appRouter.createCaller({ ...ctx(), user: null });
    await expect(anonymous.strava.status()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.auth.heartbeat()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
