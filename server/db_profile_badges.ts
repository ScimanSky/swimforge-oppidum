import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * Calculate profile badge level based on total XP
 */
export function calculateProfileBadgeLevel(totalXP: number): number {
  if (totalXP >= 20000) return 7; // Leggenda
  if (totalXP >= 12000) return 6; // Maestro
  if (totalXP >= 7000) return 5; // Esperto
  if (totalXP >= 3500) return 4; // Avanzato
  if (totalXP >= 1500) return 3; // Intermedio
  if (totalXP >= 500) return 2; // Principiante
  return 1; // Novizio
}

/**
 * Initialize profile badges for all users based on their current XP
 */
export async function initializeAllUserProfileBadges() {
  const db = await getDb();
  if (!db) return { updated: 0 };

  // Get all users with their XP
  const users = await db.execute(sql`
    SELECT user_id, total_xp FROM swimmer_profiles
  `);

  let updated = 0;
  for (const user of users.rows as any[]) {
    await updateUserProfileBadge(user.user_id, user.total_xp || 0);
    updated++;
  }

  return { updated };
}

/**
 * Update user's profile badge based on their total XP
 */
export async function updateUserProfileBadge(userId: number, totalXP: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const badgeLevel = calculateProfileBadgeLevel(totalXP);

  // Get profile badge ID for this level
  const badgeResult = await db.execute(sql`
    SELECT id FROM profile_badges WHERE level = ${badgeLevel}
  `);

  if (badgeResult.rows.length === 0) return;

  const badgeId = (badgeResult.rows[0] as any).id;

  // Update swimmer profile with new badge
  await db.execute(sql`
    UPDATE swimmer_profiles
    SET profile_badge_id = ${badgeId}
    WHERE user_id = ${userId}
  `);
}

export async function updateUserProfileBadgeByLevel(userId: number, badgeLevel: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const badgeResult = await db.execute(sql`
    SELECT id FROM profile_badges WHERE level = ${badgeLevel}
  `);

  if (badgeResult.rows.length === 0) return;

  const badgeId = (badgeResult.rows[0] as any).id;

  await db.execute(sql`
    UPDATE swimmer_profiles
    SET profile_badge_id = ${badgeId}
    WHERE user_id = ${userId}
  `);
}

/**
 * Get profile badge info for a user
 */
export async function getUserProfileBadge(userId: number): Promise<any | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.execute(sql`
    SELECT pb.*
    FROM swimmer_profiles sp
    JOIN profile_badges pb ON sp.profile_badge_id = pb.id
    WHERE sp.user_id = ${userId}
  `);

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get all profile badges
 */
export async function getAllProfileBadges(): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT * FROM profile_badges ORDER BY level ASC
  `);

  return result.rows as any[];
}
