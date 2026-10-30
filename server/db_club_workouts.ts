import { DB_UNAVAILABLE_ERR_MSG } from "@shared/const";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { clubPoolWorkoutRuns, clubPoolWorkouts, communityClubMembers } from "../drizzle/schema";
import { getDb } from "./db";
import type { ClubPoolWorkoutDirective, ClubPoolWorkoutPlan, ClubPoolWorkoutStatus } from "@shared/types";

const COACH_ROLES = new Set(["coach", "owner", "admin", "moderator"]);
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_SOURCE_STATUSES = ["success", "partial"] as const;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);
  return db;
}

function normalizeSessionDate(sessionDate: string) {
  const raw = String(sessionDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("Invalid sessionDate");
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error("Invalid sessionDate");
  }
  return raw;
}

async function assertCoachRole(userId: number, clubId: number) {
  const db = await requireDb();
  const [membership] = await db
    .select({
      role: communityClubMembers.role,
      status: communityClubMembers.status,
    })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  if (!membership || membership.status !== "active" || !COACH_ROLES.has(String(membership.role ?? ""))) {
    throw new Error("Forbidden");
  }

  return membership;
}

async function assertReadableRole(userId: number, clubId: number) {
  const db = await requireDb();
  const [membership] = await db
    .select({
      role: communityClubMembers.role,
      status: communityClubMembers.status,
    })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  if (!membership || membership.status !== "active") {
    throw new Error("Forbidden");
  }

  return membership;
}

export async function getClubWorkoutGenerationStatus(params: {
  userId: number;
  clubId: number;
  sessionDate: string;
}) {
  await assertCoachRole(params.userId, params.clubId);
  const db = await requireDb();
  const normalizedDate = normalizeSessionDate(params.sessionDate);

  const [lastRun] = await db
    .select({
      createdAt: clubPoolWorkoutRuns.createdAt,
    })
    .from(clubPoolWorkoutRuns)
    .where(
      and(
        eq(clubPoolWorkoutRuns.clubId, params.clubId),
        inArray(clubPoolWorkoutRuns.status, COOLDOWN_SOURCE_STATUSES as unknown as string[]),
      ),
    )
    .orderBy(desc(clubPoolWorkoutRuns.createdAt))
    .limit(1);

  if (!lastRun?.createdAt) {
    return {
      canGenerate: true,
      nextAvailableAt: null,
      lastGeneratedAt: null,
      scope: "club_24h" as const,
      sessionDate: normalizedDate,
    };
  }

  const lastGeneratedAt = new Date(lastRun.createdAt);
  const nextAvailableAt = new Date(lastGeneratedAt.getTime() + COOLDOWN_MS);
  const canGenerate = Date.now() >= nextAvailableAt.getTime();

  return {
    canGenerate,
    nextAvailableAt: canGenerate ? null : nextAvailableAt.toISOString(),
    lastGeneratedAt: lastGeneratedAt.toISOString(),
    scope: "club_24h" as const,
    sessionDate: normalizedDate,
  };
}

export async function createClubWorkoutDraftFromGeneration(params: {
  userId: number;
  clubId: number;
  sessionDate: string;
  directives: ClubPoolWorkoutDirective;
  workout: ClubPoolWorkoutPlan;
  runStatus: "success" | "partial";
  provider?: string;
  model?: string | null;
  promptVersion?: string | null;
  rawResponse?: string | null;
  error?: string | null;
}) {
  await assertCoachRole(params.userId, params.clubId);
  const db = await requireDb();
  const normalizedDate = normalizeSessionDate(params.sessionDate);
  const now = new Date();

  const [workoutRow] = await db
    .insert(clubPoolWorkouts)
    .values({
      clubId: params.clubId,
      sessionDate: normalizedDate,
      status: "draft" satisfies ClubPoolWorkoutStatus,
      workoutType: "pool",
      title: params.workout.title,
      description: params.workout.description,
      directivesJson: params.directives,
      workoutJson: params.workout,
      generatedBy: params.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const [runRow] = await db
    .insert(clubPoolWorkoutRuns)
    .values({
      clubId: params.clubId,
      workoutId: workoutRow.id,
      targetSessionDate: normalizedDate,
      triggeredBy: params.userId,
      status: params.runStatus,
      provider: params.provider ?? "gemini",
      model: params.model ?? null,
      promptVersion: params.promptVersion ? String(params.promptVersion).slice(0, 32) : null,
      directivesJson: params.directives,
      rawResponse: params.rawResponse ?? null,
      error: params.error ?? null,
      createdAt: now,
    })
    .returning();

  const nextAvailableAt = new Date(now.getTime() + COOLDOWN_MS).toISOString();

  return {
    workout: workoutRow,
    run: runRow,
    cooldown: {
      canGenerate: false,
      nextAvailableAt,
      lastGeneratedAt: now.toISOString(),
      scope: "club_24h" as const,
      sessionDate: normalizedDate,
    },
  };
}

export async function getClubWorkoutBySessionDate(params: {
  userId: number;
  clubId: number;
  sessionDate: string;
}) {
  await assertCoachRole(params.userId, params.clubId);
  const db = await requireDb();
  const normalizedDate = normalizeSessionDate(params.sessionDate);

  const [workout] = await db
    .select()
    .from(clubPoolWorkouts)
    .where(
      and(
        eq(clubPoolWorkouts.clubId, params.clubId),
        eq(clubPoolWorkouts.sessionDate, normalizedDate),
      ),
    )
    .orderBy(desc(clubPoolWorkouts.createdAt))
    .limit(1);

  return {
    sessionDate: normalizedDate,
    workout: workout ?? null,
  };
}

export async function publishClubWorkout(params: {
  userId: number;
  workoutId: number;
}) {
  const db = await requireDb();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(clubPoolWorkouts)
    .where(eq(clubPoolWorkouts.id, params.workoutId))
    .limit(1);

  if (!existing) {
    throw new Error("Workout not found");
  }

  await assertCoachRole(params.userId, existing.clubId);

  if (existing.status === "published") {
    return { workout: existing, changed: false };
  }

  const [updated] = await db
    .update(clubPoolWorkouts)
    .set({
      status: "published",
      publishedBy: params.userId,
      publishedAt: now,
      updatedAt: now,
    })
    .where(eq(clubPoolWorkouts.id, params.workoutId))
    .returning();

  return { workout: updated ?? existing, changed: true };
}

export async function listClubWorkoutRecipients(params: {
  userId: number;
  clubId: number;
}) {
  await assertCoachRole(params.userId, params.clubId);
  const db = await requireDb();

  const rows = await db
    .select({
      userId: communityClubMembers.userId,
    })
    .from(communityClubMembers)
    .where(
      and(
        eq(communityClubMembers.clubId, params.clubId),
        eq(communityClubMembers.status, "active"),
      ),
    );

  return rows;
}

export async function listPublishedClubWorkouts(params: {
  userId: number;
  clubId: number;
  limit?: number;
  offset?: number;
}) {
  await assertReadableRole(params.userId, params.clubId);
  const db = await requireDb();
  const limit = Math.max(1, Math.min(100, Number(params.limit ?? 30)));
  const offset = Math.max(0, Number(params.offset ?? 0));

  const rows = await db
    .select()
    .from(clubPoolWorkouts)
    .where(
      and(
        eq(clubPoolWorkouts.clubId, params.clubId),
        eq(clubPoolWorkouts.status, "published"),
      ),
    )
    .orderBy(desc(clubPoolWorkouts.sessionDate), desc(clubPoolWorkouts.publishedAt), desc(clubPoolWorkouts.createdAt))
    .limit(limit)
    .offset(offset);

  return rows;
}

export async function getPublishedClubWorkoutById(params: {
  userId: number;
  clubId: number;
  workoutId: number;
}) {
  await assertReadableRole(params.userId, params.clubId);
  const db = await requireDb();

  const [row] = await db
    .select()
    .from(clubPoolWorkouts)
    .where(
      and(
        eq(clubPoolWorkouts.id, params.workoutId),
        eq(clubPoolWorkouts.clubId, params.clubId),
        eq(clubPoolWorkouts.status, "published"),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error("Workout not found");
  }

  return row;
}

async function requirePublishedWorkout(clubId: number, workoutId: number) {
  const db = await requireDb();
  const result = await db.execute(sql`
    SELECT id FROM club_pool_workouts
    WHERE id = ${workoutId} AND club_id = ${clubId} AND status = 'published'
    LIMIT 1
  `);
  if (!result.rows.length) throw new Error("Workout not found");
}

/**
 * «Segna completato» (completed = true) or its undo, for the athlete themselves, on a
 * published workout of a club they belong to. Marking twice keeps the first time.
 */
export async function setClubWorkoutCompletion(params: {
  userId: number;
  clubId: number;
  workoutId: number;
  completed: boolean;
}) {
  const membership = await assertReadableRole(params.userId, params.clubId);
  await requirePublishedWorkout(params.clubId, params.workoutId);
  const db = await requireDb();

  if (params.completed) {
    await db.execute(sql`
      INSERT INTO club_workout_completions (workout_id, club_id, user_id, completed_at)
      VALUES (${params.workoutId}, ${params.clubId}, ${params.userId}, NOW())
      ON CONFLICT (user_id, workout_id) DO NOTHING
    `);
  } else {
    await db.execute(sql`
      DELETE FROM club_workout_completions
      WHERE user_id = ${params.userId} AND workout_id = ${params.workoutId}
    `);
  }
  return readClubWorkoutCompletion(membership, params);
}

type CompletionRow = {
  user_id: number;
  completed_at: Date | string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
};

/**
 * The athlete's own completion of a workout; coaches and staff also get «fatto da N su M»
 * (M = active members, the club AI bot left out) and who did it, most recent first.
 */
export async function getClubWorkoutCompletion(params: { userId: number; clubId: number; workoutId: number }) {
  const membership = await assertReadableRole(params.userId, params.clubId);
  // The role is checked in clubId: the workout must belong to that club too, or a coach of
  // another club could read who did a private club's workout.
  await requirePublishedWorkout(params.clubId, params.workoutId);
  return readClubWorkoutCompletion(membership, params);
}

/** Callers have checked the membership and that the workout is a published one of clubId. */
async function readClubWorkoutCompletion(
  membership: { role: string | null },
  params: { userId: number; clubId: number; workoutId: number },
) {
  const db = await requireDb();

  const own = await db.execute(sql`
    SELECT completed_at FROM club_workout_completions
    WHERE user_id = ${params.userId} AND workout_id = ${params.workoutId} AND club_id = ${params.clubId}
    LIMIT 1
  `);
  const ownRow = own.rows[0] as { completed_at: Date | string } | undefined;
  const result = {
    completed: Boolean(ownRow),
    completedAt: ownRow ? new Date(ownRow.completed_at).toISOString() : null,
    coach: null as null | {
      completedCount: number;
      memberCount: number;
      members: Array<{ userId: number; name: string | null; username: string | null; avatarUrl: string | null; completedAt: string }>;
    },
  };
  if (!COACH_ROLES.has(String(membership.role ?? ""))) return result;

  const [done, total] = await Promise.all([
    db.execute(sql`
      SELECT c.user_id, c.completed_at, u.name, sp.username, sp.avatar_url
      FROM club_workout_completions c
      JOIN community_club_members m
        ON m.user_id = c.user_id AND m.club_id = ${params.clubId} AND m.status = 'active'
      JOIN users u ON u.id = c.user_id
      LEFT JOIN swimmer_profiles sp ON sp.user_id = c.user_id
      WHERE c.workout_id = ${params.workoutId} AND c.club_id = ${params.clubId}
      ORDER BY c.completed_at DESC
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM community_club_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ${params.clubId}
        AND m.status = 'active'
        AND COALESCE(u.login_method, '') <> 'bot'
    `),
  ]);
  const members = (done.rows as CompletionRow[]).map((row) => ({
    userId: Number(row.user_id),
    name: row.name,
    username: row.username,
    avatarUrl: row.avatar_url,
    completedAt: new Date(row.completed_at).toISOString(),
  }));
  result.coach = {
    completedCount: members.length,
    memberCount: Number((total.rows[0] as { total?: number } | undefined)?.total ?? 0),
    members,
  };
  return result;
}
