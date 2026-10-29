import dotenv from "dotenv";
import path from "path";
import { isNotNull } from "drizzle-orm";
import { getDb } from "../server/db";
import { swimmingActivities } from "../drizzle/schema";
import { recomputePersonalRecordsFromStoredLaps } from "../server/personal_records";

// One-off: recompute every Garmin user's training records from the laps already
// stored in the DB, with the same rules as the sync (server/personal_records.ts).
// Silent (no pb_detected events, no push), idempotent, never touches manual records.
// Usage: pnpm tsx scripts/backfill-personal-records-from-garmin.ts [--env .env.oracle]

const envArgIndex = process.argv.findIndex((arg) => arg === "--env");
const envPathArg = envArgIndex >= 0 ? process.argv[envArgIndex + 1] : undefined;
const envPath = path.resolve(process.cwd(), envPathArg ?? ".env.oracle");
dotenv.config({ path: envPath });

async function main() {
  console.log(`[backfill-pb] loading env from ${envPath}`);
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing");
  }

  const db = await getDb();
  if (!db) throw new Error("database unavailable");

  const users = await db
    .selectDistinct({ userId: swimmingActivities.userId })
    .from(swimmingActivities)
    .where(isNotNull(swimmingActivities.garminActivityId));

  const totals = { users: 0, inserted: 0, updated: 0, unchanged: 0, skippedManual: 0 };
  for (const { userId } of users) {
    const result = await recomputePersonalRecordsFromStoredLaps(userId);
    totals.users += 1;
    totals.inserted += result.inserted;
    totals.updated += result.updated;
    totals.unchanged += result.unchanged;
    totals.skippedManual += result.skippedManual;
    console.log(`[backfill-pb] user=${userId} ${JSON.stringify(result)}`);
  }

  console.log(`[backfill-pb] done ${JSON.stringify(totals)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[backfill-pb] failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
