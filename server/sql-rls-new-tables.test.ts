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
  it("migration 0036: club_workout_completions, after the CREATE", () => {
    const text = code(read("drizzle/0036_add_club_workout_completions.sql"));
    expectGuardedRls(text, "club_workout_completions");
    expect(text.indexOf("ENABLE ROW LEVEL SECURITY")).toBeGreaterThan(text.indexOf("CREATE TABLE IF NOT EXISTS"));
    // drizzle-kit runs each statement on its own: a breakpoint before the block.
    const raw = read("drizzle/0036_add_club_workout_completions.sql");
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
