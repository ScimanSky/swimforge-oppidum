import { getDb } from "./db";
import { challenges, challengeParticipants } from "../drizzle/schema_challenges";
import { users, swimmerProfiles } from "../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

export async function getChallengeById(challengeId: number) {
  const db = await getDb();
  if (!db) return null;

  // Get challenge details
  const challenge = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge || challenge.length === 0) {
    return null;
  }

  // Get participants with their progress and profile badges
  const participantsResult = await db.execute(sql`
    SELECT 
      cp.user_id as "userId",
      u.name as username,
      sp.avatar_url as "avatarUrl",
      cp.current_progress as progress,
      cp.joined_at as "joinedAt",
      pb.badge_image_url as "profileBadgeUrl",
      pb.name as "profileBadgeName",
      pb.level as "profileBadgeLevel",
      pb.color as "profileBadgeColor"
    FROM challenge_participants cp
    INNER JOIN users u ON cp.user_id = u.id
    LEFT JOIN swimmer_profiles sp ON u.id = sp.user_id
    LEFT JOIN profile_badges pb ON sp.profile_badge_id = pb.id
    WHERE cp.challenge_id = ${challengeId}
    ORDER BY cp.current_progress DESC
  `);

  const participants = participantsResult.rows as any[];

  return {
    ...challenge[0],
    participants,
  };
}
