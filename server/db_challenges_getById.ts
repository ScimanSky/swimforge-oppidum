import { getDb } from "./db";
import { challenges, challengeParticipants } from "../drizzle/schema_challenges";
import { users, swimmerProfiles } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";

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

  // Get participants with their progress
  const participants = await db
    .select({
      userId: challengeParticipants.userId,
      username: users.name,
      avatarUrl: swimmerProfiles.avatarUrl,
      progress: challengeParticipants.currentProgress,
      joinedAt: challengeParticipants.joinedAt,
    })
    .from(challengeParticipants)
    .innerJoin(users, eq(challengeParticipants.userId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .where(eq(challengeParticipants.challengeId, challengeId))
    .orderBy(desc(challengeParticipants.currentProgress));

  return {
    ...challenge[0],
    participants,
  };
}
