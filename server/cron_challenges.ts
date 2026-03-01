import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { logger } from "./middleware/logger";

type ExpiredChallengeRow = {
  id: number;
  name: string;
  objective: string | null;
  badge_name: string | null;
  badge_image_url: string | null;
};

type WinnerRow = {
  user_id: number;
  current_progress: number;
};

type LockRow = {
  acquired: unknown;
};

const log = logger.child({ component: "cron_challenges" });
const COMPLETE_CHALLENGES_LOCK_KEY = "cron:complete_challenges";
const CHALLENGE_WINNER_XP = 500;

function asDbBoolean(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}

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
    return await db.transaction(async (tx) => {
      const lockResult = await tx.execute(sql`
        SELECT pg_try_advisory_xact_lock(hashtext(${COMPLETE_CHALLENGES_LOCK_KEY})) AS acquired
      `);
      const lockRow = lockResult.rows[0] as unknown as LockRow | undefined;
      if (!asDbBoolean(lockRow?.acquired)) {
        log.info("[Cron] completeChallenges skipped: lock not acquired", {
          event: "cron:complete_challenges_skipped_lock",
        });
        return { completed: 0, winners: 0 };
      }

      const expiredChallengesResult = await tx.execute(sql`
        SELECT id, name, objective, badge_name, badge_image_url
        FROM challenges
        WHERE status = 'active'
          AND end_date < NOW()
        FOR UPDATE SKIP LOCKED
      `);

      const expiredChallenges = expiredChallengesResult.rows as unknown as ExpiredChallengeRow[];
      let completedCount = 0;
      let winnersCount = 0;

      for (const challenge of expiredChallenges) {
        const winnerResult = await tx.execute(sql`
          SELECT user_id, current_progress
          FROM challenge_participants
          WHERE challenge_id = ${challenge.id}
          ORDER BY current_progress DESC, joined_at ASC
          LIMIT 1
        `);

        const winner = winnerResult.rows[0] as unknown as WinnerRow | undefined;

        if (winner && Number(winner.current_progress) > 0) {
          await tx.execute(sql`
            UPDATE challenge_participants
            SET is_winner = true, completed_at = NOW()
            WHERE challenge_id = ${challenge.id}
              AND user_id = ${winner.user_id}
          `);

          let badgeName = "Distance Champion";
          switch (challenge.objective) {
            case "total_sessions":
              badgeName = "Session Master";
              break;
            case "avg_pace":
              badgeName = "Speed Demon";
              break;
            case "total_time":
            case "longest_session":
              badgeName = "Endurance Legend";
              break;
            case "total_distance":
            default:
              badgeName = "Distance Champion";
              break;
          }

          try {
            await tx.execute(sql`
              INSERT INTO user_badges (user_id, badge_id)
              SELECT ${winner.user_id}, id
              FROM badges
              WHERE name = ${badgeName}
              ON CONFLICT (user_id, badge_id) DO NOTHING
            `);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes("not found") || errorMessage.includes("no rows")) {
              log.info("[Cron] Badge not found in database, skipping award", {
                event: "cron:badge_missing",
                badgeName,
                userId: winner.user_id,
                challengeId: challenge.id,
              });
            } else {
              log.warn("[Cron] Unexpected error awarding badge", {
                event: "cron:badge_award_error",
                badgeName,
                userId: winner.user_id,
                challengeId: challenge.id,
                message: errorMessage,
              });
            }
          }

          const xpDescription = `challenge_win:${challenge.id}:winner:${winner.user_id}`;
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${xpDescription}))`);

          const existingReward = await tx.execute(sql`
            SELECT 1
            FROM xp_transactions
            WHERE user_id = ${winner.user_id}
              AND description = ${xpDescription}
            LIMIT 1
          `);

          if (existingReward.rows.length === 0) {
            await tx.execute(sql`
              INSERT INTO xp_transactions (user_id, amount, reason, reference_id, description, created_at)
              VALUES (
                ${winner.user_id},
                ${CHALLENGE_WINNER_XP},
                'bonus'::xp_reason,
                ${challenge.id},
                ${xpDescription},
                NOW()
              )
            `);

            await tx.execute(sql`
              UPDATE swimmer_profiles sp
              SET
                total_xp = sp.total_xp + ${CHALLENGE_WINNER_XP},
                level = COALESCE(
                  (
                    SELECT max(level)
                    FROM level_thresholds
                    WHERE xp_required <= sp.total_xp + ${CHALLENGE_WINNER_XP}
                  ),
                  sp.level
                ),
                updated_at = NOW()
              WHERE sp.user_id = ${winner.user_id}
            `);
          } else {
            log.info("[Cron] Winner XP already awarded, skipping duplicate", {
              event: "cron:winner_xp_duplicate_skipped",
              challengeId: challenge.id,
              userId: winner.user_id,
              description: xpDescription,
            });
          }

          winnersCount++;
        }

        await tx.execute(sql`
          UPDATE challenge_participants
          SET completed_at = NOW()
          WHERE challenge_id = ${challenge.id}
            AND completed_at IS NULL
        `);

        const completedChallenge = await tx.execute(sql`
          UPDATE challenges
          SET status = 'completed'::challenge_status
          WHERE id = ${challenge.id}
            AND status = 'active'
          RETURNING id
        `);
        if (completedChallenge.rows.length > 0) {
          completedCount++;
        }
      }

      log.info("[Cron] Completed challenges", {
        event: "cron:complete_challenges_ok",
        completedCount,
        winnersCount,
        expiredActiveChallenges: expiredChallenges.length,
      });
      return { completed: completedCount, winners: winnersCount };
    });
  } catch (error) {
    // Log error with proper message extraction
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error("[Cron] Error completing challenges", {
      event: "cron:complete_challenges_error",
      message: errorMessage,
      stack: errorStack,
    });
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
    // Log error with proper message extraction
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    log.error("[Cron] Error triggering challenge completion", {
      event: "cron:trigger_completion_error",
      challengeId,
      message: errorMessage,
      stack: errorStack,
    });
    return false;
  }
}
