import { sql } from "drizzle-orm";
import { getDb } from "./db";

/**
 * Cron job to complete expired challenges and determine winners
 * Should be run every hour or daily
 */
export async function completeChallenges(): Promise<{
  completed: number;
  winners: number;
}> {
  const db = await getDb();
  if (!db) return { completed: 0, winners: 0 };

  try {
    // Find all active challenges that have ended
    const expiredChallengesResult = await db.execute(sql`
      SELECT id, name, badge_name, badge_image_url
      FROM challenges
      WHERE status = 'active'
        AND end_date < NOW()
    `);

    const expiredChallenges = expiredChallengesResult.rows as any[];
    let completedCount = 0;
    let winnersCount = 0;

    for (const challenge of expiredChallenges) {
      // Get top participant (winner)
      const winnerResult = await db.execute(sql`
        SELECT user_id, current_progress
        FROM challenge_participants
        WHERE challenge_id = ${challenge.id}
        ORDER BY current_progress DESC, joined_at ASC
        LIMIT 1
      `);

      const winner = (winnerResult.rows[0] as any);

      if (winner && winner.current_progress > 0) {
        // Mark winner
        await db.execute(sql`
          UPDATE challenge_participants
          SET is_winner = true, completed_at = NOW()
          WHERE challenge_id = ${challenge.id}
            AND user_id = ${winner.user_id}
        `);

        // Award epic challenge badge to winner
        // Determine badge based on challenge objective
        let badgeName = 'Distance Champion';
        switch (challenge.objective) {
          case 'total_sessions':
            badgeName = 'Session Master';
            break;
          case 'avg_pace':
            badgeName = 'Speed Demon';
            break;
          case 'total_time':
          case 'longest_session':
            badgeName = 'Endurance Legend';
            break;
          case 'total_distance':
          default:
            badgeName = 'Distance Champion';
            break;
        }

        // Try to award badge if it exists in database
        try {
          await db.execute(sql`
            INSERT INTO user_badges (user_id, badge_id)
            SELECT ${winner.user_id}, id
            FROM badges
            WHERE name = ${badgeName}
            ON CONFLICT (user_id, badge_id) DO NOTHING
          `);
        } catch (error) {
          console.log(`[Cron] Badge ${badgeName} not found in database, skipping award`);
        }

        // Award bonus XP to winner (500 XP)
        await db.execute(sql`
          UPDATE users
          SET total_xp = total_xp + 500
          WHERE id = ${winner.user_id}
        `);

        winnersCount++;
      }

      // Mark all participants as completed
      await db.execute(sql`
        UPDATE challenge_participants
        SET completed_at = NOW()
        WHERE challenge_id = ${challenge.id}
          AND completed_at IS NULL
      `);

      // Update challenge status to completed
      await db.execute(sql`
        UPDATE challenges
        SET status = 'completed'::challenge_status
        WHERE id = ${challenge.id}
      `);

      completedCount++;
    }

    console.log(`[Cron] Completed ${completedCount} challenges, ${winnersCount} winners determined`);
    return { completed: completedCount, winners: winnersCount };
  } catch (error) {
    console.error("[Cron] Error completing challenges:", error);
    return { completed: 0, winners: 0 };
  }
}

/**
 * Manually trigger challenge completion (for testing or admin)
 */
export async function triggerChallengeCompletion(challengeId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Force update challenge end_date to now
    await db.execute(sql`
      UPDATE challenges
      SET end_date = NOW() - INTERVAL '1 second'
      WHERE id = ${challengeId}
    `);

    // Run completion logic
    await completeChallenges();
    return true;
  } catch (error) {
    console.error("[Cron] Error triggering challenge completion:", error);
    return false;
  }
}
