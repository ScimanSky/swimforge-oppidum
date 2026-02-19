import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME, CSRF_COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears session and csrf cookies and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(2);

    const sessionCookie = clearedCookies.find((cookie) => cookie.name === COOKIE_NAME);
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie?.options).not.toHaveProperty("maxAge");
    expect(sessionCookie?.options).toMatchObject({
      secure: true,
      sameSite: "none",
      httpOnly: true,
      path: "/",
    });

    const csrfCookie = clearedCookies.find((cookie) => cookie.name === CSRF_COOKIE_NAME);
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie?.options).toMatchObject({
      secure: true,
      sameSite: "none",
      httpOnly: false,
      path: "/",
    });
  });
});
