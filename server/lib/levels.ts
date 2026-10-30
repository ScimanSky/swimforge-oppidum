/**
 * The level of an XP total: the highest `level_thresholds` row it reaches, 1 below the first.
 * The only level calculation: the Garmin sync, the profile, the badges and the challenge cron all
 * use it (the table is the one source; no hard-coded copy in code).
 */
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";

/** SQL expression: the level for the XP total `xp` (another SQL expression or a parameter). */
export function levelForXpSql(xp: SQL): SQL {
  return sql`COALESCE((SELECT max(lt.level) FROM level_thresholds lt WHERE lt.xp_required <= (${xp})), 1)`;
}

/** The level for `totalXp`; 1 without a database or thresholds. */
export async function levelForXp(totalXp: number): Promise<number> {
  const db = await getDb();
  if (!db) return 1;
  const result = await db.execute(sql`SELECT ${levelForXpSql(sql`${Math.max(0, Math.floor(totalXp))}`)} AS level`);
  const level = Number((result.rows[0] as { level?: unknown } | undefined)?.level);
  return Number.isInteger(level) && level > 0 ? level : 1;
}

/**
 * Self-heal: stores the level matching the user's total XP when the stored one differs (one
 * UPDATE, no change when they already match). Never with an empty level_thresholds: every level
 * would drop to 1. The new level, or null when nothing changed.
 */
export async function healLevel(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const level = levelForXpSql(sql`sp.total_xp`);
  const result = await db.execute(sql`
    UPDATE swimmer_profiles sp
    SET level = ${level}, updated_at = NOW()
    WHERE sp.user_id = ${userId}
      AND sp.level IS DISTINCT FROM ${level}
      AND EXISTS (SELECT 1 FROM level_thresholds)
    RETURNING sp.level
  `);
  const healed = Number((result.rows[0] as { level?: unknown } | undefined)?.level);
  return Number.isInteger(healed) ? healed : null;
}
