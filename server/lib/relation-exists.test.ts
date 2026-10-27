import { describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { deleteFromIfExists, relationExists } from "./relation-exists";

const dialect = new PgDialect();

const fakeTx = (existing: string[]) => {
  const executed: Array<{ sql: string; params: unknown[] }> = [];
  return {
    executed,
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      const rendered = { sql: text, params };
      executed.push(rendered);
      if (rendered.sql.includes("to_regclass")) {
        return { rows: [{ present: existing.includes(String(rendered.params[0])) }] };
      }
      return { rows: [] };
    },
  };
};

describe("relationExists", () => {
  it("returns true when to_regclass resolves the relation", async () => {
    const tx = fakeTx(["public.stories"]);
    await expect(relationExists(tx, "public.stories")).resolves.toBe(true);
    expect(tx.executed[0].params).toEqual(["public.stories"]);
  });

  it("returns false when the relation is missing", async () => {
    await expect(relationExists(fakeTx([]), "public.stories")).resolves.toBe(false);
  });

  it("returns false on an empty result", async () => {
    await expect(relationExists({ execute: async () => ({ rows: [] }) }, "public.stories")).resolves.toBe(false);
  });
});

describe("deleteFromIfExists", () => {
  it("skips the DELETE when the relation is absent", async () => {
    const tx = fakeTx([]);
    await expect(deleteFromIfExists(tx, "public.stories", sql`user_id = ${1}`)).resolves.toBe(false);
    expect(tx.executed).toHaveLength(1);
    expect(tx.executed[0].sql).toContain("to_regclass");
  });

  it("deletes with a quoted qualified identifier when the relation exists", async () => {
    const tx = fakeTx(["public.stories"]);
    await expect(deleteFromIfExists(tx, "public.stories", sql`user_id = ${7}`)).resolves.toBe(true);
    expect(tx.executed[1]).toEqual({ sql: 'DELETE FROM "public"."stories" WHERE user_id = $1', params: [7] });
  });

  it("deletes every row when no WHERE clause is given", async () => {
    const tx = fakeTx(["public.stories"]);
    await deleteFromIfExists(tx, "public.stories");
    expect(tx.executed[1].sql).toBe('DELETE FROM "public"."stories"');
  });

  it("skips the DELETE when a dependency is missing", async () => {
    const tx = fakeTx(["public.story_views"]);
    await expect(
      deleteFromIfExists(tx, "public.story_views", sql`viewer_id = ${1}`, ["public.stories"])
    ).resolves.toBe(false);
    expect(tx.executed.every((query) => query.sql.includes("to_regclass"))).toBe(true);
  });
});
