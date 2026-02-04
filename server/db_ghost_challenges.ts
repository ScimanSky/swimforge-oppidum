import { sql } from "drizzle-orm";
import { getDb } from "./db";

const computePacePer100 = (
  distanceMeters?: number | null,
  durationSeconds?: number | null,
  fallback?: number | null
) => {
  if (fallback && fallback > 0) return Math.round(fallback);
  if (!distanceMeters || !durationSeconds || distanceMeters <= 0) return null;
  return Math.round(durationSeconds / (distanceMeters / 100));
};

const compareMetrics = (input: {
  challengerDistance?: number | null;
  challengerDuration?: number | null;
  challengerPace?: number | null;
  opponentDistance?: number | null;
  opponentDuration?: number | null;
  opponentPace?: number | null;
  challengerUserId: number;
  opponentUserId: number;
}) => {
  let challengerScore = 0;
  let opponentScore = 0;

  const hasDistance =
    input.challengerDistance !== null &&
    input.challengerDistance !== undefined &&
    input.opponentDistance !== null &&
    input.opponentDistance !== undefined;
  const hasDuration =
    input.challengerDuration !== null &&
    input.challengerDuration !== undefined &&
    input.opponentDuration !== null &&
    input.opponentDuration !== undefined;
  const hasPace =
    input.challengerPace !== null &&
    input.challengerPace !== undefined &&
    input.opponentPace !== null &&
    input.opponentPace !== undefined;

  if (hasDistance) {
    if ((input.challengerDistance ?? 0) > (input.opponentDistance ?? 0)) challengerScore += 1;
    if ((input.opponentDistance ?? 0) > (input.challengerDistance ?? 0)) opponentScore += 1;
  }
  if (hasDuration) {
    if ((input.challengerDuration ?? 0) < (input.opponentDuration ?? 0)) challengerScore += 1;
    if ((input.opponentDuration ?? 0) < (input.challengerDuration ?? 0)) opponentScore += 1;
  }
  if (hasPace) {
    if ((input.challengerPace ?? 0) < (input.opponentPace ?? 0)) challengerScore += 1;
    if ((input.opponentPace ?? 0) < (input.challengerPace ?? 0)) opponentScore += 1;
  }

  if (challengerScore > opponentScore) {
    return {
      winnerUserId: input.challengerUserId,
      winnerReason: "metric_mix",
    };
  }

  if (opponentScore > challengerScore) {
    return {
      winnerUserId: input.opponentUserId,
      winnerReason: "metric_mix",
    };
  }

  if (hasDistance) {
    const challengerDistance = input.challengerDistance ?? 0;
    const opponentDistance = input.opponentDistance ?? 0;
    const maxDistance = Math.max(challengerDistance, opponentDistance, 1);
    const diffRatio = Math.abs(challengerDistance - opponentDistance) / maxDistance;
    if (diffRatio <= 0.01) {
      if (hasDuration) {
        if ((input.challengerDuration ?? 0) < (input.opponentDuration ?? 0)) {
          return { winnerUserId: input.challengerUserId, winnerReason: "duration" };
        }
        if ((input.opponentDuration ?? 0) < (input.challengerDuration ?? 0)) {
          return { winnerUserId: input.opponentUserId, winnerReason: "duration" };
        }
      }
      if (hasPace) {
        if ((input.challengerPace ?? 0) < (input.opponentPace ?? 0)) {
          return { winnerUserId: input.challengerUserId, winnerReason: "pace" };
        }
        if ((input.opponentPace ?? 0) < (input.challengerPace ?? 0)) {
          return { winnerUserId: input.opponentUserId, winnerReason: "pace" };
        }
      }
    }

    if (challengerDistance > opponentDistance) {
      return { winnerUserId: input.challengerUserId, winnerReason: "distance" };
    }
    if (opponentDistance > challengerDistance) {
      return { winnerUserId: input.opponentUserId, winnerReason: "distance" };
    }
  }

  return { winnerUserId: null, winnerReason: "draw" };
};

export async function createGhostChallengeFromPost(userId: number, postId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const postResult = await db.execute(sql`
    SELECT
      p.id,
      p.user_id,
      p.club_id,
      p.activity_id,
      a.distance_meters,
      a.duration_seconds,
      a.avg_pace_per_100m,
      a.is_open_water
    FROM social_posts p
    JOIN swimming_activities a ON a.id = p.activity_id
    WHERE p.id = ${postId} AND p.is_deleted = false
    LIMIT 1
  `);

  const post = postResult.rows[0] as any;
  if (!post) {
    throw new Error("Post non trovato o senza attivita collegata");
  }
  if (post.user_id === userId) {
    throw new Error("Non puoi sfidare la tua stessa attivita");
  }

  const opponentActivity = {
    id: post.activity_id as number,
    userId: post.user_id as number,
    distanceMeters: post.distance_meters as number | null,
    durationSeconds: post.duration_seconds as number | null,
    pacePer100m: post.avg_pace_per_100m as number | null,
    isOpenWater: post.is_open_water as boolean | null,
  };

  const challengerResult = await db.execute(sql`
    SELECT
      id,
      user_id,
      distance_meters,
      duration_seconds,
      avg_pace_per_100m,
      is_open_water
    FROM swimming_activities
    WHERE user_id = ${userId}
      AND is_open_water = ${opponentActivity.isOpenWater}
    ORDER BY activity_date DESC
    LIMIT 1
  `);

  let challenger = challengerResult.rows[0] as any;

  if (!challenger) {
    const fallback = await db.execute(sql`
      SELECT
        id,
        user_id,
        distance_meters,
        duration_seconds,
        avg_pace_per_100m,
        is_open_water
      FROM swimming_activities
      WHERE user_id = ${userId}
      ORDER BY activity_date DESC
      LIMIT 1
    `);
    challenger = fallback.rows[0] as any;
  }

  if (!challenger) {
    throw new Error("Non hai ancora attivita da usare per la sfida");
  }

  const challengerDistance = challenger.distance_meters as number | null;
  const challengerDuration = challenger.duration_seconds as number | null;
  const challengerPace = computePacePer100(
    challengerDistance,
    challengerDuration,
    challenger.avg_pace_per_100m as number | null
  );

  const opponentDistance = opponentActivity.distanceMeters;
  const opponentDuration = opponentActivity.durationSeconds;
  const opponentPace = computePacePer100(
    opponentDistance,
    opponentDuration,
    opponentActivity.pacePer100m
  );

  const outcome = compareMetrics({
    challengerDistance,
    challengerDuration,
    challengerPace,
    opponentDistance,
    opponentDuration,
    opponentPace,
    challengerUserId: userId,
    opponentUserId: opponentActivity.userId,
  });

  const inserted = await db.execute(sql`
    INSERT INTO ghost_challenges (
      club_id,
      challenger_user_id,
      challenger_activity_id,
      opponent_user_id,
      opponent_activity_id,
      status,
      winner_user_id,
      winner_reason,
      challenger_distance_meters,
      challenger_duration_seconds,
      challenger_pace_per_100m,
      opponent_distance_meters,
      opponent_duration_seconds,
      opponent_pace_per_100m,
      created_at
    ) VALUES (
      ${post.club_id ?? null},
      ${userId},
      ${challenger.id},
      ${opponentActivity.userId},
      ${opponentActivity.id},
      ${outcome.winnerUserId ? "completed" : "draw"},
      ${outcome.winnerUserId},
      ${outcome.winnerReason},
      ${challengerDistance},
      ${challengerDuration},
      ${challengerPace},
      ${opponentDistance},
      ${opponentDuration},
      ${opponentPace},
      ${new Date()}
    )
    RETURNING id
  `);

  return inserted.rows[0] as { id: number } | undefined;
}

export async function listGhostChallenges(userId: number, clubId?: number | null) {
  const db = await getDb();
  if (!db) return [];

  const filters = [
    sql`(gc.challenger_user_id = ${userId} OR gc.opponent_user_id = ${userId})`,
  ];
  if (clubId) {
    filters.push(sql`gc.club_id = ${clubId}`);
  }
  const whereClause = sql.join(filters, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      gc.*,
      c.name AS club_name,
      u1.name AS challenger_name,
      u1.email AS challenger_email,
      sp1.avatar_url AS challenger_avatar,
      u2.name AS opponent_name,
      u2.email AS opponent_email,
      sp2.avatar_url AS opponent_avatar,
      a1.activity_date AS challenger_date,
      a2.activity_date AS opponent_date
    FROM ghost_challenges gc
    LEFT JOIN community_clubs c ON c.id = gc.club_id
    JOIN users u1 ON u1.id = gc.challenger_user_id
    JOIN users u2 ON u2.id = gc.opponent_user_id
    LEFT JOIN swimmer_profiles sp1 ON sp1.user_id = u1.id
    LEFT JOIN swimmer_profiles sp2 ON sp2.user_id = u2.id
    LEFT JOIN swimming_activities a1 ON a1.id = gc.challenger_activity_id
    LEFT JOIN swimming_activities a2 ON a2.id = gc.opponent_activity_id
    WHERE ${whereClause}
    ORDER BY gc.created_at DESC
    LIMIT 50
  `);

  return result.rows;
}
