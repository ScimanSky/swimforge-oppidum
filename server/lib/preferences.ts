/**
 * swimmer_profiles.preferences is one JSON object shared by several writers (Settings, the CSS
 * test, the manual zones). Each writer merges only its own keys with a single UPDATE in SQL, so two concurrent
 * saves of different keys never overwrite each other (no read-modify-write in the server).
 */
import { DB_UNAVAILABLE_ERR_MSG } from "@shared/const";
import { eq, sql, type SQL } from "drizzle-orm";
import { swimmerProfiles } from "../../drizzle/schema";
import { getDb } from "../db";

/** The patch without keys set to undefined: those keys stay as stored instead of being deleted. */
export function preferencesPatch(patch: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}

/**
 * The new value of preferences: (stored object || patch) minus the `remove` keys, cast back to
 * json. A stored null or non-object reads as {}; a legacy JSON string holding an object is parsed.
 */
export function preferencesMergeSql(patch: Record<string, unknown>, remove: string[] = []): SQL {
  const column = swimmerProfiles.preferences;
  const stored = sql`(CASE jsonb_typeof(${column}::jsonb)
    WHEN 'object' THEN ${column}::jsonb
    WHEN 'string' THEN (CASE WHEN (${column}::jsonb #>> '{}') ~ '^\\s*\\{.*\\}\\s*$' THEN (${column}::jsonb #>> '{}')::jsonb ELSE '{}'::jsonb END)
    ELSE '{}'::jsonb END)`;
  let merged = sql`(${stored} || ${JSON.stringify(preferencesPatch(patch))}::jsonb)`;
  for (const key of remove) merged = sql`(${merged} - ${key}::text)`;
  return sql`${merged}::json`;
}

/**
 * Merges `patch` into the user's preferences (and drops the `remove` keys) in one UPDATE. False
 * when the user has no swimmer profile.
 */
export async function mergeSwimmerPreferences(
  userId: number,
  patch: Record<string, unknown>,
  remove: string[] = [],
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);
  const updated = await db
    .update(swimmerProfiles)
    .set({ preferences: preferencesMergeSql(patch, remove), updatedAt: new Date() })
    .where(eq(swimmerProfiles.userId, userId))
    .returning({ id: swimmerProfiles.id });
  return updated.length > 0;
}
