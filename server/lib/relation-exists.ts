import { sql, type SQL } from "drizzle-orm";

/**
 * Minimal shape of a Drizzle node-postgres database or transaction handle.
 * Accepting the structural type keeps the helpers usable with both `db` and `tx`.
 */
export type SqlExecutor = {
  execute: (query: SQL) => Promise<{ rows: unknown[] }>;
};

const toIdentifier = (qualifiedName: string): SQL => {
  const parts = qualifiedName.split(".");
  return sql.join(
    parts.map((part) => sql.identifier(part)),
    sql.raw(".")
  );
};

/**
 * Returns true when the relation (e.g. "public.stories") exists.
 *
 * Probing with to_regclass never raises, so it is safe inside a transaction:
 * a failing statement (42P01 undefined_table) would otherwise abort the whole
 * transaction and every later statement would fail with 25P02.
 */
export async function relationExists(tx: SqlExecutor, qualifiedName: string): Promise<boolean> {
  const result = await tx.execute(sql`SELECT to_regclass(${qualifiedName}) IS NOT NULL AS present`);
  return Boolean((result.rows[0] as { present?: boolean } | undefined)?.present);
}

/**
 * Deletes from `qualifiedName` only when it exists (and, optionally, when every
 * relation referenced by the WHERE clause in `dependsOn` exists too).
 * Returns whether the DELETE was executed.
 */
export async function deleteFromIfExists(
  tx: SqlExecutor,
  qualifiedName: string,
  where?: SQL,
  dependsOn: string[] = []
): Promise<boolean> {
  for (const name of [qualifiedName, ...dependsOn]) {
    if (!(await relationExists(tx, name))) return false;
  }
  const target = toIdentifier(qualifiedName);
  await tx.execute(where ? sql`DELETE FROM ${target} WHERE ${where}` : sql`DELETE FROM ${target}`);
  return true;
}
