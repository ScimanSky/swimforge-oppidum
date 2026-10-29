import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { swimmerProfiles } from "../../drizzle/schema";

const m = vi.hoisted(() => {
  const state = { updates: [] as Array<{ table: unknown; values: any }>, returned: [{ id: 1 }] as unknown[] };
  const db = {
    select: vi.fn(),
    update: vi.fn((table: unknown) => ({
      set: (values: unknown) => {
        state.updates.push({ table, values });
        return { where: () => ({ returning: async () => state.returned }) };
      },
    })),
  };
  return { state, db };
});

vi.mock("../db", () => ({ getDb: async () => m.db }));

import { mergeSwimmerPreferences, preferencesMergeSql, preferencesPatch } from "./preferences";

const render = (value: any) => new PgDialect().sqlToQuery(value);

describe("preferencesPatch", () => {
  it("drops keys explicitly set to undefined instead of deleting the stored ones", () => {
    expect(preferencesPatch({ units: "metric", language: undefined, autoplayVideos: false })).toEqual({
      units: "metric",
      autoplayVideos: false,
    });
    expect(Object.keys(preferencesPatch({ language: undefined }))).toEqual([]);
  });
});

describe("preferencesMergeSql", () => {
  it("merges the patch into the stored object in SQL: (stored || patch) − removed, back to json", () => {
    const { sql, params } = render(preferencesMergeSql({ units: "imperial" }, ["cssTest"]));
    expect(sql).toContain("jsonb_typeof(");
    expect(sql).toContain("|| $");
    expect(sql).toMatch(/- \$\d+::text/);
    expect(sql.trim().endsWith("::json")).toBe(true);
    expect(params).toEqual([JSON.stringify({ units: "imperial" }), "cssTest"]);
  });

  it("a stored value that is not an object (null, legacy JSON string) is read safely", () => {
    const { sql } = render(preferencesMergeSql({ a: 1 }));
    expect(sql).toContain("WHEN 'object'");
    expect(sql).toContain("WHEN 'string'");
    expect(sql).toContain("ELSE '{}'::jsonb");
  });
});

describe("mergeSwimmerPreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.state.updates.length = 0;
    m.state.returned = [{ id: 1 }];
  });

  it("is a single UPDATE with no read before it", async () => {
    expect(await mergeSwimmerPreferences(42, { units: "metric", language: undefined })).toBe(true);
    expect(m.db.select).not.toHaveBeenCalled();
    expect(m.state.updates).toHaveLength(1);
    expect(m.state.updates[0].table).toBe(swimmerProfiles);
    const { params } = render(m.state.updates[0].values.preferences);
    expect(params).toEqual([JSON.stringify({ units: "metric" })]);
    expect(m.state.updates[0].values.updatedAt).toBeInstanceOf(Date);
  });

  it("false without a profile", async () => {
    m.state.returned = [];
    expect(await mergeSwimmerPreferences(42, { units: "metric" })).toBe(false);
  });
});
