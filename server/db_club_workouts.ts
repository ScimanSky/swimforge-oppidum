import { and, desc, eq, inArray } from "drizzle-orm";
import { clubPoolWorkoutRuns, clubPoolWorkouts, communityClubMembers } from "../drizzle/schema";
import { getDb } from "./db";
import type { ClubPoolWorkoutDirective, ClubPoolWorkoutPlan, ClubPoolWorkoutStatus } from "@shared/types";

const COACH_ROLES = new Set(["coach", "owner", "admin", "moderator"]);
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_SOURCE_STATUSES = ["success", "partial"] as const;

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
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
      provider: params.provider ?? "local",
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
