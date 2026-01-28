import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { garminTokens, stravaTokens } from "../drizzle/schema";
import { encryptForStorage } from "../server/lib/tokenCrypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

function isEncrypted(value: string) {
  return value.startsWith("enc:v1:");
}

async function run() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);

  try {
    console.log("[encrypt] Loading Strava tokens...");
    const stravaRows = await db.select().from(stravaTokens);
    let stravaUpdated = 0;

    for (const row of stravaRows) {
      const updates: Record<string, string> = {};
      if (row.accessToken && !isEncrypted(row.accessToken)) {
        updates.accessToken = encryptForStorage(row.accessToken);
      }
      if (row.refreshToken && !isEncrypted(row.refreshToken)) {
        updates.refreshToken = encryptForStorage(row.refreshToken);
      }
      if (Object.keys(updates).length > 0) {
        await db
          .update(stravaTokens)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(stravaTokens.id, row.id));
        stravaUpdated += 1;
      }
    }

    console.log(`[encrypt] Strava rows updated: ${stravaUpdated}`);

    console.log("[encrypt] Loading Garmin tokens...");
    const garminRows = await db.select().from(garminTokens);
    let garminUpdated = 0;

    for (const row of garminRows) {
      const updates: Record<string, string> = {};
      if (row.oauth1Token && !isEncrypted(row.oauth1Token)) {
        updates.oauth1Token = encryptForStorage(row.oauth1Token);
      }
      if (row.oauth2Token && !isEncrypted(row.oauth2Token)) {
        updates.oauth2Token = encryptForStorage(row.oauth2Token);
      }
      if (Object.keys(updates).length > 0) {
        await db
          .update(garminTokens)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(garminTokens.id, row.id));
        garminUpdated += 1;
      }
    }

    console.log(`[encrypt] Garmin rows updated: ${garminUpdated}`);
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("[encrypt] Failed:", error);
  process.exit(1);
});
