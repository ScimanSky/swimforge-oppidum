import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// COUNT(*) is a bigint: node-postgres returns it as a string unless it is cast.

const m = vi.hoisted(() => {
  const executed: unknown[] = [];
  const db = {
    execute: vi.fn(async (query: unknown) => {
      executed.push(query);
      return { rows: [] };
    }),
  };
  return { executed, db };
});

vi.mock("./db", () => ({ getDb: async () => m.db }));

const render = (query: unknown) => new PgDialect().sqlToQuery(query as SQL).sql;

describe("getActiveChallenges numeric counts", () => {
  beforeEach(() => {
    m.executed.length = 0;
  });

  it("participantCount is cast to int", async () => {
    const { getActiveChallenges } = await import("./db_challenges");
    await getActiveChallenges(1);

    const list = m.executed.map(render).find((t) => /"participantCount"/.test(t));
    expect(list).toBeDefined();
    expect(list).toMatch(/\(SELECT COUNT\(\*\)::int FROM challenge_participants WHERE challenge_id = c\.id\) as "participantCount"/);
  });
});
