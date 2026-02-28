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

type GhostChallengeActivity = {
  id: number;
  userId: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  pacePer100m: number | null;
  isOpenWater: boolean | null;
  activityDate?: Date | null;
  lapsCount?: number | null;
  strokeType?: string | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
};

type GhostChallengeContext = {
  postId: number;
  clubId: number | null;
  opponent: GhostChallengeActivity;
  challenger: GhostChallengeActivity;
  outcome: { winnerUserId: number | null; winnerReason: string };
};

export async function getGhostChallengeContextFromPost(
  userId: number,
  postId: number
): Promise<GhostChallengeContext> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const postResult = await db.execute(sql`
    SELECT
      p.id,
      p.user_id,
      p.club_id,
      p.visibility,
      p.activity_id,
      a.distance_meters,
      a.duration_seconds,
      a.avg_pace_per_100m,
      a.is_open_water,
      a.activity_date,
      a.laps_count,
      a.stroke_type,
      a.avg_heart_rate,
      a.max_heart_rate
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

  const alreadyChallenged = await db.execute(sql`
    SELECT 1
    FROM ghost_challenges
    WHERE challenger_user_id = ${userId}
      AND opponent_activity_id = ${post.activity_id}
    LIMIT 1
  `);
  if (alreadyChallenged.rows.length > 0) {
    throw new Error("Hai gia sfidato questa sessione");
  }

  if (post.club_id) {
    const membership = await db.execute(sql`
      SELECT 1
      FROM community_club_members
      WHERE club_id = ${post.club_id}
        AND user_id = ${userId}
        AND status = 'active'
      LIMIT 1
    `);
    if (!membership.rows.length) {
      throw new Error("Non hai accesso a questa attivita");
    }
  } else if (post.visibility !== "public") {
    throw new Error("Attivita non pubblica");
  }

  const opponentActivity: GhostChallengeActivity = {
    id: post.activity_id as number,
    userId: post.user_id as number,
    distanceMeters: post.distance_meters as number | null,
    durationSeconds: post.duration_seconds as number | null,
    pacePer100m: post.avg_pace_per_100m as number | null,
    isOpenWater: post.is_open_water as boolean | null,
    activityDate: post.activity_date as Date | null,
    lapsCount: post.laps_count as number | null,
    strokeType: post.stroke_type as string | null,
    avgHeartRate: post.avg_heart_rate as number | null,
    maxHeartRate: post.max_heart_rate as number | null,
  };

  const challengerResult = await db.execute(sql`
    SELECT
      id,
      user_id,
      distance_meters,
      duration_seconds,
      avg_pace_per_100m,
      is_open_water,
      activity_date,
      laps_count,
      stroke_type,
      avg_heart_rate,
      max_heart_rate
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
        is_open_water,
        activity_date,
        laps_count,
        stroke_type,
        avg_heart_rate,
        max_heart_rate
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

  return {
    postId,
    clubId: post.club_id ?? null,
    opponent: opponentActivity,
    challenger: {
      id: challenger.id as number,
      userId: challenger.user_id as number,
      distanceMeters: challengerDistance,
      durationSeconds: challengerDuration,
      pacePer100m: challengerPace,
      isOpenWater: challenger.is_open_water as boolean | null,
      activityDate: challenger.activity_date as Date | null,
      lapsCount: challenger.laps_count as number | null,
      strokeType: challenger.stroke_type as string | null,
      avgHeartRate: challenger.avg_heart_rate as number | null,
      maxHeartRate: challenger.max_heart_rate as number | null,
    },
    outcome,
  };
}

export async function createGhostChallengeFromPost(userId: number, postId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const context = await getGhostChallengeContextFromPost(userId, postId);

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
      ${context.clubId},
      ${userId},
      ${context.challenger.id},
      ${context.opponent.userId},
      ${context.opponent.id},
      ${context.outcome.winnerUserId ? "completed" : "draw"},
      ${context.outcome.winnerUserId},
      ${context.outcome.winnerReason},
      ${context.challenger.distanceMeters},
      ${context.challenger.durationSeconds},
      ${context.challenger.pacePer100m},
      ${context.opponent.distanceMeters},
      ${context.opponent.durationSeconds},
      ${context.opponent.pacePer100m},
      ${new Date()}
    )
    RETURNING id
  `);

  const row = inserted.rows[0] as { id: number } | undefined;
  if (!row) return undefined;
  return { id: row.id, ...context };
}

export async function listGhostTrackFriends(userId: number, search?: string) {
  const db = await getDb();
  if (!db) return [];

  const normalizedSearch = search?.trim().toLowerCase();

  const filters = [sql`u.id <> ${userId}`];
  if (normalizedSearch) {
    filters.push(sql`LOWER(COALESCE(u.name, u.email)) LIKE ${`%${normalizedSearch}%`}`);
  }
  const whereClause = sql.join(filters, sql` AND `);

  const result = await db.execute(sql`
    WITH visible_posts AS (
      SELECT p.user_id, p.activity_id
      FROM social_posts p
      WHERE p.is_deleted = false
        AND p.activity_id IS NOT NULL
        AND (
          (p.club_id IS NULL AND p.visibility = 'public')
          OR (
            p.club_id IN (
              SELECT club_id
              FROM community_club_members
              WHERE user_id = ${userId} AND status = 'active'
            )
          )
        )
    ),
    challenge_stats AS (
      SELECT
        user_id,
        SUM(CASE WHEN winner_user_id = user_id THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN winner_user_id IS NOT NULL AND winner_user_id <> user_id THEN 1 ELSE 0 END) AS losses,
        COUNT(*) AS total
      FROM (
        SELECT challenger_user_id AS user_id, winner_user_id FROM ghost_challenges
        UNION ALL
        SELECT opponent_user_id AS user_id, winner_user_id FROM ghost_challenges
      ) AS combined
      GROUP BY user_id
    )
    SELECT
      u.id,
      u.name,
      u.email,
      sp.avatar_url,
      COUNT(DISTINCT vp.activity_id) AS total_sessions,
      AVG(a.avg_pace_per_100m) AS avg_pace_per_100m,
      COALESCE(cs.wins, 0) AS wins,
      COALESCE(cs.losses, 0) AS losses,
      COALESCE(cs.total, 0) AS total_challenges
    FROM visible_posts vp
    JOIN users u ON u.id = vp.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    LEFT JOIN swimming_activities a ON a.id = vp.activity_id
    LEFT JOIN challenge_stats cs ON cs.user_id = u.id
    WHERE ${whereClause}
    GROUP BY u.id, u.name, u.email, sp.avatar_url, cs.wins, cs.losses, cs.total
    ORDER BY total_sessions DESC
    LIMIT 100
  `);

  return result.rows;
}

export async function listGhostTrackSessions(
  userId: number,
  friendUserId: number
) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT
      p.id AS post_id,
      p.club_id,
      p.visibility,
      a.id AS activity_id,
      a.activity_date,
      a.distance_meters,
      a.duration_seconds,
      a.avg_pace_per_100m,
      a.laps_count,
      a.stroke_type,
      a.is_open_water
    FROM social_posts p
    JOIN swimming_activities a ON a.id = p.activity_id
    WHERE p.user_id = ${friendUserId}
      AND p.is_deleted = false
      AND p.activity_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM ghost_challenges gc
        WHERE gc.challenger_user_id = ${userId}
          AND gc.opponent_activity_id = a.id
      )
      AND (
        (p.club_id IS NULL AND p.visibility = 'public')
        OR (
          p.club_id IN (
            SELECT club_id
            FROM community_club_members
            WHERE user_id = ${userId} AND status = 'active'
          )
        )
      )
    ORDER BY a.activity_date DESC
    LIMIT 50
  `);

  return result.rows;
}

export async function listGhostTrackLeaderboard(limit = 5) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    WITH stats AS (
      SELECT
        user_id,
        SUM(CASE WHEN winner_user_id = user_id THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN winner_user_id IS NOT NULL AND winner_user_id <> user_id THEN 1 ELSE 0 END) AS losses,
        COUNT(*) AS total
      FROM (
        SELECT challenger_user_id AS user_id, winner_user_id FROM ghost_challenges
        UNION ALL
        SELECT opponent_user_id AS user_id, winner_user_id FROM ghost_challenges
      ) AS combined
      GROUP BY user_id
    )
    SELECT
      u.id,
      u.name,
      u.email,
      sp.avatar_url,
      s.wins,
      s.losses,
      s.total
    FROM stats s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    ORDER BY s.wins DESC, s.total DESC
    LIMIT ${limit}
  `);

  return result.rows;
}

export async function getGhostTrackLaps(activityIds: number[]) {
  const db = await getDb();
  if (!db) return {};

  if (!activityIds.length) return {};

  const activityIdParams = activityIds.map((id) => sql`${id}`);

  const result = await db.execute(sql`
    SELECT
      activity_id,
      lap_index,
      distance_meters,
      duration_seconds,
      average_swolf,
      average_swim_cadence,
      avg_heart_rate,
      max_heart_rate,
      calories,
      stroke_type
    FROM garmin_activity_laps
    WHERE activity_id IN (${sql.join(activityIdParams, sql`, `)})
    ORDER BY activity_id, lap_index
  `);

  const grouped: Record<number, any[]> = {};
  for (const row of result.rows as any[]) {
    const activityId = Number(row.activity_id);
    if (!grouped[activityId]) grouped[activityId] = [];
    grouped[activityId].push({
      lapIndex: row.lap_index,
      distanceMeters: row.distance_meters,
      durationSeconds: row.duration_seconds,
      averageSwolf: row.average_swolf,
      averageSwimCadence: row.average_swim_cadence,
      avgHeartRate: row.avg_heart_rate,
      maxHeartRate: row.max_heart_rate,
      calories: row.calories,
      strokeType: row.stroke_type,
    });
  }

  return grouped;
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
