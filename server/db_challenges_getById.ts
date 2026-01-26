import { getDb } from "./db";
import { challenges, challengeParticipants } from "../drizzle/schema_challenges";
import { users, swimmerProfiles } from "../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function getChallengeById(challengeId: number) {
  const db = await getDb();
  if (!db) return null;

  // Get challenge details with explicit field mapping
  const challengeResult = await db
    .select({
      id: challenges.id,
      name: challenges.name,
      description: challenges.description,
      creator_id: challenges.creatorId,
      type: challenges.type,
      objective: challenges.objective,
      duration: challenges.duration,
      start_date: challenges.startDate,
      end_date: challenges.endDate,
      status: challenges.status,
      min_participants: challenges.minParticipants,
      max_participants: challenges.maxParticipants,
      badge_image_url: challenges.badgeImageUrl,
      badge_name: challenges.badgeName,
      prize_description: challenges.prizeDescription,
      rules: challenges.rules,
      created_at: challenges.createdAt,
      updated_at: challenges.updatedAt,
    })
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challengeResult || challengeResult.length === 0) {
    return null;
  }

  const challenge = challengeResult[0];

  // Validate dates - if NULL, skip this challenge
  if (!challenge.start_date || !challenge.end_date) {
    console.warn(`[getChallengeById] Challenge ${challengeId} has NULL dates, skipping`);
    return null;
  }

  // Get participants with their progress and profile badges
  // Use Novizio (level 1) badge as default if user doesn't have a badge
  const participantsResult = await db.execute(sql`
    SELECT 
      cp.user_id as "userId",
      u.name as username,
      sp.avatar_url as "avatarUrl",
      cp.current_progress as progress,
      cp.joined_at as "joinedAt",
      COALESCE(pb.badge_image_url, pb_default.badge_image_url) as "profileBadgeUrl",
      COALESCE(pb.name, pb_default.name) as "profileBadgeName",
      COALESCE(pb.level, pb_default.level) as "profileBadgeLevel",
      COALESCE(pb.color, pb_default.color) as "profileBadgeColor"
    FROM challenge_participants cp
    INNER JOIN users u ON cp.user_id = u.id
    LEFT JOIN swimmer_profiles sp ON u.id = sp.user_id
    LEFT JOIN profile_badges pb ON sp.profile_badge_id = pb.id
    LEFT JOIN profile_badges pb_default ON pb_default.level = 1
    WHERE cp.challenge_id = ${challengeId}
    ORDER BY cp.current_progress DESC
  `);

  const participants = participantsResult.rows as any[];

  return {
    ...challenge,
    participants,
  };
}
