import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";

// Types for challenges
export type ChallengeType = "pool" | "open_water" | "both";
export type ChallengeObjective = "total_distance" | "total_sessions" | "consistency" | "avg_pace" | "total_time" | "longest_session";
export type ChallengeStatus = "pending" | "active" | "completed" | "cancelled";
export type ChallengeDuration = "3_days" | "1_week" | "2_weeks" | "1_month";

export interface Challenge {
  id: number;
  name: string;
  description: string | null;
  creatorId: number;
  type: ChallengeType;
  objective: ChallengeObjective;
  duration: ChallengeDuration;
  startDate: Date;
  endDate: Date;
  status: ChallengeStatus;
  minParticipants: number;
  maxParticipants: number;
  badgeImageUrl: string | null;
  badgeName: string | null;
  prizeDescription: string | null;
  rules: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChallengeParticipant {
  id: number;
  challengeId: number;
  userId: number;
  joinedAt: Date;
  currentProgress: number;
  currentRank: number;
  isWinner: boolean;
  completedAt: Date | null;
  stats: any;
}

// ============================================
// CHALLENGE QUERIES
// ============================================

/**
 * Create a new challenge
 */
export async function createChallenge(data: {
  name: string;
  description?: string;
  creatorId: number;
  type: ChallengeType;
  objective: ChallengeObjective;
  duration: ChallengeDuration;
  startDate: Date;
  badgeImageUrl?: string;
  badgeName?: string;
  prizeDescription?: string;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  // Calculate end date based on duration
  const endDate = new Date(data.startDate);
  switch (data.duration) {
    case "3_days":
      endDate.setDate(endDate.getDate() + 3);
      break;
    case "1_week":
      endDate.setDate(endDate.getDate() + 7);
      break;
    case "2_weeks":
      endDate.setDate(endDate.getDate() + 14);
      break;
    case "1_month":
      endDate.setMonth(endDate.getMonth() + 1);
      break;
  }

  // Determine initial status based on start date
  const now = new Date();
  const initialStatus = data.startDate <= now ? 'active' : 'pending';

  const result = await db.execute(sql`
    INSERT INTO challenges (
      name, description, creator_id, type, objective, duration,
      start_date, end_date, status, badge_image_url, badge_name, prize_description
    ) VALUES (
      ${data.name}, ${data.description || null}, ${data.creatorId}, ${data.type}, ${data.objective},
      ${data.duration}, ${data.startDate}, ${endDate}, ${initialStatus}::challenge_status, ${data.badgeImageUrl || null},
      ${data.badgeName || null}, ${data.prizeDescription || null}
    ) RETURNING id
  `);

  const challengeId = (result.rows[0] as any)?.id;
  
  // Automatically add creator as participant
  if (challengeId) {
    await db.execute(sql`
      INSERT INTO challenge_participants (challenge_id, user_id)
      VALUES (${challengeId}, ${data.creatorId})
    `);
  }

  return challengeId || null;
}

/**
 * Get active challenges for a user
 */
export async function getActiveChallenges(userId: number): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  // Log challenges before update
  const beforeUpdate = await db.execute(sql`SELECT id, name, start_date, end_date, status, duration FROM challenges`);
  console.log('[getActiveChallenges] BEFORE UPDATE:', JSON.stringify(beforeUpdate.rows, null, 2));

  // Auto-update challenge statuses based on dates
  await db.execute(sql`
    UPDATE challenges
    SET status = CASE
      WHEN start_date <= NOW() AND (end_date IS NULL OR end_date >= NOW()) THEN 'active'::challenge_status
      WHEN end_date IS NOT NULL AND end_date < NOW() THEN 'completed'::challenge_status
      ELSE 'pending'::challenge_status
    END
    WHERE status != 'completed'::challenge_status
  `);

  // Log challenges after update
  const afterUpdate = await db.execute(sql`SELECT id, name, start_date, end_date, status, duration FROM challenges`);
  console.log('[getActiveChallenges] AFTER UPDATE:', JSON.stringify(afterUpdate.rows, null, 2));

  const result = await db.execute(sql`
    SELECT 
      c.*,
      cp.current_progress,
      cp.current_rank,
      CASE WHEN cp.user_id IS NOT NULL THEN true ELSE false END as "isParticipant",
      (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = c.id) as "participantCount",
      (SELECT json_agg(json_build_object(
        'userId', user_id,
        'progress', current_progress,
        'rank', current_rank
      ) ORDER BY current_progress DESC)
      FROM challenge_participants WHERE challenge_id = c.id) as leaderboard
    FROM challenges c
    LEFT JOIN challenge_participants cp ON c.id = cp.challenge_id AND cp.user_id = ${userId}
    WHERE c.status IN ('pending', 'active')
    ORDER BY c.start_date DESC
  `);

  return result.rows as any[];
}

/**
 * Join a challenge
 */
export async function joinChallenge(challengeId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.execute(sql`
      INSERT INTO challenge_participants (challenge_id, user_id)
      VALUES (${challengeId}, ${userId})
      ON CONFLICT (challenge_id, user_id) DO NOTHING
    `);
    return true;
  } catch (error) {
    console.error("Error joining challenge:", error);
    return false;
  }
}

/**
 * Leave a challenge
 */
export async function leaveChallenge(challengeId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.execute(sql`
      DELETE FROM challenge_participants
      WHERE challenge_id = ${challengeId} AND user_id = ${userId}
    `);
    return true;
  } catch (error) {
    console.error("Error leaving challenge:", error);
    return false;
  }
}

/**
 * Update challenge progress for a user
 */
export async function updateChallengeProgress(
  challengeId: number,
  userId: number,
  progress: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    await db.execute(sql`
      UPDATE challenge_participants
      SET current_progress = ${progress}
      WHERE challenge_id = ${challengeId} AND user_id = ${userId}
    `);
    return true;
  } catch (error) {
    console.error("Error updating challenge progress:", error);
    return false;
  }
}

/**
 * Calculate challenge progress for all participants
 */
export async function calculateChallengeProgress(challengeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get challenge details
  const challengeResult = await db.execute(sql`
    SELECT * FROM challenges WHERE id = ${challengeId}
  `);
  const challenge = challengeResult.rows[0] as any;
  if (!challenge) return;

  // Get all participants
  const participantsResult = await db.execute(sql`
    SELECT user_id FROM challenge_participants WHERE challenge_id = ${challengeId}
  `);
  const participants = participantsResult.rows as any[];

  for (const participant of participants) {
    let progress = 0;

    // Calculate progress based on objective
    switch (challenge.objective as ChallengeObjective) {
      case "total_distance": {
        const result = await db.execute(sql`
          SELECT COALESCE(SUM(distance_meters), 0) as total
          FROM swimming_activities
          WHERE user_id = ${participant.user_id}
            AND activity_date >= ${challenge.start_date}
            AND activity_date <= ${challenge.end_date}
            AND (${challenge.type === "both"} OR 
                 (${challenge.type === "pool"} AND is_open_water = false) OR
                 (${challenge.type === "open_water"} AND is_open_water = true))
        `);
        progress = (result.rows[0] as any)?.total || 0;
        break;
      }

      case "total_sessions": {
        const result = await db.execute(sql`
          SELECT COUNT(*) as total
          FROM swimming_activities
          WHERE user_id = ${participant.user_id}
            AND activity_date >= ${challenge.start_date}
            AND activity_date <= ${challenge.end_date}
            AND (${challenge.type === "both"} OR 
                 (${challenge.type === "pool"} AND is_open_water = false) OR
                 (${challenge.type === "open_water"} AND is_open_water = true))
        `);
        progress = (result.rows[0] as any)?.total || 0;
        break;
      }

      case "total_time": {
        const result = await db.execute(sql`
          SELECT COALESCE(SUM(duration_seconds), 0) as total
          FROM swimming_activities
          WHERE user_id = ${participant.user_id}
            AND activity_date >= ${challenge.start_date}
            AND activity_date <= ${challenge.end_date}
            AND (${challenge.type === "both"} OR 
                 (${challenge.type === "pool"} AND is_open_water = false) OR
                 (${challenge.type === "open_water"} AND is_open_water = true))
        `);
        progress = (result.rows[0] as any)?.total || 0;
        break;
      }

      case "longest_session": {
        const result = await db.execute(sql`
          SELECT COALESCE(MAX(distance_meters), 0) as total
          FROM swimming_activities
          WHERE user_id = ${participant.user_id}
            AND activity_date >= ${challenge.start_date}
            AND activity_date <= ${challenge.end_date}
            AND (${challenge.type === "both"} OR 
                 (${challenge.type === "pool"} AND is_open_water = false) OR
                 (${challenge.type === "open_water"} AND is_open_water = true))
        `);
        progress = (result.rows[0] as any)?.total || 0;
        break;
      }

      case "consistency": {
        const result = await db.execute(sql`
          SELECT COUNT(DISTINCT DATE(activity_date)) as total
          FROM swimming_activities
          WHERE user_id = ${participant.user_id}
            AND activity_date >= ${challenge.start_date}
            AND activity_date <= ${challenge.end_date}
            AND (${challenge.type === "both"} OR 
                 (${challenge.type === "pool"} AND is_open_water = false) OR
                 (${challenge.type === "open_water"} AND is_open_water = true))
        `);
        progress = (result.rows[0] as any)?.total || 0;
        break;
      }

      case "avg_pace": {
        const result = await db.execute(sql`
          SELECT COALESCE(AVG(avg_pace_per_100m), 0) as total
          FROM swimming_activities
          WHERE user_id = ${participant.user_id}
            AND activity_date >= ${challenge.start_date}
            AND activity_date <= ${challenge.end_date}
            AND avg_pace_per_100m IS NOT NULL
            AND (${challenge.type === "both"} OR 
                 (${challenge.type === "pool"} AND is_open_water = false) OR
                 (${challenge.type === "open_water"} AND is_open_water = true))
        `);
        // For avg_pace, lower is better, so invert
        progress = (result.rows[0] as any)?.total || 0;
        break;
      }
    }

    // Update progress
    await updateChallengeProgress(challengeId, participant.user_id, progress);
  }

  // Update rankings
  await db.execute(sql`
    WITH ranked AS (
      SELECT 
        user_id,
        ROW_NUMBER() OVER (ORDER BY current_progress DESC) as rank
      FROM challenge_participants
      WHERE challenge_id = ${challengeId}
    )
    UPDATE challenge_participants cp
    SET current_rank = ranked.rank
    FROM ranked
    WHERE cp.challenge_id = ${challengeId} AND cp.user_id = ranked.user_id
  `);
}

/**
 * Complete a challenge and award winners
 */
export async function completeChallenge(challengeId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Mark challenge as completed
  await db.execute(sql`
    UPDATE challenges
    SET status = 'completed', updated_at = NOW()
    WHERE id = ${challengeId}
  `);

  // Mark winner (rank 1)
  await db.execute(sql`
    UPDATE challenge_participants
    SET is_winner = true, completed_at = NOW()
    WHERE challenge_id = ${challengeId} AND current_rank = 1
  `);
}
