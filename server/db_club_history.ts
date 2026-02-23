import { and, eq, sql } from "drizzle-orm";
import {
  clubHistoricalAthletes,
  clubHistoricalImportRuns,
  clubHistoricalMeets,
  clubHistoricalResults,
  clubHistoricalSources,
  communityClubMembers,
  swimmerProfiles,
  users,
} from "../drizzle/schema";
import type { HistoricalImportMode, HistoricalImportStatus, HistoricalProvider } from "@shared/types";
import {
  deriveSeasonLabelFromDate,
  fetchAndParseOppidumAthletePage,
  fetchAndParseOppidumIndex,
  fetchAndParseOppidumMeetPage,
  normalizeTextKey,
  slugify,
} from "./club_history_oppidum";
import { getDb } from "./db";
import { logger } from "./middleware/logger";

const HISTORY_PROVIDER: HistoricalProvider = "oppidum_html";
const COACH_UPLOAD_ROLES = new Set(["coach", "owner", "admin", "moderator"]);

type ImportErrorRecord = {
  stage: string;
  url: string;
  message: string;
};

type UpsertAction = "created" | "updated";

type UpsertCounters = {
  processedPages: number;
  processedRecords: number;
  createdRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  errors: ImportErrorRecord[];
};

function makeCounters(): UpsertCounters {
  return {
    processedPages: 0,
    processedRecords: 0,
    createdRecords: 0,
    updatedRecords: 0,
    skippedRecords: 0,
    errors: [],
  };
}

function mergeCounters(target: UpsertCounters, source: UpsertCounters): void {
  target.processedPages += source.processedPages;
  target.processedRecords += source.processedRecords;
  target.createdRecords += source.createdRecords;
  target.updatedRecords += source.updatedRecords;
  target.skippedRecords += source.skippedRecords;
  target.errors.push(...source.errors);
}

function appendError(counters: UpsertCounters, error: ImportErrorRecord): void {
  counters.errors.push(error);
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

async function getClubRole(userId: number, clubId: number) {
  const db = await requireDb();
  const [row] = await db
    .select({
      role: communityClubMembers.role,
      status: communityClubMembers.status,
    })
    .from(communityClubMembers)
    .where(and(eq(communityClubMembers.clubId, clubId), eq(communityClubMembers.userId, userId)))
    .limit(1);

  return row ?? null;
}

async function requireClubReadable(userId: number, clubId: number) {
  const role = await getClubRole(userId, clubId);
  if (!role || role.status !== "active") throw new Error("Forbidden");
  return role;
}

async function requireClubCoachUploadRole(userId: number, clubId: number) {
  const role = await requireClubReadable(userId, clubId);
  if (!COACH_UPLOAD_ROLES.has(role.role)) throw new Error("Forbidden");
  return role;
}

async function getSourceByClub(clubId: number, provider: HistoricalProvider = HISTORY_PROVIDER) {
  const db = await requireDb();
  const [source] = await db
    .select()
    .from(clubHistoricalSources)
    .where(and(eq(clubHistoricalSources.clubId, clubId), eq(clubHistoricalSources.provider, provider)))
    .limit(1);
  return source ?? null;
}

async function requireSourceEnabled(clubId: number, provider: HistoricalProvider = HISTORY_PROVIDER) {
  const source = await getSourceByClub(clubId, provider);
  if (!source || !source.enabled) throw new Error("History not enabled for this club");
  return source;
}

function normalizeHistoryEventLabel(value: string): string {
  return normalizeTextKey(value);
}

function normalizeRootUrl(raw: string): string {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid root URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Invalid root URL protocol");
  }
  return url.toString();
}

async function resolveLinkedUserId(db: Awaited<ReturnType<typeof requireDb>>, athleteName: string): Promise<number | null> {
  const normalized = athleteName.trim().toLowerCase();
  if (!normalized) return null;

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(swimmerProfiles, eq(swimmerProfiles.userId, users.id))
    .where(sql`lower(trim(${users.name})) = ${normalized} OR lower(trim(${swimmerProfiles.username})) = ${normalized}`)
    .limit(5);

  if (rows.length !== 1) return null;
  return rows[0]?.id ?? null;
}

async function upsertHistoricalAthlete(db: Awaited<ReturnType<typeof requireDb>>, input: {
  clubId: number;
  provider: HistoricalProvider;
  athleteSlug: string;
  athleteName: string;
  sourceUrl: string;
  linkedUserId: number | null;
  lastImportRunId: number;
}): Promise<{ action: UpsertAction; row: typeof clubHistoricalAthletes.$inferSelect }> {
  const [existing] = await db
    .select()
    .from(clubHistoricalAthletes)
    .where(
      and(
        eq(clubHistoricalAthletes.clubId, input.clubId),
        eq(clubHistoricalAthletes.provider, input.provider),
        eq(clubHistoricalAthletes.athleteSlug, input.athleteSlug),
      ),
    )
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(clubHistoricalAthletes)
      .values({
        clubId: input.clubId,
        provider: input.provider,
        athleteSlug: input.athleteSlug,
        athleteName: input.athleteName,
        sourceUrl: input.sourceUrl,
        linkedUserId: input.linkedUserId,
        lastImportRunId: input.lastImportRunId,
        updatedAt: new Date(),
      })
      .returning();

    return { action: "created", row: created };
  }

  const [updated] = await db
    .update(clubHistoricalAthletes)
    .set({
      athleteName: input.athleteName,
      sourceUrl: input.sourceUrl,
      linkedUserId: input.linkedUserId,
      lastImportRunId: input.lastImportRunId,
      updatedAt: new Date(),
    })
    .where(eq(clubHistoricalAthletes.id, existing.id))
    .returning();

  return { action: "updated", row: updated ?? existing };
}

async function upsertHistoricalMeet(db: Awaited<ReturnType<typeof requireDb>>, input: {
  clubId: number;
  provider: HistoricalProvider;
  meetSlug: string;
  meetName: string;
  meetDate: Date | null;
  sourceUrl: string;
  seasonLabel: string | null;
  lastImportRunId: number;
}): Promise<{ action: UpsertAction; row: typeof clubHistoricalMeets.$inferSelect }> {
  const [existing] = await db
    .select()
    .from(clubHistoricalMeets)
    .where(
      and(
        eq(clubHistoricalMeets.clubId, input.clubId),
        eq(clubHistoricalMeets.provider, input.provider),
        eq(clubHistoricalMeets.meetSlug, input.meetSlug),
      ),
    )
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(clubHistoricalMeets)
      .values({
        clubId: input.clubId,
        provider: input.provider,
        meetSlug: input.meetSlug,
        meetName: input.meetName,
        meetDate: input.meetDate,
        sourceUrl: input.sourceUrl,
        seasonLabel: input.seasonLabel,
        lastImportRunId: input.lastImportRunId,
        updatedAt: new Date(),
      })
      .returning();

    return { action: "created", row: created };
  }

  const [updated] = await db
    .update(clubHistoricalMeets)
    .set({
      meetName: input.meetName,
      meetDate: input.meetDate ?? existing.meetDate,
      sourceUrl: input.sourceUrl,
      seasonLabel: input.seasonLabel ?? existing.seasonLabel,
      lastImportRunId: input.lastImportRunId,
      updatedAt: new Date(),
    })
    .where(eq(clubHistoricalMeets.id, existing.id))
    .returning();

  return { action: "updated", row: updated ?? existing };
}

async function upsertHistoricalResult(db: Awaited<ReturnType<typeof requireDb>>, input: {
  clubId: number;
  provider: HistoricalProvider;
  meetId: number;
  athleteId: number;
  eventLabel: string;
  finalTimeRaw: string | null;
  finalTimeCs: number | null;
  points: number | null;
  recordRaw: string | null;
  notes: string | null;
  lastImportRunId: number;
}): Promise<{ action: UpsertAction; row: typeof clubHistoricalResults.$inferSelect }> {
  const eventLabelNorm = normalizeHistoryEventLabel(input.eventLabel);
  if (!eventLabelNorm) {
    throw new Error("Invalid event label");
  }

  const [existing] = await db
    .select()
    .from(clubHistoricalResults)
    .where(
      and(
        eq(clubHistoricalResults.clubId, input.clubId),
        eq(clubHistoricalResults.provider, input.provider),
        eq(clubHistoricalResults.meetId, input.meetId),
        eq(clubHistoricalResults.athleteId, input.athleteId),
        eq(clubHistoricalResults.eventLabelNorm, eventLabelNorm),
      ),
    )
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(clubHistoricalResults)
      .values({
        clubId: input.clubId,
        provider: input.provider,
        meetId: input.meetId,
        athleteId: input.athleteId,
        eventLabel: input.eventLabel,
        eventLabelNorm,
        finalTimeRaw: input.finalTimeRaw,
        finalTimeCs: input.finalTimeCs,
        points: input.points,
        recordRaw: input.recordRaw,
        notes: input.notes,
        lastImportRunId: input.lastImportRunId,
        updatedAt: new Date(),
      })
      .returning();

    return { action: "created", row: created };
  }

  const [updated] = await db
    .update(clubHistoricalResults)
    .set({
      eventLabel: input.eventLabel,
      finalTimeRaw: input.finalTimeRaw,
      finalTimeCs: input.finalTimeCs,
      points: input.points,
      recordRaw: input.recordRaw,
      notes: input.notes,
      lastImportRunId: input.lastImportRunId,
      updatedAt: new Date(),
    })
    .where(eq(clubHistoricalResults.id, existing.id))
    .returning();

  return { action: "updated", row: updated ?? existing };
}

function asInt(value: unknown): number {
  return Number(value ?? 0) || 0;
}

function chooseImportStatus(counters: UpsertCounters): HistoricalImportStatus {
  if (counters.errors.length === 0) return "success";
  if (counters.createdRecords + counters.updatedRecords + counters.processedRecords > 0) return "partial";
  return "failed";
}

function buildMeetLookupMaps(meets: Array<{ meetName: string; meetDate: Date | null }>) {
  const byNameYear = new Map<string, number>();
  const byName = new Map<string, number>();

  meets.forEach((meet, index) => {
    const nameKey = normalizeTextKey(meet.meetName);
    if (!nameKey) return;
    if (!byName.has(nameKey)) byName.set(nameKey, index);
    const year = meet.meetDate ? String(meet.meetDate.getUTCFullYear()) : "";
    const composite = `${nameKey}|${year}`;
    if (year && !byNameYear.has(composite)) byNameYear.set(composite, index);
  });

  return { byNameYear, byName };
}

async function processAthletePageImport(db: Awaited<ReturnType<typeof requireDb>>, params: {
  clubId: number;
  provider: HistoricalProvider;
  runId: number;
  athleteUrl: string;
  athleteSlugHint?: string;
  athleteNameHint?: string;
  indexMeetLinks?: Array<{ meetName: string; meetSlug: string; meetUrl: string; meetDate: Date | null; seasonLabel: string | null }>;
}): Promise<UpsertCounters> {
  const counters = makeCounters();

  try {
    const athletePayload = await fetchAndParseOppidumAthletePage(params.athleteUrl);
    counters.processedPages += 1;

    const athleteSlug = params.athleteSlugHint || athletePayload.athleteSlug || slugify(athletePayload.athleteName);
    const athleteName = params.athleteNameHint || athletePayload.athleteName;

    const linkedUserId = await resolveLinkedUserId(db, athleteName);
    const athleteUpsert = await upsertHistoricalAthlete(db, {
      clubId: params.clubId,
      provider: params.provider,
      athleteSlug,
      athleteName,
      sourceUrl: params.athleteUrl,
      linkedUserId,
      lastImportRunId: params.runId,
    });

    if (athleteUpsert.action === "created") counters.createdRecords += 1;
    else counters.updatedRecords += 1;

    const meetLinks = params.indexMeetLinks ?? [];
    const meetLookup = buildMeetLookupMaps(meetLinks);

    for (const row of athletePayload.rows) {
      counters.processedRecords += 1;

      if (!row.eventLabel) {
        counters.skippedRecords += 1;
        continue;
      }

      const nameKey = normalizeTextKey(row.meetName);
      const year = row.meetDate ? String(row.meetDate.getUTCFullYear()) : "";
      const meetIdx = meetLookup.byNameYear.get(`${nameKey}|${year}`) ?? meetLookup.byName.get(nameKey);
      const linkedMeet = meetIdx !== undefined ? meetLinks[meetIdx] : null;

      const meetSlug = linkedMeet?.meetSlug
        ?? slugify(`${row.meetDateRaw || row.meetDate?.toISOString().slice(0, 10) || "unknown"}-${row.meetName}`);
      const meetUrl = linkedMeet?.meetUrl ?? params.athleteUrl;

      const meetUpsert = await upsertHistoricalMeet(db, {
        clubId: params.clubId,
        provider: params.provider,
        meetSlug,
        meetName: row.meetName,
        meetDate: row.meetDate,
        sourceUrl: meetUrl,
        seasonLabel: row.seasonLabel ?? linkedMeet?.seasonLabel ?? deriveSeasonLabelFromDate(row.meetDate),
        lastImportRunId: params.runId,
      });
      if (meetUpsert.action === "created") counters.createdRecords += 1;
      else counters.updatedRecords += 1;

      const resultUpsert = await upsertHistoricalResult(db, {
        clubId: params.clubId,
        provider: params.provider,
        meetId: meetUpsert.row.id,
        athleteId: athleteUpsert.row.id,
        eventLabel: row.eventLabel,
        finalTimeRaw: row.finalTimeRaw,
        finalTimeCs: row.finalTimeCs,
        points: null,
        recordRaw: null,
        notes: row.notes,
        lastImportRunId: params.runId,
      });

      if (resultUpsert.action === "created") counters.createdRecords += 1;
      else counters.updatedRecords += 1;
    }
  } catch (error) {
    appendError(counters, {
      stage: "athlete_page",
      url: params.athleteUrl,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return counters;
}

async function processMeetPageImport(db: Awaited<ReturnType<typeof requireDb>>, params: {
  clubId: number;
  provider: HistoricalProvider;
  runId: number;
  meetUrl: string;
  meetSlugHint?: string;
  meetNameHint?: string;
  meetDateHint?: Date | null;
  seasonLabelHint?: string | null;
  athleteNameToSource?: Map<string, { athleteSlug: string; athleteUrl: string }>;
}): Promise<UpsertCounters> {
  const counters = makeCounters();

  try {
    const meetPayload = await fetchAndParseOppidumMeetPage(params.meetUrl);
    counters.processedPages += 1;

    const meetUpsert = await upsertHistoricalMeet(db, {
      clubId: params.clubId,
      provider: params.provider,
      meetSlug: params.meetSlugHint || meetPayload.meetSlug || slugify(meetPayload.meetName),
      meetName: params.meetNameHint || meetPayload.meetName,
      meetDate: params.meetDateHint ?? meetPayload.meetDate,
      sourceUrl: params.meetUrl,
      seasonLabel: params.seasonLabelHint ?? meetPayload.seasonLabel,
      lastImportRunId: params.runId,
    });

    if (meetUpsert.action === "created") counters.createdRecords += 1;
    else counters.updatedRecords += 1;

    for (const row of meetPayload.rows) {
      counters.processedRecords += 1;
      if (!row.eventLabel || !row.athleteName) {
        counters.skippedRecords += 1;
        continue;
      }

      const nameKey = normalizeTextKey(row.athleteName);
      const sourceHint = params.athleteNameToSource?.get(nameKey);
      const athleteSlug = sourceHint?.athleteSlug ?? slugify(row.athleteName);
      const athleteUrl = sourceHint?.athleteUrl ?? params.meetUrl;

      const linkedUserId = await resolveLinkedUserId(db, row.athleteName);
      const athleteUpsert = await upsertHistoricalAthlete(db, {
        clubId: params.clubId,
        provider: params.provider,
        athleteSlug,
        athleteName: row.athleteName,
        sourceUrl: athleteUrl,
        linkedUserId,
        lastImportRunId: params.runId,
      });

      if (athleteUpsert.action === "created") counters.createdRecords += 1;
      else counters.updatedRecords += 1;

      const resultUpsert = await upsertHistoricalResult(db, {
        clubId: params.clubId,
        provider: params.provider,
        meetId: meetUpsert.row.id,
        athleteId: athleteUpsert.row.id,
        eventLabel: row.eventLabel,
        finalTimeRaw: row.finalTimeRaw,
        finalTimeCs: row.finalTimeCs,
        points: row.points,
        recordRaw: row.recordRaw,
        notes: row.notes,
        lastImportRunId: params.runId,
      });

      if (resultUpsert.action === "created") counters.createdRecords += 1;
      else counters.updatedRecords += 1;
    }
  } catch (error) {
    appendError(counters, {
      stage: "meet_page",
      url: params.meetUrl,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return counters;
}

async function createImportRun(db: Awaited<ReturnType<typeof requireDb>>, params: {
  clubId: number;
  provider: HistoricalProvider;
  mode: HistoricalImportMode;
  actorId: number;
  sourceUrl: string;
}) {
  const [run] = await db
    .insert(clubHistoricalImportRuns)
    .values({
      clubId: params.clubId,
      provider: params.provider,
      mode: params.mode,
      triggeredBy: params.actorId,
      status: "running",
      sourceUrl: params.sourceUrl,
      startedAt: new Date(),
      finishedAt: null,
      processedPages: 0,
      processedRecords: 0,
      createdRecords: 0,
      updatedRecords: 0,
      errorRecords: 0,
      errorsJson: null,
      createdAt: new Date(),
    })
    .returning();

  return run;
}

async function finalizeImportRun(db: Awaited<ReturnType<typeof requireDb>>, params: {
  runId: number;
  status: HistoricalImportStatus;
  counters: UpsertCounters;
}) {
  await db
    .update(clubHistoricalImportRuns)
    .set({
      status: params.status,
      finishedAt: new Date(),
      processedPages: params.counters.processedPages,
      processedRecords: params.counters.processedRecords,
      createdRecords: params.counters.createdRecords,
      updatedRecords: params.counters.updatedRecords,
      errorRecords: params.counters.errors.length,
      errorsJson: params.counters.errors.length > 0 ? params.counters.errors : null,
    })
    .where(eq(clubHistoricalImportRuns.id, params.runId));
}

export async function getClubHistoryConfig(params: {
  userId: number;
  clubId: number;
}) {
  const role = await requireClubReadable(params.userId, params.clubId);
  const source = await getSourceByClub(params.clubId, HISTORY_PROVIDER);

  return {
    role,
    provider: HISTORY_PROVIDER,
    source,
    enabled: Boolean(source?.enabled),
  };
}

export async function upsertClubHistoryConfig(params: {
  actorId: number;
  clubId: number;
  provider: HistoricalProvider;
  rootUrl: string;
  enabled: boolean;
}) {
  await requireClubCoachUploadRole(params.actorId, params.clubId);
  const db = await requireDb();

  const rootUrl = normalizeRootUrl(params.rootUrl);

  const [existing] = await db
    .select()
    .from(clubHistoricalSources)
    .where(and(eq(clubHistoricalSources.clubId, params.clubId), eq(clubHistoricalSources.provider, params.provider)))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(clubHistoricalSources)
      .values({
        clubId: params.clubId,
        provider: params.provider,
        rootUrl,
        enabled: params.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return created;
  }

  const [updated] = await db
    .update(clubHistoricalSources)
    .set({
      rootUrl,
      enabled: params.enabled,
      updatedAt: new Date(),
    })
    .where(eq(clubHistoricalSources.id, existing.id))
    .returning();

  return updated ?? existing;
}

export async function startClubHistoryImport(params: {
  actorId: number;
  clubId: number;
  mode: HistoricalImportMode;
  url?: string | null;
}) {
  await requireClubCoachUploadRole(params.actorId, params.clubId);
  const source = await requireSourceEnabled(params.clubId, HISTORY_PROVIDER);

  const startUrl = params.url?.trim() ? normalizeRootUrl(params.url.trim()) : source.rootUrl;
  const db = await requireDb();
  const run = await createImportRun(db, {
    clubId: params.clubId,
    provider: HISTORY_PROVIDER,
    mode: params.mode,
    actorId: params.actorId,
    sourceUrl: startUrl,
  });

  const counters = makeCounters();

  try {
    if (params.mode === "oppidum_index_full") {
      const indexPayload = await fetchAndParseOppidumIndex(startUrl);
      counters.processedPages += 1;

      const athleteNameToSource = new Map<string, { athleteSlug: string; athleteUrl: string }>();
      for (const athlete of indexPayload.athletes) {
        athleteNameToSource.set(normalizeTextKey(athlete.athleteName), {
          athleteSlug: athlete.athleteSlug,
          athleteUrl: athlete.athleteUrl,
        });
      }

      for (const athlete of indexPayload.athletes) {
        const partial = await processAthletePageImport(db, {
          clubId: params.clubId,
          provider: HISTORY_PROVIDER,
          runId: run.id,
          athleteUrl: athlete.athleteUrl,
          athleteSlugHint: athlete.athleteSlug,
          athleteNameHint: athlete.athleteName,
          indexMeetLinks: indexPayload.meets,
        });
        mergeCounters(counters, partial);
      }

      for (const meet of indexPayload.meets) {
        const partial = await processMeetPageImport(db, {
          clubId: params.clubId,
          provider: HISTORY_PROVIDER,
          runId: run.id,
          meetUrl: meet.meetUrl,
          meetSlugHint: meet.meetSlug,
          meetNameHint: meet.meetName,
          meetDateHint: meet.meetDate,
          seasonLabelHint: meet.seasonLabel,
          athleteNameToSource,
        });
        mergeCounters(counters, partial);
      }
    } else if (params.mode === "oppidum_athlete_only") {
      if (!params.url?.trim()) {
        throw new Error("URL atleta obbligatoria in modalità oppidum_athlete_only");
      }
      const partial = await processAthletePageImport(db, {
        clubId: params.clubId,
        provider: HISTORY_PROVIDER,
        runId: run.id,
        athleteUrl: startUrl,
      });
      mergeCounters(counters, partial);
    } else if (params.mode === "oppidum_meet_only") {
      if (!params.url?.trim()) {
        throw new Error("URL meeting obbligatoria in modalità oppidum_meet_only");
      }
      const partial = await processMeetPageImport(db, {
        clubId: params.clubId,
        provider: HISTORY_PROVIDER,
        runId: run.id,
        meetUrl: startUrl,
      });
      mergeCounters(counters, partial);
    }

    const status = chooseImportStatus(counters);
    await finalizeImportRun(db, {
      runId: run.id,
      status,
      counters,
    });

    const [finalRun] = await db
      .select()
      .from(clubHistoricalImportRuns)
      .where(eq(clubHistoricalImportRuns.id, run.id))
      .limit(1);

    return {
      run: finalRun,
      summary: {
        created: counters.createdRecords,
        updated: counters.updatedRecords,
        skipped: counters.skippedRecords,
        errors: counters.errors.length,
        processedPages: counters.processedPages,
        processedRecords: counters.processedRecords,
      },
      errors: counters.errors,
    };
  } catch (error) {
    appendError(counters, {
      stage: "import_fatal",
      url: startUrl,
      message: error instanceof Error ? error.message : String(error),
    });
    await finalizeImportRun(db, {
      runId: run.id,
      status: "failed",
      counters,
    });

    logger.error("[club_history] import failed", {
      event: "club_history:import_failed",
      clubId: params.clubId,
      runId: run.id,
      mode: params.mode,
      message: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

export async function getClubHistoryLastRun(params: {
  userId: number;
  clubId: number;
}) {
  await requireClubReadable(params.userId, params.clubId);
  const source = await requireSourceEnabled(params.clubId, HISTORY_PROVIDER);
  const db = await requireDb();

  const [lastRun] = await db
    .select()
    .from(clubHistoricalImportRuns)
    .where(and(eq(clubHistoricalImportRuns.clubId, params.clubId), eq(clubHistoricalImportRuns.provider, source.provider)))
    .orderBy(sql`${clubHistoricalImportRuns.startedAt} DESC`)
    .limit(1);

  return lastRun ?? null;
}

function buildSeasonFilterSql(season?: number | null) {
  if (!season) return sql`TRUE`;
  const seasonString = String(season);
  return sql`(
    m.season_label = ${seasonString}
    OR EXTRACT(YEAR FROM m.meet_date)::int = ${season}
  )`;
}

export async function listClubHistoryAthletes(params: {
  userId: number;
  clubId: number;
  search?: string;
  season?: number;
  limit?: number;
  offset?: number;
}) {
  await requireClubReadable(params.userId, params.clubId);
  await requireSourceEnabled(params.clubId, HISTORY_PROVIDER);
  const db = await requireDb();

  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const search = params.search?.trim() ? `%${params.search.trim()}%` : null;
  const seasonFilter = buildSeasonFilterSql(params.season ?? null);

  const whereSql = sql`a.club_id = ${params.clubId}
    AND a.provider = ${HISTORY_PROVIDER}
    AND (${search ? sql`a.athlete_name ILIKE ${search}` : sql`TRUE`})
    AND (${params.season
      ? sql`EXISTS (
          SELECT 1
          FROM club_historical_results rx
          JOIN club_historical_meets mx ON mx.id = rx.meet_id
          WHERE rx.athlete_id = a.id
            AND rx.club_id = ${params.clubId}
            AND rx.provider = ${HISTORY_PROVIDER}
            AND ${seasonFilter}
        )`
      : sql`TRUE`})`;

  const rowsResult = await db.execute(sql`
    SELECT
      a.id,
      a.athlete_slug,
      a.athlete_name,
      a.source_url,
      a.linked_user_id,
      a.updated_at,
      COUNT(r.id)::int AS results_count,
      COUNT(DISTINCT r.meet_id)::int AS meets_count,
      MAX(m.meet_date) AS last_meet_date
    FROM club_historical_athletes a
    LEFT JOIN club_historical_results r
      ON r.athlete_id = a.id
      AND r.club_id = a.club_id
      AND r.provider = a.provider
    LEFT JOIN club_historical_meets m
      ON m.id = r.meet_id
    WHERE ${whereSql}
    GROUP BY a.id
    ORDER BY a.athlete_name ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const countResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM club_historical_athletes a
    WHERE ${whereSql}
  `);

  const seasonsResult = await db.execute(sql`
    SELECT DISTINCT season_label
    FROM club_historical_meets
    WHERE club_id = ${params.clubId}
      AND provider = ${HISTORY_PROVIDER}
      AND season_label IS NOT NULL
    ORDER BY season_label DESC
  `);

  return {
    items: rowsResult.rows,
    total: asInt((countResult.rows[0] as any)?.total),
    limit,
    offset,
    seasons: seasonsResult.rows.map((row: any) => String(row.season_label)).filter(Boolean),
  };
}

export async function getClubHistoryAthlete(params: {
  userId: number;
  clubId: number;
  athleteSlug: string;
}) {
  await requireClubReadable(params.userId, params.clubId);
  await requireSourceEnabled(params.clubId, HISTORY_PROVIDER);
  const db = await requireDb();

  const [athlete] = await db
    .select()
    .from(clubHistoricalAthletes)
    .where(
      and(
        eq(clubHistoricalAthletes.clubId, params.clubId),
        eq(clubHistoricalAthletes.provider, HISTORY_PROVIDER),
        eq(clubHistoricalAthletes.athleteSlug, slugify(params.athleteSlug)),
      ),
    )
    .limit(1);

  if (!athlete) return null;

  const results = await db.execute(sql`
    SELECT
      r.id,
      r.event_label,
      r.final_time_raw,
      r.final_time_cs,
      r.points,
      r.record_raw,
      r.notes,
      m.meet_slug,
      m.meet_name,
      m.meet_date,
      m.season_label
    FROM club_historical_results r
    JOIN club_historical_meets m ON m.id = r.meet_id
    WHERE r.club_id = ${params.clubId}
      AND r.provider = ${HISTORY_PROVIDER}
      AND r.athlete_id = ${athlete.id}
    ORDER BY m.meet_date DESC NULLS LAST, m.meet_name ASC, r.event_label ASC
  `);

  return {
    athlete,
    results: results.rows,
  };
}

export async function listClubHistoryMeets(params: {
  userId: number;
  clubId: number;
  season?: number;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  await requireClubReadable(params.userId, params.clubId);
  await requireSourceEnabled(params.clubId, HISTORY_PROVIDER);
  const db = await requireDb();

  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);
  const search = params.search?.trim() ? `%${params.search.trim()}%` : null;
  const seasonFilter = buildSeasonFilterSql(params.season ?? null);

  const whereSql = sql`m.club_id = ${params.clubId}
    AND m.provider = ${HISTORY_PROVIDER}
    AND (${search ? sql`m.meet_name ILIKE ${search}` : sql`TRUE`})
    AND (${params.season ? seasonFilter : sql`TRUE`})`;

  const rowsResult = await db.execute(sql`
    SELECT
      m.id,
      m.meet_slug,
      m.meet_name,
      m.meet_date,
      m.source_url,
      m.season_label,
      m.updated_at,
      COUNT(r.id)::int AS results_count,
      COUNT(DISTINCT r.athlete_id)::int AS athletes_count
    FROM club_historical_meets m
    LEFT JOIN club_historical_results r
      ON r.meet_id = m.id
      AND r.club_id = m.club_id
      AND r.provider = m.provider
    WHERE ${whereSql}
    GROUP BY m.id
    ORDER BY m.meet_date DESC NULLS LAST, m.meet_name ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const countResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM club_historical_meets m
    WHERE ${whereSql}
  `);

  const seasonsResult = await db.execute(sql`
    SELECT DISTINCT season_label
    FROM club_historical_meets
    WHERE club_id = ${params.clubId}
      AND provider = ${HISTORY_PROVIDER}
      AND season_label IS NOT NULL
    ORDER BY season_label DESC
  `);

  return {
    items: rowsResult.rows,
    total: asInt((countResult.rows[0] as any)?.total),
    limit,
    offset,
    seasons: seasonsResult.rows.map((row: any) => String(row.season_label)).filter(Boolean),
  };
}

export async function getClubHistoryMeet(params: {
  userId: number;
  clubId: number;
  meetSlug: string;
}) {
  await requireClubReadable(params.userId, params.clubId);
  await requireSourceEnabled(params.clubId, HISTORY_PROVIDER);
  const db = await requireDb();

  const [meet] = await db
    .select()
    .from(clubHistoricalMeets)
    .where(
      and(
        eq(clubHistoricalMeets.clubId, params.clubId),
        eq(clubHistoricalMeets.provider, HISTORY_PROVIDER),
        eq(clubHistoricalMeets.meetSlug, slugify(params.meetSlug)),
      ),
    )
    .limit(1);

  if (!meet) return null;

  const [stats] = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS results_count,
      COUNT(DISTINCT athlete_id)::int AS athletes_count,
      SUM(COALESCE(points, 0))::float AS total_points
    FROM club_historical_results
    WHERE club_id = ${params.clubId}
      AND provider = ${HISTORY_PROVIDER}
      AND meet_id = ${meet.id}
  `)).rows as Array<Record<string, unknown>>;

  return {
    meet,
    stats: {
      resultsCount: asInt(stats?.results_count),
      athletesCount: asInt(stats?.athletes_count),
      totalPoints: Number(stats?.total_points ?? 0),
    },
  };
}

export async function listClubHistoryMeetResults(params: {
  userId: number;
  clubId: number;
  meetSlug: string;
  searchAthlete?: string;
  eventLabel?: string;
  sort?: "time_asc" | "time_desc" | "points_desc" | "athlete_asc";
}) {
  await requireClubReadable(params.userId, params.clubId);
  await requireSourceEnabled(params.clubId, HISTORY_PROVIDER);
  const db = await requireDb();

  const [meet] = await db
    .select({ id: clubHistoricalMeets.id })
    .from(clubHistoricalMeets)
    .where(
      and(
        eq(clubHistoricalMeets.clubId, params.clubId),
        eq(clubHistoricalMeets.provider, HISTORY_PROVIDER),
        eq(clubHistoricalMeets.meetSlug, slugify(params.meetSlug)),
      ),
    )
    .limit(1);

  if (!meet) return [];

  const searchAthlete = params.searchAthlete?.trim() ? `%${params.searchAthlete.trim()}%` : null;
  const eventLabel = params.eventLabel?.trim() ? `%${params.eventLabel.trim()}%` : null;

  const orderBy = (() => {
    switch (params.sort) {
      case "time_asc":
        return sql`r.final_time_cs ASC NULLS LAST, a.athlete_name ASC`;
      case "time_desc":
        return sql`r.final_time_cs DESC NULLS LAST, a.athlete_name ASC`;
      case "athlete_asc":
        return sql`a.athlete_name ASC, r.event_label ASC`;
      case "points_desc":
      default:
        return sql`r.points DESC NULLS LAST, a.athlete_name ASC`;
    }
  })();

  const rows = await db.execute(sql`
    SELECT
      r.id,
      r.event_label,
      r.final_time_raw,
      r.final_time_cs,
      r.points,
      r.record_raw,
      r.notes,
      a.athlete_name,
      a.athlete_slug,
      a.linked_user_id
    FROM club_historical_results r
    JOIN club_historical_athletes a ON a.id = r.athlete_id
    WHERE r.club_id = ${params.clubId}
      AND r.provider = ${HISTORY_PROVIDER}
      AND r.meet_id = ${meet.id}
      AND (${searchAthlete ? sql`a.athlete_name ILIKE ${searchAthlete}` : sql`TRUE`})
      AND (${eventLabel ? sql`r.event_label ILIKE ${eventLabel}` : sql`TRUE`})
    ORDER BY ${orderBy}
  `);

  return rows.rows;
}
