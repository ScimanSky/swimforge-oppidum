import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { levelForXpSql } from "./lib/levels";

// The SQL the owner runs by hand on production (scripts/sql): same level rule as the app, and
// safe to run twice. Not executed here (no database in the tests): its shape is checked.

const read = (name: string) => readFileSync(path.resolve(__dirname, "..", "scripts", "sql", name), "utf8");
/** The statements, without the comment lines (previews, checks and the undo are comments). */
const code = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
const appLevelRule = new PgDialect().sqlToQuery(levelForXpSql(sql.raw("sp.total_xp"))).sql;

describe("scripts/sql/2026-10-30-recompute-levels.sql", () => {
  const text = code(read("2026-10-30-recompute-levels.sql"));

  it("uses the app's level rule and touches only levels that differ", () => {
    expect(text).toContain(`SET level = ${appLevelRule}`);
    expect(text).toContain(`WHERE sp.level IS DISTINCT FROM\n      ${appLevelRule}`);
  });

  it("stops when level_thresholds is empty, in one transaction", () => {
    expect(text).toMatch(/IF NOT EXISTS \(SELECT 1 FROM level_thresholds\) THEN\s+RAISE EXCEPTION/);
    expect(text.trim().startsWith("BEGIN;")).toBe(true);
    expect(text.trim().endsWith("COMMIT;")).toBe(true);
  });
});

describe("scripts/sql/2026-10-30-remove-social-xp.sql", () => {
  const text = code(read("2026-10-30-remove-social-xp.sql"));

  it("removes only the social awards: reason bonus with the action_xp: prefix", () => {
    const deletes = text.match(/DELETE FROM xp_transactions t\s+WHERE t\.reason = 'bonus'\s+AND t\.description LIKE 'action\\_xp:%'/g);
    expect(deletes).toHaveLength(1);
    expect(text).not.toMatch(/prediction_xp|club_quest|challenge_win|'activity'|'badge'/);
    expect(text).not.toMatch(/TRUNCATE|DROP TABLE/i);
  });

  it("moves the rows to an archive and subtracts them in the same statement: a second run subtracts nothing", () => {
    const statement = text.slice(text.indexOf("WITH removed AS"), text.indexOf("WHERE sp.user_id = per_user.user_id;"));
    expect(statement).toMatch(/RETURNING t\.id, t\.user_id, t\.amount/);
    expect(statement).toMatch(/INSERT INTO xp_transactions_social_removed/);
    expect(statement).toMatch(/FROM archived/);
    expect(statement).toMatch(/SET total_xp = GREATEST\(0, sp\.total_xp - per_user\.social_xp\)/);
    expect(text).toMatch(/CREATE TABLE IF NOT EXISTS xp_transactions_social_removed \(\s+LIKE xp_transactions,/);
    // total_xp is never rebuilt from the ledger (older swim XP may be missing from it).
    expect(text).not.toMatch(/total_xp = \(?\s*SELECT/i);
  });

  it("then recomputes the levels with the app's rule, all in one transaction with the empty-table guard", () => {
    expect(text.indexOf(`SET level = ${appLevelRule}`)).toBeGreaterThan(text.indexOf("WITH removed AS"));
    expect(text).toMatch(/IF NOT EXISTS \(SELECT 1 FROM level_thresholds\) THEN\s+RAISE EXCEPTION/);
    expect(text.trim().startsWith("BEGIN;")).toBe(true);
    expect(text.trim().endsWith("COMMIT;")).toBe(true);
  });
});
