import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// users.search: what the user types is matched as text; «%» and «_» are not wildcards.

const dialect = new PgDialect();

const m = vi.hoisted(() => {
  const state = { wheres: [] as unknown[], orders: [] as unknown[] };
  const chain: any = {};
  for (const method of ["from", "leftJoin", "limit"]) chain[method] = vi.fn(() => chain);
  chain.where = vi.fn((condition: unknown) => {
    state.wheres.push(condition);
    return chain;
  });
  chain.orderBy = vi.fn((...orders: unknown[]) => {
    state.orders.push(...orders);
    return chain;
  });
  chain.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
  return { state, db: { select: vi.fn(() => chain) } };
});

vi.mock("./db", () => ({ getDb: async () => m.db }));

import { searchUsers } from "./db_public_profiles";

const params = (query: unknown) => dialect.sqlToQuery(query as SQL).params;

describe("searchUsers", () => {
  it("escapes %, _ and the backslash, so they match only themselves", async () => {
    await searchUsers(1, " 100%_a\\b ");
    expect(params(m.state.wheres[0])).toEqual(expect.arrayContaining(["%100\\%\\_a\\\\b%"]));
    expect(params(m.state.orders[0])).toEqual(expect.arrayContaining(["100\\%\\_a\\\\b%"]));
  });

  it("a plain name is unchanged", async () => {
    m.state.wheres.length = 0;
    m.state.orders.length = 0;
    await searchUsers(1, "Ada");
    expect(params(m.state.wheres[0])).toEqual(expect.arrayContaining(["%Ada%"]));
    // The exact-match ranking compares the text as typed (lowercase), not the LIKE pattern.
    expect(params(m.state.orders[0])).toEqual(expect.arrayContaining(["ada", "Ada%"]));
  });
});
