import { describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TrpcContext } from "../_core/context";

// community.postById shows another user's post: its author block must not carry
// the author's email (GDPR).

const m = vi.hoisted(() => {
  const executed: unknown[] = [];
  const db = {
    execute: vi.fn(async (query: unknown) => {
      executed.push(query);
      // 1st call: requirePostReadable; 2nd: the post itself.
      if (executed.length === 1) {
        return { rows: [{ id: 7, user_id: 5, club_id: null, visibility: "public", is_deleted: false }] };
      }
      return { rows: [{ id: 7, user_id: 5, user_name: "Ada", user_username: "ada" }] };
    }),
  };
  return { executed, db };
});

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: async () => m.db,
}));
vi.mock("../product_analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../product_analytics")>()),
  trackProductEvent: vi.fn(async () => {}),
}));

import { communityRouter } from "./community.router";

function ctx(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "viewer",
      email: "viewer@example.com",
      name: "Viewer",
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

describe("community.postById", () => {
  it("never reads the author's email and exposes the username instead", async () => {
    const post = await communityRouter.createCaller(ctx()).postById({ postId: 7 });
    expect(post).toMatchObject({ id: 7, user_username: "ada" });
    expect(m.executed).toHaveLength(2);
    const text = new PgDialect().sqlToQuery(m.executed[1] as SQL).sql;
    expect(text).not.toMatch(/email/i);
    expect(text).toMatch(/AS user_username/);
    expect(text).not.toMatch(/user_presence|user_is_online/);
  });
});
