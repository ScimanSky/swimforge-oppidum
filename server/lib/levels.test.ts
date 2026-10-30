import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// One level calculation: the highest level_thresholds row the XP total reaches (1 below the
// first). Used by the Garmin sync, the profile and the challenge cron; no hard-coded table.

const h = vi.hoisted(() => {
  const state = { executed: [] as unknown[], results: [] as unknown[][] };
  const db = {
    execute: vi.fn(async (query: unknown) => {
      state.executed.push(query);
      return { rows: state.results.shift() ?? [] };
    }),
  };
  return { state, db, available: true };
});

vi.mock("../db", () => ({ getDb: async () => (h.available ? h.db : null) }));

import { healLevel, levelForXp, levelForXpSql } from "./levels";

const render = (query: unknown) => new PgDialect().sqlToQuery(query as SQL);

beforeEach(() => {
  h.state.executed.length = 0;
  h.state.results.length = 0;
  h.available = true;
  vi.clearAllMocks();
});

describe("levelForXpSql", () => {
  it("is the highest level whose threshold the XP reaches, 1 below the first", () => {
    const { sql: text, params } = render(levelForXpSql(sql`${1234}`));
    expect(text).toMatch(/COALESCE\(\(SELECT max\(lt\.level\) FROM level_thresholds lt WHERE lt\.xp_required <= \(\$1\)\), 1\)/);
    expect(params).toEqual([1234]);
  });
});

describe("levelForXp", () => {
  it("reads level_thresholds", async () => {
    h.state.results.push([{ level: 7 }]);
    await expect(levelForXp(6100)).resolves.toBe(7);
    const { sql: text, params } = render(h.state.executed[0]);
    expect(text).toMatch(/FROM level_thresholds lt/);
    expect(params).toEqual([6100]);
  });

  it("no thresholds or no database: level 1", async () => {
    h.state.results.push([{ level: null }]);
    await expect(levelForXp(50)).resolves.toBe(1);
    h.available = false;
    await expect(levelForXp(50)).resolves.toBe(1);
  });
});

describe("healLevel", () => {
  it("stores the level of the total XP only when the stored one differs", async () => {
    h.state.results.push([{ level: 9 }]);
    await expect(healLevel(42)).resolves.toBe(9);
    const { sql: text, params } = render(h.state.executed[0]);
    expect(text).toMatch(/UPDATE swimmer_profiles sp/);
    expect(text).toMatch(/SET level = COALESCE\(\(SELECT max\(lt\.level\) FROM level_thresholds lt WHERE lt\.xp_required <= \(sp\.total_xp\)\), 1\)/);
    expect(text).toMatch(/sp\.level IS DISTINCT FROM COALESCE/);
    expect(text).toMatch(/RETURNING sp\.level/);
    expect(params).toEqual([42]);
  });

  it("never with an empty level_thresholds (every level would drop to 1)", async () => {
    h.state.results.push([]);
    await expect(healLevel(42)).resolves.toBeNull();
    const { sql: text } = render(h.state.executed[0]);
    expect(text).toMatch(/AND EXISTS \(SELECT 1 FROM level_thresholds\)\s+RETURNING/);
  });

  it("already consistent: nothing changes, null", async () => {
    h.state.results.push([]);
    await expect(healLevel(42)).resolves.toBeNull();
  });
});
