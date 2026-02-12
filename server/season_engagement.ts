import { and, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  clubEvents,
  communityClubMembers,
  levelThresholds,
  socialComments,
  socialPosts,
  swimmerProfiles,
  swimmingActivities,
  xpTransactions,
} from "../drizzle/schema";

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type ActionXpType = "comment" | "splash" | "reaction" | "rsvp" | "club_post";

type ActionXpRule = {
  xp: number;
};

type PredictionStatus = "pending" | "evaluated" | "expired";

const ACTION_XP_RULES: Record<ActionXpType, ActionXpRule> = {
  comment: { xp: 16 },
  splash: { xp: 10 },
  reaction: { xp: 8 },
  rsvp: { xp: 12 },
  club_post: { xp: 20 },
};

const ACTION_XP_DAILY_CAP = 90;
const CLUB_QUEST_CODE = "club-quest-weekly-v1";
const CLUB_QUEST_XP_REWARD = 180;

let schemaReadyPromise: Promise<void> | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  const start = startOfUtcDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function startOfUtcWeek(date: Date): Date {
  const dayStart = startOfUtcDay(date);
  const day = dayStart.getUTCDay(); // 0=Sunday
  const diffFromMonday = (day + 6) % 7;
  dayStart.setUTCDate(dayStart.getUTCDate() - diffFromMonday);
  return dayStart;
}

function endOfUtcWeek(date: Date): Date {
  const start = startOfUtcWeek(date);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
}

function toUtcDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function ensureSeasonEngagementSchema(): Promise<void> {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    const db = await getDb();
    if (!db) return;

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS season_activity_predictions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        target_distance_meters INTEGER,
        target_pace_per_100m INTEGER,
        target_duration_seconds INTEGER,
        target_rpe INTEGER,
        note TEXT,
        activity_id INTEGER,
        score INTEGER,
        xp_awarded INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMP
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS season_activity_predictions_user_status_created_idx
      ON season_activity_predictions (user_id, status, created_at DESC)
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS season_club_quest_claims (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        club_id INTEGER NOT NULL,
        week_start DATE NOT NULL,
        quest_code VARCHAR(64) NOT NULL,
        xp_awarded INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, club_id, week_start, quest_code)
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS season_club_quest_claims_user_week_idx
      ON season_club_quest_claims (user_id, week_start)
    `);
  })();

  await schemaReadyPromise;
}

async function applyXpWithUniqueDescription(params: {
  db: DbClient;
  userId: number;
  amount: number;
  description: string;
  referenceId?: number;
}): Promise<{ granted: boolean; newTotalXp: number; newLevel: number }> {
  const { db, userId, amount, description, referenceId } = params;
  if (amount <= 0) {
    const profile = await db
      .select({
        totalXp: swimmerProfiles.totalXp,
        level: swimmerProfiles.level,
      })
      .from(swimmerProfiles)
      .where(eq(swimmerProfiles.userId, userId))
      .limit(1);
    return {
      granted: false,
      newTotalXp: Number(profile[0]?.totalXp ?? 0),
      newLevel: Number(profile[0]?.level ?? 1),
    };
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${description}))`);

    const existing = await tx
      .select({ count: sql<number>`count(*)` })
      .from(xpTransactions)
      .where(and(eq(xpTransactions.userId, userId), eq(xpTransactions.description, description)));

    if (Number(existing[0]?.count ?? 0) > 0) {
      const profile = await tx
        .select({
          totalXp: swimmerProfiles.totalXp,
          level: swimmerProfiles.level,
        })
        .from(swimmerProfiles)
        .where(eq(swimmerProfiles.userId, userId))
        .limit(1);
      return {
        granted: false,
        newTotalXp: Number(profile[0]?.totalXp ?? 0),
        newLevel: Number(profile[0]?.level ?? 1),
      };
    }

    const profile = await tx
      .select({
        totalXp: swimmerProfiles.totalXp,
      })
      .from(swimmerProfiles)
      .where(eq(swimmerProfiles.userId, userId))
      .limit(1);

    const currentTotalXp = Number(profile[0]?.totalXp ?? 0);
    const newTotalXp = currentTotalXp + amount;

    const levelResult = await tx
      .select({
        level: sql<number>`coalesce(max(${levelThresholds.level}), 1)`,
      })
      .from(levelThresholds)
      .where(lte(levelThresholds.xpRequired, newTotalXp));
    const nextLevel = Number(levelResult[0]?.level ?? 1);

    await tx.insert(xpTransactions).values({
      userId,
      amount,
      reason: "bonus",
      referenceId: referenceId ?? null,
      description,
    });

    await tx
      .update(swimmerProfiles)
      .set({
        totalXp: newTotalXp,
        level: nextLevel,
        updatedAt: new Date(),
      })
      .where(eq(swimmerProfiles.userId, userId));

    return {
      granted: true,
      newTotalXp,
      newLevel: nextLevel,
    };
  });
}

async function getActionXpTotalForDay(db: DbClient, userId: number, dayKey: string): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)`,
    })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.userId, userId),
        sql`${xpTransactions.description} LIKE ${`action_xp:${dayKey}:%`}`,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export async function getActionXpStatus(userId: number, now = new Date()) {
  await ensureSeasonEngagementSchema();
  const db = await getDb();
  if (!db) {
    return {
      dayKey: toUtcDateKey(now),
      earnedToday: 0,
      cap: ACTION_XP_DAILY_CAP,
      remaining: ACTION_XP_DAILY_CAP,
    };
  }

  const dayKey = toUtcDateKey(now);
  const earnedToday = await getActionXpTotalForDay(db, userId, dayKey);
  return {
    dayKey,
    earnedToday,
    cap: ACTION_XP_DAILY_CAP,
    remaining: Math.max(0, ACTION_XP_DAILY_CAP - earnedToday),
  };
}

export async function awardActionXp(params: {
  userId: number;
  actionType: ActionXpType;
  entityId: number;
  targetOwnerUserId?: number | null;
  now?: Date;
}) {
  await ensureSeasonEngagementSchema();
  const db = await getDb();
  const now = params.now ?? new Date();
  const dayKey = toUtcDateKey(now);
  const rule = ACTION_XP_RULES[params.actionType];

  if (!db || !rule) {
    return {
      awardedXp: 0,
      reason: "unavailable" as const,
      dayKey,
      earnedToday: 0,
      cap: ACTION_XP_DAILY_CAP,
      remaining: ACTION_XP_DAILY_CAP,
    };
  }

  if (params.targetOwnerUserId && params.targetOwnerUserId === params.userId) {
    const status = await getActionXpStatus(params.userId, now);
    return {
      awardedXp: 0,
      reason: "self_action" as const,
      ...status,
    };
  }

  const uniqueDescription = `action_xp:${dayKey}:${params.actionType}:${params.entityId}`;
  const currentStatus = await getActionXpStatus(params.userId, now);
  const availableXp = Math.max(0, currentStatus.cap - currentStatus.earnedToday);
  const amountToGrant = Math.min(rule.xp, availableXp);

  if (amountToGrant <= 0) {
    return {
      awardedXp: 0,
      reason: "daily_cap_reached" as const,
      ...currentStatus,
    };
  }

  const result = await applyXpWithUniqueDescription({
    db,
    userId: params.userId,
    amount: amountToGrant,
    description: uniqueDescription,
    referenceId: params.entityId,
  });

  const refreshedStatus = await getActionXpStatus(params.userId, now);

  return {
    awardedXp: result.granted ? amountToGrant : 0,
    reason: (result.granted ? "awarded" : "already_awarded_today") as
      | "awarded"
      | "already_awarded_today",
    ...refreshedStatus,
  };
}

function scoreFromRelativeDelta(actual: number, target: number): number {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return 0;
  const deltaRatio = Math.abs(actual - target) / Math.max(target, 1);
  return clamp(Math.round(100 - deltaRatio * 100), 0, 100);
}

function scoreFromRpeDelta(actual: number, target: number): number {
  const delta = Math.abs(actual - target);
  return clamp(Math.round(100 - delta * 14), 0, 100);
}

function xpFromPredictionScore(score: number): number {
  if (score >= 90) return 120;
  if (score >= 75) return 90;
  if (score >= 60) return 60;
  if (score >= 45) return 35;
  return 15;
}

function estimateRpeFromActivity(activity: {
  trainingEffect?: number | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
}): number | null {
  if (activity.trainingEffect && activity.trainingEffect > 0) {
    return clamp(Math.round(activity.trainingEffect / 5), 1, 10);
  }
  if (activity.avgHeartRate && activity.maxHeartRate && activity.maxHeartRate > 0) {
    const ratio = activity.avgHeartRate / activity.maxHeartRate;
    return clamp(Math.round(ratio * 10), 1, 10);
  }
  return null;
}

export async function createSeasonActivityPrediction(params: {
  userId: number;
  targetDistanceMeters?: number | null;
  targetPacePer100m?: number | null;
  targetDurationSeconds?: number | null;
  targetRpe?: number | null;
  note?: string | null;
}) {
  await ensureSeasonEngagementSchema();
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const hasAtLeastOneTarget =
    (params.targetDistanceMeters ?? 0) > 0 ||
    (params.targetPacePer100m ?? 0) > 0 ||
    (params.targetDurationSeconds ?? 0) > 0 ||
    (params.targetRpe ?? 0) > 0;

  if (!hasAtLeastOneTarget) {
    throw new Error("Inserisci almeno un target per creare la previsione.");
  }

  const pendingCountResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count
    FROM season_activity_predictions
    WHERE user_id = ${params.userId}
      AND status = 'pending'
  `);
  const pendingCount = Number((pendingCountResult.rows[0] as { count?: number } | undefined)?.count ?? 0);
  if (pendingCount >= 3) {
    throw new Error("Hai già 3 previsioni in attesa. Valuta una previsione prima di crearne altre.");
  }

  const inserted = await db.execute(sql`
    INSERT INTO season_activity_predictions (
      user_id,
      status,
      target_distance_meters,
      target_pace_per_100m,
      target_duration_seconds,
      target_rpe,
      note
    )
    VALUES (
      ${params.userId},
      'pending',
      ${params.targetDistanceMeters ?? null},
      ${params.targetPacePer100m ?? null},
      ${params.targetDurationSeconds ?? null},
      ${params.targetRpe ?? null},
      ${params.note ?? null}
    )
    RETURNING id, created_at
  `);

  const row = inserted.rows[0] as { id?: number; created_at?: Date } | undefined;
  return {
    id: Number(row?.id ?? 0),
    createdAt: row?.created_at ?? new Date(),
    status: "pending" as PredictionStatus,
  };
}

export async function listSeasonActivityPredictions(userId: number, limit = 12) {
  await ensureSeasonEngagementSchema();
  const db = await getDb();
  if (!db) return [];

  const safeLimit = clamp(Math.floor(limit || 12), 1, 30);
  const result = await db.execute(sql`
    SELECT
      id,
      status,
      target_distance_meters,
      target_pace_per_100m,
      target_duration_seconds,
      target_rpe,
      note,
      activity_id,
      score,
      xp_awarded,
      created_at,
      resolved_at
    FROM season_activity_predictions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `);

  return result.rows.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: Number(row.id ?? 0),
      status: String(row.status ?? "pending") as PredictionStatus,
      targetDistanceMeters: row.target_distance_meters ? Number(row.target_distance_meters) : null,
      targetPacePer100m: row.target_pace_per_100m ? Number(row.target_pace_per_100m) : null,
      targetDurationSeconds: row.target_duration_seconds ? Number(row.target_duration_seconds) : null,
      targetRpe: row.target_rpe ? Number(row.target_rpe) : null,
      note: (row.note as string | null) ?? null,
      activityId: row.activity_id ? Number(row.activity_id) : null,
      score: row.score ? Number(row.score) : null,
      xpAwarded: Number(row.xp_awarded ?? 0),
      createdAt: (row.created_at as Date) ?? null,
      resolvedAt: (row.resolved_at as Date) ?? null,
    };
  });
}

export async function evaluateSeasonPredictionWithActivity(params: {
  userId: number;
  activityId?: number;
}) {
  await ensureSeasonEngagementSchema();
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const pendingResult = await db.execute(sql`
    SELECT *
    FROM season_activity_predictions
    WHERE user_id = ${params.userId}
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  const pending = (pendingResult.rows[0] as Record<string, unknown> | undefined) ?? null;

  if (!pending) {
    return { status: "no_pending" as const };
  }

  let activityRow: Record<string, unknown> | null = null;

  if (params.activityId && params.activityId > 0) {
    const activityResult = await db.execute(sql`
      SELECT *
      FROM swimming_activities
      WHERE id = ${params.activityId}
        AND user_id = ${params.userId}
      LIMIT 1
    `);
    activityRow = (activityResult.rows[0] as Record<string, unknown> | undefined) ?? null;
  } else {
    const createdAt = (pending.created_at as Date) ?? new Date();
    const activityResult = await db.execute(sql`
      SELECT *
      FROM swimming_activities
      WHERE user_id = ${params.userId}
        AND activity_date >= ${createdAt}
      ORDER BY activity_date ASC
      LIMIT 1
    `);
    activityRow = (activityResult.rows[0] as Record<string, unknown> | undefined) ?? null;
  }

  if (!activityRow) {
    return { status: "no_matching_activity" as const };
  }

  const predictionId = Number(pending.id ?? 0);
  const targetDistance = pending.target_distance_meters ? Number(pending.target_distance_meters) : null;
  const targetPace = pending.target_pace_per_100m ? Number(pending.target_pace_per_100m) : null;
  const targetDuration = pending.target_duration_seconds ? Number(pending.target_duration_seconds) : null;
  const targetRpe = pending.target_rpe ? Number(pending.target_rpe) : null;

  const actualDistance = Number(activityRow.distance_meters ?? 0);
  const actualPace = Number(activityRow.avg_pace_per_100m ?? 0);
  const actualDuration = Number(activityRow.duration_seconds ?? 0);
  const estimatedRpe = estimateRpeFromActivity({
    trainingEffect: Number(activityRow.training_effect ?? 0),
    avgHeartRate: Number(activityRow.avg_heart_rate ?? 0),
    maxHeartRate: Number(activityRow.max_heart_rate ?? 0),
  });

  const components: number[] = [];
  if (targetDistance && targetDistance > 0) components.push(scoreFromRelativeDelta(actualDistance, targetDistance));
  if (targetPace && targetPace > 0 && actualPace > 0) components.push(scoreFromRelativeDelta(actualPace, targetPace));
  if (targetDuration && targetDuration > 0) components.push(scoreFromRelativeDelta(actualDuration, targetDuration));
  if (targetRpe && targetRpe > 0 && estimatedRpe) components.push(scoreFromRpeDelta(estimatedRpe, targetRpe));

  const score = components.length
    ? Math.round(components.reduce((acc, value) => acc + value, 0) / components.length)
    : 0;
  const xpAward = xpFromPredictionScore(score);

  const xpDescription = `prediction_xp:${predictionId}`;
  const xpResult = await applyXpWithUniqueDescription({
    db,
    userId: params.userId,
    amount: xpAward,
    description: xpDescription,
    referenceId: predictionId,
  });

  const resolvedAt = new Date();
  await db.execute(sql`
    UPDATE season_activity_predictions
    SET
      status = 'evaluated',
      activity_id = ${Number(activityRow.id ?? 0)},
      score = ${score},
      xp_awarded = ${xpResult.granted ? xpAward : 0},
      resolved_at = ${resolvedAt}
    WHERE id = ${predictionId}
  `);

  return {
    status: "evaluated" as const,
    predictionId,
    activityId: Number(activityRow.id ?? 0),
    score,
    xpAwarded: xpResult.granted ? xpAward : 0,
    actual: {
      distanceMeters: actualDistance,
      pacePer100m: actualPace || null,
      durationSeconds: actualDuration,
      estimatedRpe,
    },
  };
}

type ClubQuestState = {
  questCode: string;
  clubId: number;
  clubName: string;
  weekStart: string;
  memberCount: number;
  xpReward: number;
  targets: {
    rsvps: number;
    interactions: number;
    engagedMembers: number;
  };
  progress: {
    teamRsvps: number;
    teamInteractions: number;
    engagedMembers: number;
    userActions: number;
  };
  completion: {
    completed: boolean;
    progressPercent: number;
  };
  claimed: boolean;
  eligibleToClaim: boolean;
};

export async function getCurrentClubQuestStates(userId: number, now = new Date()): Promise<ClubQuestState[]> {
  await ensureSeasonEngagementSchema();
  const db = await getDb();
  if (!db) return [];

  const weekStartDate = startOfUtcWeek(now);
  const weekEndDate = endOfUtcWeek(now);
  const weekStartKey = toUtcDateKey(weekStartDate);

  const activeClubsResult = await db.execute(sql`
    SELECT
      c.id AS club_id,
      c.name AS club_name,
      (
        SELECT COUNT(*)::int
        FROM community_club_members m2
        WHERE m2.club_id = c.id
          AND m2.status = 'active'
      ) AS member_count
    FROM community_club_members m
    JOIN community_clubs c ON c.id = m.club_id
    WHERE m.user_id = ${userId}
      AND m.status = 'active'
    ORDER BY c.name ASC
  `);

  const clubRows = activeClubsResult.rows as Array<{
    club_id?: number;
    club_name?: string;
    member_count?: number;
  }>;
  if (!clubRows.length) return [];

  const claimsResult = await db.execute(sql`
    SELECT club_id, quest_code
    FROM season_club_quest_claims
    WHERE user_id = ${userId}
      AND week_start = ${weekStartKey}
      AND quest_code = ${CLUB_QUEST_CODE}
  `);
  const claimedClubIds = new Set(
    claimsResult.rows.map((row) => Number((row as { club_id?: number }).club_id ?? 0)),
  );

  const states: ClubQuestState[] = [];

  for (const club of clubRows) {
    const clubId = Number(club.club_id ?? 0);
    const memberCount = Math.max(1, Number(club.member_count ?? 1));

    const metricsResult = await db.execute(sql`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM event_attendees ea
          JOIN club_events ev ON ev.id = ea.event_id
          WHERE ev.club_id = ${clubId}
            AND ea.status IN ('going', 'maybe')
            AND ea.rsvp_at >= ${weekStartDate}
            AND ea.rsvp_at <= ${weekEndDate}
        ) AS team_rsvps,
        (
          SELECT COUNT(*)::int
          FROM social_posts sp
          WHERE sp.club_id = ${clubId}
            AND sp.is_deleted = false
            AND sp.created_at >= ${weekStartDate}
            AND sp.created_at <= ${weekEndDate}
        ) AS team_posts,
        (
          SELECT COUNT(*)::int
          FROM social_comments sc
          JOIN social_posts sp ON sp.id = sc.post_id
          WHERE sp.club_id = ${clubId}
            AND sp.is_deleted = false
            AND sc.created_at >= ${weekStartDate}
            AND sc.created_at <= ${weekEndDate}
        ) AS team_comments,
        (
          SELECT COUNT(DISTINCT t.uid)::int
          FROM (
            SELECT ea.user_id AS uid
            FROM event_attendees ea
            JOIN club_events ev ON ev.id = ea.event_id
            WHERE ev.club_id = ${clubId}
              AND ea.status IN ('going', 'maybe')
              AND ea.rsvp_at >= ${weekStartDate}
              AND ea.rsvp_at <= ${weekEndDate}
            UNION ALL
            SELECT sp.user_id AS uid
            FROM social_posts sp
            WHERE sp.club_id = ${clubId}
              AND sp.is_deleted = false
              AND sp.created_at >= ${weekStartDate}
              AND sp.created_at <= ${weekEndDate}
            UNION ALL
            SELECT sc.user_id AS uid
            FROM social_comments sc
            JOIN social_posts sp ON sp.id = sc.post_id
            WHERE sp.club_id = ${clubId}
              AND sp.is_deleted = false
              AND sc.created_at >= ${weekStartDate}
              AND sc.created_at <= ${weekEndDate}
          ) t
        ) AS engaged_members,
        (
          (
            SELECT COUNT(*)::int
            FROM event_attendees ea
            JOIN club_events ev ON ev.id = ea.event_id
            WHERE ev.club_id = ${clubId}
              AND ea.user_id = ${userId}
              AND ea.status IN ('going', 'maybe')
              AND ea.rsvp_at >= ${weekStartDate}
              AND ea.rsvp_at <= ${weekEndDate}
          )
          +
          (
            SELECT COUNT(*)::int
            FROM social_posts sp
            WHERE sp.club_id = ${clubId}
              AND sp.user_id = ${userId}
              AND sp.is_deleted = false
              AND sp.created_at >= ${weekStartDate}
              AND sp.created_at <= ${weekEndDate}
          )
          +
          (
            SELECT COUNT(*)::int
            FROM social_comments sc
            JOIN social_posts sp ON sp.id = sc.post_id
            WHERE sp.club_id = ${clubId}
              AND sc.user_id = ${userId}
              AND sp.is_deleted = false
              AND sc.created_at >= ${weekStartDate}
              AND sc.created_at <= ${weekEndDate}
          )
        )::int AS user_actions
    `);

    const metrics = (metricsResult.rows[0] as Record<string, unknown> | undefined) ?? {};
    const teamRsvps = Number(metrics.team_rsvps ?? 0);
    const teamPosts = Number(metrics.team_posts ?? 0);
    const teamComments = Number(metrics.team_comments ?? 0);
    const teamInteractions = teamPosts + teamComments;
    const engagedMembers = Number(metrics.engaged_members ?? 0);
    const userActions = Number(metrics.user_actions ?? 0);

    const targets = {
      rsvps: clamp(Math.round(memberCount * 0.9), 3, 18),
      interactions: clamp(Math.round(memberCount * 1.2), 5, 24),
      engagedMembers: clamp(Math.round(memberCount * 0.35), 2, 8),
    };

    const completionSlice = [
      clamp((teamRsvps / Math.max(targets.rsvps, 1)) * 100, 0, 100),
      clamp((teamInteractions / Math.max(targets.interactions, 1)) * 100, 0, 100),
      clamp((engagedMembers / Math.max(targets.engagedMembers, 1)) * 100, 0, 100),
    ];

    const completed =
      teamRsvps >= targets.rsvps &&
      teamInteractions >= targets.interactions &&
      engagedMembers >= targets.engagedMembers;

    const claimed = claimedClubIds.has(clubId);
    const eligibleToClaim = completed && !claimed && userActions > 0;

    states.push({
      questCode: CLUB_QUEST_CODE,
      clubId,
      clubName: String(club.club_name ?? `Club ${clubId}`),
      weekStart: weekStartKey,
      memberCount,
      xpReward: CLUB_QUEST_XP_REWARD,
      targets,
      progress: {
        teamRsvps,
        teamInteractions,
        engagedMembers,
        userActions,
      },
      completion: {
        completed,
        progressPercent: Math.round(
          completionSlice.reduce((acc, value) => acc + value, 0) / completionSlice.length,
        ),
      },
      claimed,
      eligibleToClaim,
    });
  }

  return states;
}

export async function claimCurrentClubQuestReward(params: { userId: number; clubId: number }) {
  await ensureSeasonEngagementSchema();
  const db = await getDb();
  if (!db) {
    return { success: false as const, reason: "db_unavailable" as const };
  }

  const states = await getCurrentClubQuestStates(params.userId, new Date());
  const state = states.find((entry) => entry.clubId === params.clubId);

  if (!state) {
    return { success: false as const, reason: "not_member" as const };
  }
  if (!state.completion.completed) {
    return { success: false as const, reason: "not_completed" as const };
  }
  if (state.claimed) {
    return { success: false as const, reason: "already_claimed" as const };
  }
  if (state.progress.userActions <= 0) {
    return { success: false as const, reason: "no_contribution" as const };
  }

  const inserted = await db.execute(sql`
    INSERT INTO season_club_quest_claims (
      user_id,
      club_id,
      week_start,
      quest_code,
      xp_awarded
    )
    VALUES (
      ${params.userId},
      ${params.clubId},
      ${state.weekStart},
      ${state.questCode},
      ${state.xpReward}
    )
    ON CONFLICT (user_id, club_id, week_start, quest_code) DO NOTHING
    RETURNING id
  `);

  const claimInserted = inserted.rows.length > 0;
  if (!claimInserted) {
    return { success: false as const, reason: "already_claimed" as const };
  }

  const xpDescription = `club_quest:${state.weekStart}:${state.clubId}:${state.questCode}`;
  const xpResult = await applyXpWithUniqueDescription({
    db,
    userId: params.userId,
    amount: state.xpReward,
    description: xpDescription,
    referenceId: state.clubId,
  });

  return {
    success: true as const,
    clubId: state.clubId,
    questCode: state.questCode,
    xpAwarded: xpResult.granted ? state.xpReward : 0,
    weekStart: state.weekStart,
  };
}

export async function getSeasonEngagementSnapshot(userId: number) {
  const [actionXp, predictions, clubQuests] = await Promise.all([
    getActionXpStatus(userId),
    listSeasonActivityPredictions(userId, 6),
    getCurrentClubQuestStates(userId),
  ]);

  return {
    actionXp,
    predictions,
    clubQuests,
  };
}

