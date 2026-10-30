import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { TrpcContext } from "./_core/context";

// The feed and the post detail show the name of the author's club next to the author: their
// «Club principale», else their latest club. A club that is not public must not leak who
// belongs to it: its name shows only to its active members.

const VIEWER_ID = 42;
const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL);

const m = vi.hoisted(() => {
  const executed: unknown[] = [];
  const state = { respond: (_query: unknown): { rows: unknown[] } => ({ rows: [] }) };
  const db = {
    execute: vi.fn(async (query: unknown) => {
      executed.push(query);
      return state.respond(query);
    }),
  };
  return { executed, state, db };
});

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: async () => m.db,
}));
vi.mock("./product_analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./product_analytics")>()),
  trackProductEvent: vi.fn(async () => {}),
}));

import { getSocialFeed } from "./db_social";
import { communityRouter } from "./routers/community.router";

beforeEach(() => {
  m.executed.length = 0;
  m.state.respond = () => ({ rows: [] });
  vi.clearAllMocks();
});

function expectClubNameVisibleOnlyWhenAllowed(query: unknown, viewerId: number) {
  const { sql: text, params } = render(query);
  const end = text.indexOf("AS user_club_name");
  expect(end, "the query selects user_club_name").toBeGreaterThan(0);
  const start = text.lastIndexOf("SELECT CASE", text.lastIndexOf("pref.primary_club) = 'null'", end));
  expect(start, "user_club_name is the author club subquery").toBeGreaterThan(0);
  const subquery = text.slice(start, end);

  // «Club principale» first, else the author's latest club: only active memberships.
  expect(subquery).toMatch(/'primaryClubId'/);
  expect(subquery).toMatch(/pm\.user_id = p\.user_id/);
  expect(subquery).toMatch(/m\.user_id = p\.user_id/);
  expect(subquery).toMatch(/m\.status = 'active'/);
  // Both ways a public club shows to everyone, any other club only to its active members.
  expect(subquery.match(/c\.visibility = 'public' AND c\.is_private IS NOT TRUE/g)).toHaveLength(2);
  const viewerParams = Array.from(subquery.matchAll(/vm\.user_id = \$(\d+)/g));
  expect(viewerParams, "both membership checks are bound to the viewer").toHaveLength(2);
  for (const match of viewerParams) expect(params[Number(match[1]) - 1]).toBe(viewerId);
}

describe("getSocialFeed user_club_name", () => {
  it.each(["global", "self", "following"] as const)(
    "%s: hides a non-public club from viewers who are not its members",
    async (scope) => {
      await getSocialFeed(VIEWER_ID, { scope });
      expect(m.executed).toHaveLength(1);
      expectClubNameVisibleOnlyWhenAllowed(m.executed[0], VIEWER_ID);
    },
  );
});

describe("community.postById user_club_name", () => {
  it("hides a non-public club from viewers who are not its members", async () => {
    m.state.respond = (query) => {
      const text = render(query).sql;
      if (/SELECT id, user_id, club_id, visibility, is_deleted/.test(text)) {
        return { rows: [{ id: 7, user_id: 5, club_id: null, visibility: "public", is_deleted: false }] };
      }
      return { rows: [{ id: 7, user_id: 5, user_club_name: null }] };
    };
    const ctx: TrpcContext = {
      user: {
        id: VIEWER_ID,
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

    await communityRouter.createCaller(ctx).postById({ postId: 7 });

    const postQuery = m.executed.find((q) => /AS user_club_name/.test(render(q).sql));
    expect(postQuery, "postById selects user_club_name").toBeDefined();
    expectClubNameVisibleOnlyWhenAllowed(postQuery, VIEWER_ID);
  });
});

describe("feed swim card", () => {
  it("selects Garmin's average pace and the training records set in that swim", async () => {
    await getSocialFeed(VIEWER_ID, { scope: "global" });
    const { sql: text } = render(m.executed[0]);
    expect(text).toMatch(/a\.avg_pace_per_100m AS activity_avg_pace_per_100m/);
    expect(text).toMatch(/FROM personal_records pr/);
    expect(text).toMatch(/pr\.activity_id = p\.activity_id/);
    expect(text).toMatch(/pr\.user_id = p\.user_id/);
    expect(text).toMatch(/'previous_value', pr\.previous_value/);
    expect(text).toMatch(/AS activity_records/);
  });
});
