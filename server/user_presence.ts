import { sql } from "drizzle-orm";
import { getDb } from "./db";

const ONLINE_WINDOW_SECONDS = 120;

let schemaReadyPromise: Promise<void> | null = null;

export async function ensureUserPresenceSchema(): Promise<void> {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    const db = await getDb();
    if (!db) return;

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_presence (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS user_presence_last_seen_idx
      ON user_presence (last_seen_at DESC)
    `);
  })();

  await schemaReadyPromise;
}

export async function touchUserPresence(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureUserPresenceSchema();

  await db.execute(sql`
    INSERT INTO user_presence (user_id, last_seen_at, updated_at)
    VALUES (${userId}, NOW(), NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      last_seen_at = EXCLUDED.last_seen_at,
      updated_at = EXCLUDED.updated_at
  `);
}

export async function markUserOffline(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await ensureUserPresenceSchema();
  await db.execute(sql`DELETE FROM user_presence WHERE user_id = ${userId}`);
}

export function getOnlineIntervalSql() {
  return sql.raw(`NOW() - INTERVAL '${ONLINE_WINDOW_SECONDS} seconds'`);
}

