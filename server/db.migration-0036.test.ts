import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Migration 0036, run by hand in production: deleting an account keeps the clubs, challenges,
// events and invites of other users. The constraint names differ between databases, so every
// change is made by looking the foreign key up in pg_constraint (table, column, referenced table).

const TAG = "0036_keep_clubs_and_challenges_on_account_deletion";
const root = path.resolve(import.meta.dirname, "..");
const migration = fs.readFileSync(path.join(root, "drizzle", `${TAG}.sql`), "utf8");
const statements = migration.split("--> statement-breakpoint").map((statement) => statement.trim());
/** The SQL without comments, whitespace collapsed. */
const code = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ");

const TARGETS = [
  { table: "community_clubs", column: "owner_id", references: "users", action: "r", sql: "RESTRICT" },
  { table: "challenges", column: "creator_id", references: "users", action: "n", sql: "SET NULL" },
  { table: "club_events", column: "creator_id", references: "users", action: "n", sql: "SET NULL" },
  { table: "community_club_invites", column: "inviter_id", references: "users", action: "n", sql: "SET NULL" },
  { table: "social_posts", column: "club_id", references: "community_clubs", action: "n", sql: "SET NULL" },
] as const;

describe(`migration ${TAG}`, () => {
  it("is the last entry of the drizzle journal, with a snapshot", () => {
    const journal = JSON.parse(fs.readFileSync(path.join(root, "drizzle", "meta", "_journal.json"), "utf8"));
    const last = journal.entries[journal.entries.length - 1];
    expect(last).toMatchObject({ idx: 36, tag: TAG, breakpoints: true });
    const snapshot = JSON.parse(fs.readFileSync(path.join(root, "drizzle", "meta", "0036_snapshot.json"), "utf8"));
    const previous = JSON.parse(fs.readFileSync(path.join(root, "drizzle", "meta", "0035_snapshot.json"), "utf8"));
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.tables["public.club_events"].columns.creator_id.notNull).toBe(false);
    expect(snapshot.tables["public.community_club_invites"].columns.inviter_id.notNull).toBe(false);
  });

  it("makes the creator and inviter columns nullable, only on the tables that exist", () => {
    const nullable = code(statements[0]);
    for (const [table, column] of [
      ["challenges", "creator_id"],
      ["club_events", "creator_id"],
      ["community_club_invites", "inviter_id"],
    ]) {
      expect(nullable).toContain(
        `IF to_regclass('public.${table}') IS NOT NULL THEN ALTER TABLE public.${table} ALTER COLUMN ${column} DROP NOT NULL; END IF;`,
      );
    }
  });

  it.each(TARGETS)("sets $table.$column → $references to ON DELETE $sql, whatever the constraint is called", (target) => {
    const block = statements.map(code).find((statement) => statement.includes(`a.attname = '${target.column}'`) && statement.includes(`'public.${target.table}'::regclass`));
    expect(block).toBeDefined();
    const sql = block!;
    expect(sql).toMatch(/^DO \$\$ .* END \$\$;$/);
    // Skipped on a database without the tables.
    expect(sql).toContain(`IF to_regclass('public.${target.table}') IS NULL OR to_regclass('public.${target.references}') IS NULL THEN RETURN; END IF;`);
    // Found by table, column and referenced table in pg_constraint, never by name.
    const lookup = [
      "FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]",
      "WHERE c.contype = 'f'",
      `AND c.conrelid = 'public.${target.table}'::regclass`,
      `AND c.confrelid = 'public.${target.references}'::regclass`,
      "AND cardinality(c.conkey) = 1",
      `AND a.attname = '${target.column}'`,
    ].join(" ");
    // Every other ON DELETE action is dropped...
    expect(sql).toContain(`${lookup} AND c.confdeltype <> '${target.action}' LOOP EXECUTE format('ALTER TABLE public.${target.table} DROP CONSTRAINT %I', fk.conname); END LOOP;`);
    // ...and the right one added only when missing (idempotent).
    expect(sql).toContain(`IF NOT EXISTS ( SELECT 1 ${lookup} AND c.confdeltype = '${target.action}' ) THEN ALTER TABLE public.${target.table} ADD CONSTRAINT`);
    expect(sql).toContain(`FOREIGN KEY (${target.column}) REFERENCES public.${target.references}(id) ON DELETE ${target.sql}; END IF;`);
  });

  it("never drops a constraint by a hard-coded name and adds no cascade", () => {
    const sql = code(migration);
    expect(sql.match(/DROP CONSTRAINT/g)).toHaveLength(TARGETS.length);
    expect(sql).not.toMatch(/DROP CONSTRAINT (IF EXISTS )?["a-z_]/i);
    expect(sql).not.toMatch(/ON DELETE CASCADE/i);
    expect(statements).toHaveLength(1 + TARGETS.length);
  });
});
