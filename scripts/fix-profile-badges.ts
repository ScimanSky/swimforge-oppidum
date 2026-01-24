import { getDb } from "../server/db";
import { updateUserProfileBadge } from "../server/db_profile_badges";
import { sql } from "drizzle-orm";

async function fixProfileBadges() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return;
  }

  console.log("Fetching all users...");
  const result = await db.execute(sql`
    SELECT user_id, total_xp FROM swimmer_profiles
  `);

  const users = result.rows as any[];
  console.log(`Found ${users.length} users`);

  for (const user of users) {
    console.log(`Updating profile badge for user ${user.user_id} (XP: ${user.total_xp || 0})`);
    await updateUserProfileBadge(user.user_id, user.total_xp || 0);
  }

  console.log("Done!");
  process.exit(0);
}

fixProfileBadges().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
