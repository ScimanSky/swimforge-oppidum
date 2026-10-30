import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The tables added by this batch get row level security and no access for the Supabase API
// roles, only where those roles exist (local and test Postgres have none). Not executed here (no
// database in the tests): the shape of the SQL is checked.

const root = path.resolve(__dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const code = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

function expectGuardedRls(text: string, table: string) {
  const block = text.match(/DO \$\$\s+BEGIN\s+([\s\S]*?)\s+END \$\$;/g)?.find((item) => item.includes(table));
  expect(block, `guarded block for ${table}`).toBeDefined();
  expect(block).toMatch(/IF to_regrole\('anon'\) IS NOT NULL AND to_regrole\('authenticated'\) IS NOT NULL THEN/);
  expect(block).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
  expect(block).toContain(`REVOKE ALL ON TABLE public.${table} FROM anon, authenticated;`);
  // No FORCE: the app's role owns the table and keeps bypassing RLS.
  expect(text).not.toMatch(/FORCE ROW LEVEL SECURITY/);
}

describe("RLS on the new tables", () => {
  it("migration 0037: club_workout_completions, after the CREATE", () => {
    const text = code(read("drizzle/0037_add_club_workout_completions.sql"));
    expectGuardedRls(text, "club_workout_completions");
    expect(text.indexOf("ENABLE ROW LEVEL SECURITY")).toBeGreaterThan(text.indexOf("CREATE TABLE IF NOT EXISTS"));
    // drizzle-kit runs each statement on its own: a breakpoint before the block.
    const raw = read("drizzle/0037_add_club_workout_completions.sql");
    expect(raw.slice(raw.lastIndexOf("CREATE INDEX"), raw.indexOf("DO $$"))).toContain("--> statement-breakpoint");
  });

  it("the social XP archive, inside the script's transaction", () => {
    const text = code(read("scripts/sql/2026-10-30-remove-social-xp.sql"));
    expectGuardedRls(text, "xp_transactions_social_removed");
    const block = text.lastIndexOf("ENABLE ROW LEVEL SECURITY");
    expect(block).toBeGreaterThan(text.indexOf("CREATE TABLE IF NOT EXISTS xp_transactions_social_removed"));
    expect(block).toBeLessThan(text.lastIndexOf("COMMIT;"));
  });
});

describe("migration 0037_add_club_workout_completions", () => {
  it("is the last entry of the drizzle journal, after main's 0036, with its snapshot chained to 0036", () => {
    const journal = JSON.parse(read("drizzle/meta/_journal.json"));
    const last = journal.entries[journal.entries.length - 1];
    const previous = journal.entries[journal.entries.length - 2];
    expect(last).toMatchObject({ idx: 37, tag: "0037_add_club_workout_completions", breakpoints: true });
    expect(previous).toMatchObject({ idx: 36, tag: "0036_keep_clubs_and_challenges_on_account_deletion" });
    // drizzle-kit applies a migration only when it is newer than the last one applied.
    expect(last.when).toBeGreaterThan(previous.when);

    const snapshot = JSON.parse(read("drizzle/meta/0037_snapshot.json"));
    const before = JSON.parse(read("drizzle/meta/0036_snapshot.json"));
    expect(snapshot.prevId).toBe(before.id);
    expect(snapshot.id).not.toBe(before.id);
    expect(Object.keys(snapshot.tables).filter((table) => !(table in before.tables))).toEqual([
      "public.club_workout_completions",
    ]);
    // Main's 0036 changes are kept.
    expect(snapshot.tables["public.club_events"]).toEqual(before.tables["public.club_events"]);
  });
});
