import { getDb } from "./db";
import { sql } from "drizzle-orm";

export async function fixBadgeUrls() {
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return { success: false, error: "Database not available" };
  }

  try {
    // Update all profile badge URLs
    await db.execute(sql`UPDATE profile_badges SET badge_image_url = '/profile_badges/level_1_novizio.png' WHERE level = 1`);
    await db.execute(sql`UPDATE profile_badges SET badge_image_url = '/profile_badges/level_2_principiante.png' WHERE level = 2`);
    await db.execute(sql`UPDATE profile_badges SET badge_image_url = '/profile_badges/level_3_intermedio.png' WHERE level = 3`);
    await db.execute(sql`UPDATE profile_badges SET badge_image_url = '/profile_badges/level_4_avanzato.png' WHERE level = 4`);
    await db.execute(sql`UPDATE profile_badges SET badge_image_url = '/profile_badges/level_5_esperto.png' WHERE level = 5`);
    await db.execute(sql`UPDATE profile_badges SET badge_image_url = '/profile_badges/level_6_maestro.png' WHERE level = 6`);
    await db.execute(sql`UPDATE profile_badges SET badge_image_url = '/profile_badges/level_7_leggenda.png' WHERE level = 7`);

    console.log("Badge URLs updated successfully");
    return { success: true, message: "Badge URLs updated successfully" };
  } catch (error) {
    console.error("Error updating badge URLs:", error);
    return { success: false, error: String(error) };
  }
}
