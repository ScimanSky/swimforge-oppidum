import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { is, SQL, Column } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// leaderboard.get is callable by any logged-in user: its payload must never carry
// another user's email or private profile columns (GDPR).

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

const FORBIDDEN_KEYS = ["email", "userEmail"];
// swimmer_profiles columns that must never reach another user through the leaderboard.
const PRIVATE_PROFILE_COLUMNS = [
  "garmin_token_encrypted",
  "birth_date",
  "privacy_settings",
  "notification_settings",
  "preferences",
  "last_name",
  "location",
  "bio",
  "ai_skill_message",
];

/** Collect every key of a (possibly nested) drizzle selection and the DB columns it reads. */
function flattenSelection(selection: unknown): { keys: string[]; columns: string[] } {
  const keys: string[] = [];
  const columns: string[] = [];
  const visit = (value: unknown) => {
    if (is(value, Column)) {
      columns.push(value.name);
      return;
    }
    if (is(value, SQL)) return;
    if (value && typeof value === "object") {
      // A whole table passed as a selection value: all its columns are selected.
      const tableColumns = (value as any)[Symbol.for("drizzle:Columns")];
      if (tableColumns) {
        for (const col of Object.values(tableColumns)) visit(col);
        return;
      }
      for (const [key, nested] of Object.entries(value)) {
        keys.push(key);
        visit(nested);
      }
    }
  };
  visit(selection);
  return { keys, columns };
}

describe("getLeaderboard (leaderboard.get) privacy", () => {
  beforeEach(() => {
    m.state.selections.length = 0;
    m.state.executed.length = 0;
  });

  it.each(["totalXp", "level", "badges"] as const)(
    "all-time %s selects no email and no private profile column",
    async (orderBy) => {
      const { getLeaderboard } = await import("./db");
      await getLeaderboard(orderBy, 50, "all");

      expect(m.state.selections).toHaveLength(1);
      const { keys, columns } = flattenSelection(m.state.selections[0]);
      for (const key of FORBIDDEN_KEYS) expect(keys).not.toContain(key);
      expect(columns).not.toContain("email");
      for (const col of PRIVATE_PROFILE_COLUMNS) expect(columns).not.toContain(col);
      // Fields the clients (Leaderboard.tsx, Challenges.tsx) still read.
      for (const col of ["user_id", "avatar_url", "username", "level", "total_xp", "total_distance_meters", "name"]) {
        expect(columns).toContain(col);
      }
    },
  );

  it.each([
    ["totalXp", "week"],
    ["level", "month"],
    ["badges", "week"],
  ] as const)("period %s/%s raw SQL never reads users.email", async (orderBy, period) => {
    const { getLeaderboard } = await import("./db");
    await getLeaderboard(orderBy, 20, period);

    expect(m.state.executed).toHaveLength(1);
    const { sql: text } = new PgDialect().sqlToQuery(m.state.executed[0] as SQL);
    expect(text).not.toMatch(/email/i);
    expect(text).toMatch(/u\.name/);
    expect(text).toMatch(/sp\.username/);
  });

  it("uses a cache key version that cannot serve payloads cached before the fix", async () => {
    const { cacheKeys } = await import("./lib/cache");
    const key = cacheKeys.leaderboard("totalXp", "all", 50, 0);
    expect(key.startsWith("leaderboard:v2:")).toBe(false);
    expect(key.startsWith("leaderboard:")).toBe(true);
  });
});
