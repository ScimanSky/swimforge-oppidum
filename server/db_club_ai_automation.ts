import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  clubAiAutomationConfigs,
  clubAiAutomationRuns,
  clubAiExternalMeetSources,
  communityClubMembers,
  communityClubs,
  users,
} from "../drizzle/schema";
import type { ClubAiJobType, ClubAiRunStatus } from "@shared/types";
import { getDb } from "./db";

const CLUB_STAFF_ROLES = new Set(["owner", "admin", "moderator"]);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

async function getClubRole(userId: number, clubId: number) {
  const db = await requireDb();
  const [membership] = await db
    .select({
      role: communityClubMembers.role,
      status: communityClubMembers.status,
    })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  return membership ?? null;
}

async function requireClubStaffRole(userId: number, clubId: number) {
  const role = await getClubRole(userId, clubId);
  if (!role || role.status !== "active" || !CLUB_STAFF_ROLES.has(String(role.role ?? ""))) {
    throw new Error("Forbidden");
  }
  return role;
}

export async function ensureClubExists(clubId: number) {
  const db = await requireDb();
  const [club] = await db
    .select({ id: communityClubs.id })
    .from(communityClubs)
    .where(eq(communityClubs.id, clubId))
    .limit(1);

  if (!club) throw new Error("Club not found");
  return club;
}

export async function ensureClubAiBotUser(clubId: number) {
  await ensureClubExists(clubId);
  const db = await requireDb();
  const email = `coach-ai-club-${clubId}@swimforge.local`;
  const displayName = "Coach AI";

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId = existingUser?.id;

  if (!userId) {
    const [insertedUser] = await db
      .insert(users)
      .values({
        email,
        name: displayName,
        loginMethod: "bot",
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      })
      .returning({ id: users.id });

    userId = insertedUser?.id;
  }

  if (!userId) throw new Error("Unable to create AI bot user");

  const [membership] = await db
    .select({
      id: communityClubMembers.id,
      role: communityClubMembers.role,
      status: communityClubMembers.status,
    })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    await db.insert(communityClubMembers).values({
      clubId,
      userId,
      role: "admin",
      status: "active",
      joinedAt: new Date(),
    });
  } else if (membership.status !== "active" || membership.role !== "admin") {
    await db
      .update(communityClubMembers)
      .set({
        status: "active",
        role: "admin",
        joinedAt: new Date(),
      })
      .where(eq(communityClubMembers.id, membership.id));
  }

  return {
    userId,
    email,
    name: displayName,
  };
}

function normalizeScanUrl(url?: string | null): string {
  const fallback = "https://www.nuotosardegna.it/category/comunicati-master/";
  const value = String(url ?? fallback).trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid scan URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Invalid scan URL");
  }
  return parsed.toString();
}

export async function getClubAiConfig(params: { userId: number; clubId: number }) {
  await requireClubStaffRole(params.userId, params.clubId);
  const db = await requireDb();

  const [row] = await db
    .select()
    .from(clubAiAutomationConfigs)
    .where(eq(clubAiAutomationConfigs.clubId, params.clubId))
    .limit(1);

  return row ?? null;
}

export async function getClubAiConfigByClubId(clubId: number) {
  const db = await requireDb();
  const [row] = await db
    .select()
    .from(clubAiAutomationConfigs)
    .where(eq(clubAiAutomationConfigs.clubId, clubId))
    .limit(1);

  return row ?? null;
}

export async function upsertClubAiConfig(params: {
  actorId: number;
  clubId: number;
  enabled: boolean;
  actorUserId: number;
  imageModel?: string | null;
  motivationPrompt?: string | null;
  scanUrl?: string | null;
  timezone?: string | null;
}) {
  await requireClubStaffRole(params.actorId, params.clubId);
  const db = await requireDb();

  const actorMembership = await getClubRole(params.actorUserId, params.clubId);
  if (!actorMembership || actorMembership.status !== "active" || !CLUB_STAFF_ROLES.has(String(actorMembership.role ?? ""))) {
    throw new Error("Actor user must be active staff in club");
  }

  const now = new Date();
  const scanSourceUrl = normalizeScanUrl(params.scanUrl);
  const timezone = String(params.timezone ?? "Europe/Rome").trim() || "Europe/Rome";

  const [existing] = await db
    .select({ id: clubAiAutomationConfigs.id })
    .from(clubAiAutomationConfigs)
    .where(eq(clubAiAutomationConfigs.clubId, params.clubId))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(clubAiAutomationConfigs)
      .values({
        clubId: params.clubId,
        enabled: params.enabled,
        actorUserId: params.actorUserId,
        timezone,
        scanSourceUrl,
        imageModel: params.imageModel?.trim() || null,
        motivationPrompt: params.motivationPrompt?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  }

  const [updated] = await db
    .update(clubAiAutomationConfigs)
    .set({
      enabled: params.enabled,
      actorUserId: params.actorUserId,
      timezone,
      scanSourceUrl,
      imageModel: params.imageModel?.trim() || null,
      motivationPrompt: params.motivationPrompt?.trim() || null,
      updatedAt: now,
    })
    .where(eq(clubAiAutomationConfigs.id, existing.id))
    .returning();

  return updated;
}

export async function ensureClubAiConfig(params: {
  clubId: number;
  enabled: boolean;
  actorUserId: number;
  timezone?: string;
  scanSourceUrl?: string;
  imageModel?: string | null;
  motivationPrompt?: string | null;
}) {
  const db = await requireDb();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(clubAiAutomationConfigs)
    .where(eq(clubAiAutomationConfigs.clubId, params.clubId))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(clubAiAutomationConfigs)
      .values({
        clubId: params.clubId,
        enabled: params.enabled,
        actorUserId: params.actorUserId,
        timezone: params.timezone ?? "Europe/Rome",
        scanSourceUrl: normalizeScanUrl(params.scanSourceUrl),
        imageModel: params.imageModel?.trim() || null,
        motivationPrompt: params.motivationPrompt?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(clubAiAutomationConfigs)
    .set({
      enabled: params.enabled,
      actorUserId: params.actorUserId,
      timezone: params.timezone ?? existing.timezone,
      scanSourceUrl: normalizeScanUrl(params.scanSourceUrl ?? existing.scanSourceUrl),
      imageModel: params.imageModel?.trim() || existing.imageModel,
      motivationPrompt: params.motivationPrompt?.trim() || existing.motivationPrompt,
      updatedAt: now,
    })
    .where(eq(clubAiAutomationConfigs.id, existing.id))
    .returning();

  return updated;
}

export async function listEnabledClubAiConfigs(clubIds?: number[]) {
  const db = await requireDb();
  const conditions = [eq(clubAiAutomationConfigs.enabled, true)];

  if (clubIds && clubIds.length > 0) {
    conditions.push(inArray(clubAiAutomationConfigs.clubId, clubIds));
  }

  const rows = await db
    .select()
    .from(clubAiAutomationConfigs)
    .where(and(...conditions));

  return rows;
}

export async function listClubAiRuns(params: {
  userId: number;
  clubId: number;
  limit?: number;
}) {
  await requireClubStaffRole(params.userId, params.clubId);
  const db = await requireDb();
  const limit = Math.max(1, Math.min(100, Number(params.limit ?? 20)));

  return db
    .select()
    .from(clubAiAutomationRuns)
    .where(eq(clubAiAutomationRuns.clubId, params.clubId))
    .orderBy(desc(clubAiAutomationRuns.startedAt), desc(clubAiAutomationRuns.id))
    .limit(limit);
}

export async function getAutomationRunByKey(params: {
  clubId: number;
  jobType: ClubAiJobType;
  scheduledKey: string;
}) {
  const db = await requireDb();
  const [run] = await db
    .select()
    .from(clubAiAutomationRuns)
    .where(
      and(
        eq(clubAiAutomationRuns.clubId, params.clubId),
        eq(clubAiAutomationRuns.jobType, params.jobType),
        eq(clubAiAutomationRuns.scheduledKey, params.scheduledKey),
      ),
    )
    .limit(1);

  return run ?? null;
}

export async function createAutomationRun(params: {
  clubId: number;
  jobType: ClubAiJobType;
  scheduledKey: string;
  actorUserId: number | null;
  payloadJson?: unknown;
}) {
  const db = await requireDb();
  const existing = await getAutomationRunByKey({
    clubId: params.clubId,
    jobType: params.jobType,
    scheduledKey: params.scheduledKey,
  });

  if (existing) {
    return { run: existing, created: false as const };
  }

  const [created] = await db
    .insert(clubAiAutomationRuns)
    .values({
      clubId: params.clubId,
      jobType: params.jobType,
      scheduledKey: params.scheduledKey,
      status: "running",
      startedAt: new Date(),
      actorUserId: params.actorUserId,
      payloadJson: params.payloadJson ?? null,
      createdAt: new Date(),
    })
    .returning();

  return { run: created, created: true as const };
}

export async function updateAutomationRun(params: {
  runId: number;
  status: ClubAiRunStatus;
  resultJson?: unknown;
  errorText?: string | null;
}) {
  const db = await requireDb();
  const [updated] = await db
    .update(clubAiAutomationRuns)
    .set({
      status: params.status,
      resultJson: params.resultJson ?? null,
      errorText: params.errorText ? String(params.errorText).slice(0, 5000) : null,
      finishedAt: new Date(),
    })
    .where(eq(clubAiAutomationRuns.id, params.runId))
    .returning();

  return updated ?? null;
}

export async function hasExternalMeetSourceHash(params: {
  clubId: number;
  sourceHash: string;
}) {
  const db = await requireDb();
  const [row] = await db
    .select({ id: clubAiExternalMeetSources.id })
    .from(clubAiExternalMeetSources)
    .where(
      and(
        eq(clubAiExternalMeetSources.clubId, params.clubId),
        eq(clubAiExternalMeetSources.sourceHash, params.sourceHash),
      ),
    )
    .limit(1);

  return Boolean(row?.id);
}

export async function upsertExternalMeetSource(params: {
  clubId: number;
  sourceUrl: string;
  sourceHash: string;
  sourceDate: Date | null;
  meetId: number | null;
  status: string;
}) {
  const db = await requireDb();
  const now = new Date();

  const [existing] = await db
    .select({ id: clubAiExternalMeetSources.id })
    .from(clubAiExternalMeetSources)
    .where(
      and(
        eq(clubAiExternalMeetSources.clubId, params.clubId),
        eq(clubAiExternalMeetSources.sourceHash, params.sourceHash),
      ),
    )
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(clubAiExternalMeetSources)
      .values({
        clubId: params.clubId,
        sourceUrl: params.sourceUrl,
        sourceHash: params.sourceHash,
        sourceDate: params.sourceDate,
        meetId: params.meetId,
        status: params.status,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return created;
  }

  const [updated] = await db
    .update(clubAiExternalMeetSources)
    .set({
      sourceUrl: params.sourceUrl,
      sourceDate: params.sourceDate,
      meetId: params.meetId,
      status: params.status,
      updatedAt: now,
    })
    .where(eq(clubAiExternalMeetSources.id, existing.id))
    .returning();

  return updated;
}

export async function getClubAiSummary(clubId: number) {
  const db = await requireDb();

  const runStatsResult = await db.execute(sql`
    SELECT
      COALESCE(COUNT(*)::int, 0) AS runs_count,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int, 0) AS failed_count,
      MAX(started_at) AS last_started_at
    FROM club_ai_automation_runs
    WHERE club_id = ${clubId}
  `);
  const runStats = (runStatsResult.rows?.[0] ?? {}) as {
    runs_count?: number | string;
    failed_count?: number | string;
    last_started_at?: string | Date | null;
  };

  return {
    runsCount: Number(runStats.runs_count ?? 0),
    failedCount: Number(runStats.failed_count ?? 0),
    lastStartedAt: runStats.last_started_at ?? null,
  };
}
