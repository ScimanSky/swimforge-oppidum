import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { is, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Postgres returns bigint COUNT/SUM as strings through node-postgres, while the tRPC
// types say number: the leaderboard must hand the clients real numbers.

const m = vi.hoisted(() => {
  const state: { selections: unknown[]; executed: unknown[] } = { selections: [], executed: [] };
  const chain: any = {
    from: vi.fn(() => chain),
    innerJoin: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    groupBy: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(async () => []),
  };
  const db = {
    select: vi.fn((selection?: unknown) => {
      state.selections.push(selection);
      return chain;
    }),
    execute: vi.fn(async (query: unknown) => {
      state.executed.push(query);
      return { rows: [] };
    }),
  };
  return { state, db };
});

vi.mock("pg", () => ({
  Pool: class {
    query = vi.fn(async () => ({ rows: [] }));
    end = vi.fn(async () => {});
    on = vi.fn();
  },
}));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: () => m.db }));

const previousUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL = "postgres://test@localhost/test";
afterAll(() => {
  if (previousUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousUrl;
});

describe("getLeaderboard numeric aggregates", () => {
  beforeEach(() => {
    m.state.selections.length = 0;
    m.state.executed.length = 0;
  });

  it("all-time badges: badgeCount is decoded to a number", async () => {
    const { getLeaderboard } = await import("./db");
    await getLeaderboard("badges", 50, "all");

    const selection = m.state.selections[0] as Record<string, unknown>;
    const badgeCount = selection.badgeCount;
    expect(is(badgeCount, SQL)).toBe(true);
    // node-postgres hands count() over as a string ("7"): the selection must map it.
    expect((badgeCount as SQL).decoder.mapFromDriverValue("7")).toBe(7);
  });

  it.each([
    ["totalXp", "week"],
    ["level", "month"],
    ["badges", "week"],
  ] as const)("period %s/%s: badgeCount and periodXp are cast to int in SQL", async (orderBy, period) => {
    const { getLeaderboard } = await import("./db");
    await getLeaderboard(orderBy, 20, period);

    const { sql: text } = new PgDialect().sqlToQuery(m.state.executed[0] as SQL);
    expect(text).toMatch(/COALESCE\(\(SELECT COUNT\(\*\) FROM user_badges [^)]*\), 0\)::int as "badgeCount"/);
    expect(text).toMatch(/\)::int as "periodXp"/);
  });

  it("uses a cache key version that cannot serve payloads cached with string counts", async () => {
    const { cacheKeys } = await import("./lib/cache");
    const key = cacheKeys.leaderboard("badges", "week", 50, 0);
    expect(key.startsWith("leaderboard:v2:")).toBe(false);
    expect(key.startsWith("leaderboard:v3:")).toBe(false);
    expect(key.startsWith("leaderboard:")).toBe(true);
  });
});
