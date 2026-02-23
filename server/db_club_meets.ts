import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  clubMeets,
  clubMeetEvents,
  clubMeetEntries,
  clubMeetResultImportBatches,
  clubMeetResults,
  communityClubMembers,
  swimmerProfiles,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import type { EntryStatus, MeetStatus, ResultImportMode } from "@shared/types";

const STAFF_ROLES = new Set(["owner", "admin", "moderator"]);
const MEMBER_VISIBLE_STATUSES: MeetStatus[] = ["published", "open", "closed", "completed"];

export type MeetEventInput = {
  id?: number;
  label: string;
  programOrder?: number;
  distanceMeters?: number | null;
  stroke?: string | null;
  gender?: string | null;
  masterCategory?: string | null;
  scheduledAt?: Date | null;
  notes?: string | null;
};

export type PdfManualResultRow = {
  meetEventId?: number;
  eventLabel?: string;
  athleteName?: string;
  athleteEmail?: string;
  userId?: number;
  clubName?: string;
  finalTime?: string;
  finalTimeCs?: number;
  rank?: number;
  points?: number;
  dq?: boolean;
  notes?: string;
  seedTime?: string;
  seedTimeCs?: number;
};

export type ImportResultError = {
  rowNumber: number;
  code: string;
  message: string;
};

export function parseSwimTimeToCentiseconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }

  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (["dq", "dns", "dnf", "squalificato", "sq"].includes(raw)) return null;

  const normalized = raw.replace(",", ".");

  // mm:ss.cc (preferred)
  const minuteSecondMatch = normalized.match(/^(\d+):([0-5]?\d)(?:\.(\d{1,2}))?$/);
  if (minuteSecondMatch) {
    const minutes = Number(minuteSecondMatch[1]);
    const seconds = Number(minuteSecondMatch[2]);
    const csRaw = minuteSecondMatch[3] ?? "0";
    const centiseconds = Number(csRaw.padEnd(2, "0").slice(0, 2));
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(centiseconds)) return null;
    return (minutes * 60 + seconds) * 100 + centiseconds;
  }

  // ss.cc
  const secondsMatch = normalized.match(/^([0-9]{1,3})(?:\.(\d{1,2}))?$/);
  if (secondsMatch) {
    const seconds = Number(secondsMatch[1]);
    const csRaw = secondsMatch[2] ?? "0";
    const centiseconds = Number(csRaw.padEnd(2, "0").slice(0, 2));
    if (!Number.isFinite(seconds) || !Number.isFinite(centiseconds)) return null;
    return seconds * 100 + centiseconds;
  }

  return null;
}

export function formatCentiseconds(timeCs: number | null | undefined): string {
  if (!Number.isFinite(timeCs ?? null) || (timeCs ?? 0) < 0) return "-";
  const value = Number(timeCs);
  const minutes = Math.floor(value / 6000);
  const seconds = Math.floor((value % 6000) / 100);
  const centiseconds = value % 100;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function parseBooleanLike(value: unknown): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "dq", "squalificato", "si", "sì"].includes(raw);
}

function normalizeHeader(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function detectDelimiter(headerLine: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;

  for (const delimiter of candidates) {
    const count = headerLine.split(delimiter).length;
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }

  return best;
}

export function parseCsvRowsFromBase64(csvBase64: string): Array<Record<string, string>> {
  const payload = Buffer.from(csvBase64, "base64").toString("utf8");
  const lines = payload
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const cols = parseDelimitedLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = cols[idx] ?? "";
    });
    return row;
  });
}

function pickField(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (row[key] !== undefined && row[key] !== "") {
      return row[key];
    }
  }
  return "";
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

function isStaffRole(role?: string | null) {
  return !!role && STAFF_ROLES.has(role);
}

export async function getClubMeetById(meetId: number) {
  const db = await requireDb();
  const [meet] = await db.select().from(clubMeets).where(eq(clubMeets.id, meetId)).limit(1);
  return meet ?? null;
}

export async function getMeetEventById(meetEventId: number) {
  const db = await requireDb();
  const [event] = await db.select().from(clubMeetEvents).where(eq(clubMeetEvents.id, meetEventId)).limit(1);
  return event ?? null;
}

export async function listClubMeets(params: {
  userId: number;
  clubId: number;
  season?: number;
}) {
  const db = await requireDb();
  const role = await getClubRole(params.userId, params.clubId);
  if (!role || role.status !== "active") throw new Error("Forbidden");

  const filters = [eq(clubMeets.clubId, params.clubId)];
  if (!isStaffRole(role.role)) {
    filters.push(sql`${clubMeets.status} IN (${sql.join(MEMBER_VISIBLE_STATUSES.map((s) => sql`${s}`), sql`,`)})`);
  }

  if (params.season) {
    const from = new Date(Date.UTC(params.season, 0, 1, 0, 0, 0));
    const to = new Date(Date.UTC(params.season + 1, 0, 1, 0, 0, 0));
    filters.push(gte(clubMeets.startDate, from));
    filters.push(lte(clubMeets.startDate, to));
  }

  const meets = await db
    .select({
      meet: clubMeets,
      eventsCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${clubMeetEvents} e
        WHERE e.meet_id = ${clubMeets.id}
      )`,
      entriesCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${clubMeetEntries} ce
        JOIN ${clubMeetEvents} e ON e.id = ce.meet_event_id
        WHERE e.meet_id = ${clubMeets.id}
      )`,
      resultsCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${clubMeetResults} r
        WHERE r.meet_id = ${clubMeets.id}
      )`,
    })
    .from(clubMeets)
    .where(and(...filters))
    .orderBy(desc(clubMeets.startDate));

  return {
    role,
    isStaff: isStaffRole(role.role),
    meets,
  };
}

export async function getClubMeetDetail(params: { userId: number; meetId: number }) {
  const db = await requireDb();
  const [meet] = await db.select().from(clubMeets).where(eq(clubMeets.id, params.meetId)).limit(1);
  if (!meet) return null;

  const role = await getClubRole(params.userId, meet.clubId);
  if (!role || role.status !== "active") throw new Error("Forbidden");
  if (!isStaffRole(role.role) && !MEMBER_VISIBLE_STATUSES.includes(meet.status as MeetStatus)) {
    throw new Error("Forbidden");
  }

  const events = await db
    .select()
    .from(clubMeetEvents)
    .where(eq(clubMeetEvents.meetId, meet.id))
    .orderBy(clubMeetEvents.programOrder, clubMeetEvents.id);

  return {
    role,
    isStaff: isStaffRole(role.role),
    meet,
    events,
  };
}

export async function createClubMeet(params: {
  actorId: number;
  clubId: number;
  name: string;
  venue?: string | null;
  startDate: Date;
  endDate: Date;
  registrationDeadline: Date;
  notes?: string | null;
  timezone?: string;
}) {
  const role = await getClubRole(params.actorId, params.clubId);
  if (!role || role.status !== "active" || !isStaffRole(role.role)) throw new Error("Forbidden");

  const db = await requireDb();
  const [meet] = await db
    .insert(clubMeets)
    .values({
      clubId: params.clubId,
      createdBy: params.actorId,
      name: params.name,
      venue: params.venue ?? null,
      startDate: params.startDate,
      endDate: params.endDate,
      registrationDeadline: params.registrationDeadline,
      notes: params.notes ?? null,
      timezone: params.timezone ?? "Europe/Rome",
      status: "draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  return meet;
}

export async function updateClubMeet(params: {
  actorId: number;
  meetId: number;
  name?: string;
  venue?: string | null;
  startDate?: Date;
  endDate?: Date;
  registrationDeadline?: Date;
  notes?: string | null;
  timezone?: string;
}) {
  const meet = await getClubMeetById(params.meetId);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.actorId, meet.clubId);
  if (!role || role.status !== "active" || !isStaffRole(role.role)) throw new Error("Forbidden");

  const db = await requireDb();
  const [updated] = await db
    .update(clubMeets)
    .set({
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.venue !== undefined ? { venue: params.venue } : {}),
      ...(params.startDate !== undefined ? { startDate: params.startDate } : {}),
      ...(params.endDate !== undefined ? { endDate: params.endDate } : {}),
      ...(params.registrationDeadline !== undefined ? { registrationDeadline: params.registrationDeadline } : {}),
      ...(params.notes !== undefined ? { notes: params.notes } : {}),
      ...(params.timezone !== undefined ? { timezone: params.timezone } : {}),
      updatedAt: new Date(),
    })
    .where(eq(clubMeets.id, params.meetId))
    .returning();

  return updated;
}

export async function transitionClubMeetStatus(params: {
  actorId: number;
  meetId: number;
  status: MeetStatus;
}) {
  const meet = await getClubMeetById(params.meetId);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.actorId, meet.clubId);
  if (!role || role.status !== "active" || !isStaffRole(role.role)) throw new Error("Forbidden");

  const now = new Date();
  const patch: Partial<typeof clubMeets.$inferInsert> = {
    status: params.status,
    updatedAt: now,
  };

  if (params.status === "published") patch.publishedAt = now;
  if (params.status === "open") patch.openedAt = now;
  if (params.status === "closed") patch.closedAt = now;
  if (params.status === "completed") patch.completedAt = now;
  if (params.status === "cancelled") patch.cancelledAt = now;

  const db = await requireDb();
  const [updated] = await db
    .update(clubMeets)
    .set(patch)
    .where(eq(clubMeets.id, params.meetId))
    .returning();

  return updated;
}

export async function upsertClubMeetEvents(params: {
  actorId: number;
  meetId: number;
  events: MeetEventInput[];
}) {
  const meet = await getClubMeetById(params.meetId);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.actorId, meet.clubId);
  if (!role || role.status !== "active" || !isStaffRole(role.role)) throw new Error("Forbidden");

  const db = await requireDb();
  const out: Array<typeof clubMeetEvents.$inferSelect> = [];

  for (const item of params.events) {
    if (item.id) {
      const [updated] = await db
        .update(clubMeetEvents)
        .set({
          label: item.label,
          programOrder: item.programOrder ?? 0,
          distanceMeters: item.distanceMeters ?? null,
          stroke: item.stroke ?? null,
          gender: item.gender ?? null,
          masterCategory: item.masterCategory ?? null,
          scheduledAt: item.scheduledAt ?? null,
          notes: item.notes ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(clubMeetEvents.id, item.id), eq(clubMeetEvents.meetId, params.meetId)))
        .returning();
      if (updated) out.push(updated);
      continue;
    }

    const [created] = await db
      .insert(clubMeetEvents)
      .values({
        meetId: params.meetId,
        label: item.label,
        programOrder: item.programOrder ?? 0,
        distanceMeters: item.distanceMeters ?? null,
        stroke: item.stroke ?? null,
        gender: item.gender ?? null,
        masterCategory: item.masterCategory ?? null,
        scheduledAt: item.scheduledAt ?? null,
        notes: item.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    if (created) out.push(created);
  }

  return out;
}

export async function listClubMeetEntries(params: {
  userId: number;
  meetId: number;
}) {
  const db = await requireDb();
  const [meet] = await db.select().from(clubMeets).where(eq(clubMeets.id, params.meetId)).limit(1);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.userId, meet.clubId);
  if (!role || role.status !== "active") throw new Error("Forbidden");
  if (!isStaffRole(role.role) && !MEMBER_VISIBLE_STATUSES.includes(meet.status as MeetStatus)) {
    throw new Error("Forbidden");
  }

  const events = await db
    .select()
    .from(clubMeetEvents)
    .where(eq(clubMeetEvents.meetId, meet.id))
    .orderBy(clubMeetEvents.programOrder, clubMeetEvents.id);

  const entries = await db
    .select({
      entry: clubMeetEntries,
      eventId: clubMeetEvents.id,
      eventLabel: clubMeetEvents.label,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        username: swimmerProfiles.username,
        avatarUrl: swimmerProfiles.avatarUrl,
      },
    })
    .from(clubMeetEntries)
    .innerJoin(clubMeetEvents, eq(clubMeetEntries.meetEventId, clubMeetEvents.id))
    .innerJoin(users, eq(clubMeetEntries.userId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .where(eq(clubMeetEvents.meetId, meet.id))
    .orderBy(clubMeetEvents.programOrder, desc(clubMeetEntries.updatedAt));

  return {
    role,
    isStaff: isStaffRole(role.role),
    meet,
    events,
    entries,
  };
}

export async function selfSetMeetEntry(params: {
  userId: number;
  meetEventId: number;
  status: Extract<EntryStatus, "pending" | "withdrawn">;
  seedTimeCs?: number | null;
}) {
  const db = await requireDb();
  const [event] = await db.select().from(clubMeetEvents).where(eq(clubMeetEvents.id, params.meetEventId)).limit(1);
  if (!event) throw new Error("Event not found");

  const meet = await getClubMeetById(event.meetId);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.userId, meet.clubId);
  if (!role || role.status !== "active") throw new Error("Forbidden");

  const now = Date.now();
  if (meet.status !== "open") {
    throw new Error("Entries are not open");
  }
  if (new Date(meet.registrationDeadline).getTime() < now) {
    throw new Error("Registration deadline has passed");
  }

  const [existing] = await db
    .select()
    .from(clubMeetEntries)
    .where(and(eq(clubMeetEntries.meetEventId, params.meetEventId), eq(clubMeetEntries.userId, params.userId)))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(clubMeetEntries)
      .values({
        meetEventId: params.meetEventId,
        userId: params.userId,
        status: params.status,
        seedTimeCs: params.seedTimeCs ?? null,
        setByStaffId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return created;
  }

  const [updated] = await db
    .update(clubMeetEntries)
    .set({
      status: params.status,
      seedTimeCs: params.seedTimeCs ?? existing.seedTimeCs,
      setByStaffId: null,
      updatedAt: new Date(),
    })
    .where(eq(clubMeetEntries.id, existing.id))
    .returning();

  return updated;
}

export async function staffSetMeetEntryStatus(params: {
  actorId: number;
  entryId: number;
  status: EntryStatus;
}) {
  const db = await requireDb();
  const [row] = await db
    .select({
      entry: clubMeetEntries,
      meetId: clubMeetEvents.meetId,
    })
    .from(clubMeetEntries)
    .innerJoin(clubMeetEvents, eq(clubMeetEntries.meetEventId, clubMeetEvents.id))
    .where(eq(clubMeetEntries.id, params.entryId))
    .limit(1);

  if (!row) throw new Error("Entry not found");
  const meet = await getClubMeetById(row.meetId);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.actorId, meet.clubId);
  if (!role || role.status !== "active" || !isStaffRole(role.role)) throw new Error("Forbidden");

  const [updated] = await db
    .update(clubMeetEntries)
    .set({
      status: params.status,
      setByStaffId: params.actorId,
      updatedAt: new Date(),
    })
    .where(eq(clubMeetEntries.id, row.entry.id))
    .returning();

  return updated;
}

function normalizeImportRows(rawRows: PdfManualResultRow[]) {
  return rawRows.map((row, index) => ({
    rowNumber: index + 1,
    eventIdRaw: row.meetEventId,
    eventLabelRaw: row.eventLabel,
    athleteNameRaw: row.athleteName,
    athleteEmailRaw: row.athleteEmail,
    userIdRaw: row.userId,
    clubNameRaw: row.clubName,
    finalTimeRaw: row.finalTime,
    finalTimeCsRaw: row.finalTimeCs,
    rankRaw: row.rank,
    pointsRaw: row.points,
    dqRaw: row.dq,
    notesRaw: row.notes,
    seedTimeRaw: row.seedTime,
    seedTimeCsRaw: row.seedTimeCs,
  }));
}

function normalizeCsvRows(csvRows: Array<Record<string, string>>): ReturnType<typeof normalizeImportRows> {
  return csvRows.map((row, index) => ({
    rowNumber: index + 1,
    eventIdRaw: Number.parseInt(pickField(row, ["meet_event_id", "event_id", "eventid", "evento_id"]), 10),
    eventLabelRaw: pickField(row, ["event_label", "event_name", "evento", "gara", "label"]),
    athleteNameRaw: pickField(row, ["athlete_name", "name", "nome", "athlete"]),
    athleteEmailRaw: pickField(row, ["athlete_email", "email"]),
    userIdRaw: Number.parseInt(pickField(row, ["user_id", "userid", "athlete_user_id"]), 10),
    clubNameRaw: pickField(row, ["club_name", "club", "societa"]),
    finalTimeRaw: pickField(row, ["final_time", "time", "tempo", "result_time"]),
    finalTimeCsRaw: Number.parseInt(pickField(row, ["final_time_cs", "time_cs", "tempo_cs"]), 10),
    rankRaw: Number.parseInt(pickField(row, ["rank", "position", "pos", "classifica"]), 10),
    pointsRaw: Number.parseFloat(pickField(row, ["points", "punti"])),
    dqRaw: parseBooleanLike(pickField(row, ["dq", "disqualified", "squalificato"])),
    notesRaw: pickField(row, ["notes", "note"]),
    seedTimeRaw: pickField(row, ["seed_time", "entry_time", "tempo_iscrizione"]),
    seedTimeCsRaw: Number.parseInt(pickField(row, ["seed_time_cs", "entry_time_cs", "tempo_iscrizione_cs"]), 10),
  }));
}

async function resolveMeetEventId(db: Awaited<ReturnType<typeof requireDb>>, meetId: number, eventIdRaw: number, eventLabelRaw: string) {
  if (Number.isInteger(eventIdRaw) && eventIdRaw > 0) {
    const [event] = await db
      .select({ id: clubMeetEvents.id })
      .from(clubMeetEvents)
      .where(and(eq(clubMeetEvents.id, eventIdRaw), eq(clubMeetEvents.meetId, meetId)))
      .limit(1);
    if (event) return event.id;
  }

  if (eventLabelRaw?.trim()) {
    const eventLabel = eventLabelRaw.trim().toLowerCase();
    const byLabel = await db.execute(sql`
      SELECT id
      FROM club_meet_events
      WHERE meet_id = ${meetId}
        AND lower(label) = ${eventLabel}
      LIMIT 1
    `);
    const hit = byLabel.rows[0] as { id?: number } | undefined;
    if (hit?.id) return Number(hit.id);
  }

  return null;
}

async function resolveUserByReference(db: Awaited<ReturnType<typeof requireDb>>, input: {
  userIdRaw: number;
  athleteEmailRaw: string;
}) {
  if (Number.isInteger(input.userIdRaw) && input.userIdRaw > 0) {
    const [userById] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, input.userIdRaw))
      .limit(1);
    if (userById) return userById;
  }

  const email = String(input.athleteEmailRaw ?? "").trim().toLowerCase();
  if (!email) return null;

  const [userByEmail] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  return userByEmail ?? null;
}

async function upsertMeetResult(db: Awaited<ReturnType<typeof requireDb>>, input: {
  meetId: number;
  meetEventId: number;
  importBatchId: number;
  userId: number | null;
  athleteName: string;
  athleteEmail: string | null;
  clubName: string | null;
  finalTimeCs: number | null;
  rank: number | null;
  points: number | null;
  isDisqualified: boolean;
  notes: string | null;
  seedTimeCs: number | null;
}) {
  if (input.userId) {
    await db.execute(sql`
      INSERT INTO club_meet_results (
        meet_id,
        meet_event_id,
        user_id,
        athlete_name,
        athlete_email,
        club_name,
        final_time_cs,
        rank,
        points,
        is_disqualified,
        notes,
        seed_time_cs,
        import_batch_id,
        created_at,
        updated_at
      ) VALUES (
        ${input.meetId},
        ${input.meetEventId},
        ${input.userId},
        ${input.athleteName},
        ${input.athleteEmail},
        ${input.clubName},
        ${input.finalTimeCs},
        ${input.rank},
        ${input.points},
        ${input.isDisqualified},
        ${input.notes},
        ${input.seedTimeCs},
        ${input.importBatchId},
        NOW(),
        NOW()
      )
      ON CONFLICT (meet_event_id, user_id)
      DO UPDATE SET
        athlete_name = EXCLUDED.athlete_name,
        athlete_email = EXCLUDED.athlete_email,
        club_name = EXCLUDED.club_name,
        final_time_cs = EXCLUDED.final_time_cs,
        rank = EXCLUDED.rank,
        points = EXCLUDED.points,
        is_disqualified = EXCLUDED.is_disqualified,
        notes = EXCLUDED.notes,
        seed_time_cs = EXCLUDED.seed_time_cs,
        import_batch_id = EXCLUDED.import_batch_id,
        updated_at = NOW()
    `);
    return;
  }

  const existing = await db.execute(sql`
    SELECT id
    FROM club_meet_results
    WHERE meet_id = ${input.meetId}
      AND meet_event_id = ${input.meetEventId}
      AND user_id IS NULL
      AND lower(athlete_name) = ${input.athleteName.toLowerCase()}
    LIMIT 1
  `);

  const row = existing.rows[0] as { id?: number } | undefined;
  if (row?.id) {
    await db.execute(sql`
      UPDATE club_meet_results
      SET
        athlete_email = ${input.athleteEmail},
        club_name = ${input.clubName},
        final_time_cs = ${input.finalTimeCs},
        rank = ${input.rank},
        points = ${input.points},
        is_disqualified = ${input.isDisqualified},
        notes = ${input.notes},
        seed_time_cs = ${input.seedTimeCs},
        import_batch_id = ${input.importBatchId},
        updated_at = NOW()
      WHERE id = ${Number(row.id)}
    `);
    return;
  }

  await db.insert(clubMeetResults).values({
    meetId: input.meetId,
    meetEventId: input.meetEventId,
    userId: null,
    athleteName: input.athleteName,
    athleteEmail: input.athleteEmail,
    clubName: input.clubName,
    finalTimeCs: input.finalTimeCs,
    rank: input.rank,
    points: input.points,
    isDisqualified: input.isDisqualified,
    notes: input.notes,
    seedTimeCs: input.seedTimeCs,
    importBatchId: input.importBatchId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function importMeetResultsRows(params: {
  actorId: number;
  meetId: number;
  mode: ResultImportMode;
  normalizedRows: ReturnType<typeof normalizeImportRows>;
  sourceFilename?: string | null;
  rawPayload?: unknown;
}) {
  const db = await requireDb();
  const meet = await getClubMeetById(params.meetId);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.actorId, meet.clubId);
  if (!role || role.status !== "active" || !isStaffRole(role.role)) throw new Error("Forbidden");
  if (!["closed", "completed"].includes(meet.status)) {
    throw new Error("Results import is allowed only when meet is closed/completed");
  }

  const [batch] = await db
    .insert(clubMeetResultImportBatches)
    .values({
      meetId: meet.id,
      importedBy: params.actorId,
      mode: params.mode,
      sourceFilename: params.sourceFilename ?? null,
      rawPayload: params.rawPayload ?? null,
      processedRows: params.normalizedRows.length,
      successRows: 0,
      errorRows: 0,
      errors: null,
      createdAt: new Date(),
    })
    .returning();

  const errors: ImportResultError[] = [];
  let successRows = 0;

  for (const row of params.normalizedRows) {
    try {
      const meetEventId = await resolveMeetEventId(
        db,
        meet.id,
        Number.isFinite(row.eventIdRaw) ? Number(row.eventIdRaw) : 0,
        String(row.eventLabelRaw ?? ""),
      );
      if (!meetEventId) {
        errors.push({
          rowNumber: row.rowNumber,
          code: "event_not_found",
          message: "Impossibile associare evento (usa meet_event_id o event_label valido)",
        });
        continue;
      }

      const user = await resolveUserByReference(db, {
        userIdRaw: Number.isFinite(row.userIdRaw) ? Number(row.userIdRaw) : 0,
        athleteEmailRaw: String(row.athleteEmailRaw ?? ""),
      });

      const athleteName = String(row.athleteNameRaw ?? "").trim() || user?.name?.trim() || user?.email || "Atleta";
      const athleteEmail = String(row.athleteEmailRaw ?? "").trim() || user?.email || null;
      const finalTimeCs = Number.isFinite(row.finalTimeCsRaw)
        ? Number(row.finalTimeCsRaw)
        : parseSwimTimeToCentiseconds(row.finalTimeRaw);
      const seedTimeCs = Number.isFinite(row.seedTimeCsRaw)
        ? Number(row.seedTimeCsRaw)
        : parseSwimTimeToCentiseconds(row.seedTimeRaw);
      const rank = Number.isFinite(row.rankRaw) && Number(row.rankRaw) > 0 ? Number(row.rankRaw) : null;
      const points = Number.isFinite(row.pointsRaw) ? Number(row.pointsRaw) : null;
      const isDisqualified = Boolean(row.dqRaw);

      await upsertMeetResult(db, {
        meetId: meet.id,
        meetEventId,
        importBatchId: batch.id,
        userId: user?.id ?? null,
        athleteName,
        athleteEmail,
        clubName: String(row.clubNameRaw ?? "").trim() || null,
        finalTimeCs: isDisqualified ? null : finalTimeCs,
        rank,
        points,
        isDisqualified,
        notes: String(row.notesRaw ?? "").trim() || null,
        seedTimeCs,
      });
      successRows += 1;
    } catch (error) {
      errors.push({
        rowNumber: row.rowNumber,
        code: "row_error",
        message: error instanceof Error ? error.message : "Errore imprevisto in import",
      });
    }
  }

  await db
    .update(clubMeetResultImportBatches)
    .set({
      successRows,
      errorRows: errors.length,
      errors: errors.length ? errors : null,
    })
    .where(eq(clubMeetResultImportBatches.id, batch.id));

  return {
    batchId: batch.id,
    processedRows: params.normalizedRows.length,
    successRows,
    errorRows: errors.length,
    errors,
  };
}

export async function importMeetResultsCsv(params: {
  actorId: number;
  meetId: number;
  csvBase64: string;
  sourceFilename?: string | null;
}) {
  const csvRows = parseCsvRowsFromBase64(params.csvBase64);
  const normalizedRows = normalizeCsvRows(csvRows);
  return importMeetResultsRows({
    actorId: params.actorId,
    meetId: params.meetId,
    mode: "csv",
    normalizedRows,
    sourceFilename: params.sourceFilename ?? null,
    rawPayload: csvRows.slice(0, 250),
  });
}

export async function importMeetResultsPdfManual(params: {
  actorId: number;
  meetId: number;
  rows: PdfManualResultRow[];
}) {
  const normalizedRows = normalizeImportRows(params.rows);
  return importMeetResultsRows({
    actorId: params.actorId,
    meetId: params.meetId,
    mode: "pdf_manual",
    normalizedRows,
    rawPayload: params.rows.slice(0, 250),
  });
}

export async function listMeetResults(params: {
  userId: number;
  meetId: number;
}) {
  const db = await requireDb();
  const [meet] = await db.select().from(clubMeets).where(eq(clubMeets.id, params.meetId)).limit(1);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.userId, meet.clubId);
  if (!role || role.status !== "active") throw new Error("Forbidden");
  if (!isStaffRole(role.role) && !MEMBER_VISIBLE_STATUSES.includes(meet.status as MeetStatus)) {
    throw new Error("Forbidden");
  }

  const rows = await db
    .select({
      result: clubMeetResults,
      event: {
        id: clubMeetEvents.id,
        label: clubMeetEvents.label,
        programOrder: clubMeetEvents.programOrder,
      },
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        username: swimmerProfiles.username,
        avatarUrl: swimmerProfiles.avatarUrl,
      },
      importBatch: {
        id: clubMeetResultImportBatches.id,
        mode: clubMeetResultImportBatches.mode,
        createdAt: clubMeetResultImportBatches.createdAt,
      },
    })
    .from(clubMeetResults)
    .innerJoin(clubMeetEvents, eq(clubMeetResults.meetEventId, clubMeetEvents.id))
    .leftJoin(users, eq(clubMeetResults.userId, users.id))
    .leftJoin(swimmerProfiles, eq(users.id, swimmerProfiles.userId))
    .leftJoin(clubMeetResultImportBatches, eq(clubMeetResults.importBatchId, clubMeetResultImportBatches.id))
    .where(eq(clubMeetResults.meetId, meet.id))
    .orderBy(clubMeetEvents.programOrder, clubMeetResults.rank, clubMeetResults.athleteName);

  return {
    role,
    isStaff: isStaffRole(role.role),
    meet,
    rows,
  };
}

export async function getMeetStats(params: {
  userId: number;
  meetId: number;
}) {
  const db = await requireDb();
  const [meet] = await db.select().from(clubMeets).where(eq(clubMeets.id, params.meetId)).limit(1);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.userId, meet.clubId);
  if (!role || role.status !== "active") throw new Error("Forbidden");
  if (!isStaffRole(role.role) && !MEMBER_VISIBLE_STATUSES.includes(meet.status as MeetStatus)) {
    throw new Error("Forbidden");
  }

  const totalsResult = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM club_meet_events e WHERE e.meet_id = ${meet.id}) AS events_count,
      (SELECT COUNT(*)::int FROM club_meet_entries ce JOIN club_meet_events e ON e.id = ce.meet_event_id WHERE e.meet_id = ${meet.id}) AS entries_count,
      (SELECT COUNT(*)::int FROM club_meet_results r WHERE r.meet_id = ${meet.id}) AS results_count,
      (SELECT COUNT(*)::int FROM club_meet_results r WHERE r.meet_id = ${meet.id} AND r.rank = 1) AS gold_count,
      (SELECT COUNT(*)::int FROM club_meet_results r WHERE r.meet_id = ${meet.id} AND r.rank = 2) AS silver_count,
      (SELECT COUNT(*)::int FROM club_meet_results r WHERE r.meet_id = ${meet.id} AND r.rank = 3) AS bronze_count
  `);

  const leaderboard = await db.execute(sql`
    SELECT
      COALESCE(r.user_id, -r.id) AS athlete_key,
      COALESCE(u.id, NULL) AS user_id,
      COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(sp.username), ''), r.athlete_name) AS athlete_name,
      COALESCE(u.email, r.athlete_email) AS athlete_email,
      COUNT(*)::int AS races_count,
      SUM(COALESCE(r.points, 0))::float AS points_total,
      SUM(CASE WHEN r.rank = 1 THEN 1 ELSE 0 END)::int AS gold,
      SUM(CASE WHEN r.rank = 2 THEN 1 ELSE 0 END)::int AS silver,
      SUM(CASE WHEN r.rank = 3 THEN 1 ELSE 0 END)::int AS bronze,
      SUM(CASE WHEN r.seed_time_cs IS NOT NULL AND r.final_time_cs IS NOT NULL AND r.seed_time_cs > r.final_time_cs THEN (r.seed_time_cs - r.final_time_cs) ELSE 0 END)::int AS improvement_cs
    FROM club_meet_results r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    WHERE r.meet_id = ${meet.id}
    GROUP BY 1, 2, 3, 4
    ORDER BY points_total DESC, gold DESC, silver DESC, bronze DESC, athlete_name ASC
  `);

  return {
    role,
    isStaff: isStaffRole(role.role),
    meet,
    totals: totalsResult.rows?.[0] ?? null,
    leaderboard: leaderboard.rows,
  };
}

export async function buildMeetWhatsappLink(params: {
  userId: number;
  meetId: number;
  audience: "all" | "entered" | "staff";
}) {
  const db = await requireDb();
  const [meet] = await db.select().from(clubMeets).where(eq(clubMeets.id, params.meetId)).limit(1);
  if (!meet) throw new Error("Meet not found");

  const role = await getClubRole(params.userId, meet.clubId);
  if (!role || role.status !== "active") throw new Error("Forbidden");

  const audienceLabel = params.audience === "all"
    ? "tutti i tesserati"
    : params.audience === "entered"
      ? "atleti iscritti"
      : "staff";

  const startDate = new Date(meet.startDate).toLocaleDateString("it-IT");
  const endDate = new Date(meet.endDate).toLocaleDateString("it-IT");
  const deadline = new Date(meet.registrationDeadline).toLocaleDateString("it-IT");

  let templateLabel = "Convocazione";
  if (meet.status === "open") templateLabel = "Reminder iscrizioni";
  if (meet.status === "closed" || meet.status === "completed") templateLabel = "Risultati meeting";

  const message = [
    `🏊 ${templateLabel}`,
    `${meet.name}`,
    meet.venue ? `📍 ${meet.venue}` : null,
    `📅 ${startDate}${startDate !== endDate ? ` - ${endDate}` : ""}`,
    `👥 Audience: ${audienceLabel}`,
    `⏳ Deadline iscrizioni: ${deadline}`,
    meet.notes ? `📝 ${String(meet.notes).slice(0, 300)}` : null,
    `App: /community/club/${meet.clubId}/meet/${meet.id}`,
  ].filter(Boolean).join("\n");

  return {
    templateLabel,
    audience: params.audience,
    message,
    url: `https://wa.me/?text=${encodeURIComponent(message)}`,
  };
}

export async function listMeetMemberRecipients(params: {
  meetId: number;
  audience: "all" | "entered" | "staff";
}) {
  const db = await requireDb();
  const meet = await getClubMeetById(params.meetId);
  if (!meet) return [];

  if (params.audience === "all") {
    const rows = await db
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
      })
      .from(communityClubMembers)
      .innerJoin(users, eq(communityClubMembers.userId, users.id))
      .where(and(eq(communityClubMembers.clubId, meet.clubId), eq(communityClubMembers.status, "active")));
    return rows;
  }

  if (params.audience === "staff") {
    const rows = await db.execute(sql`
      SELECT u.id AS user_id, u.email, u.name
      FROM community_club_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ${meet.clubId}
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin', 'moderator')
    `);
    return rows.rows.map((row) => ({
      userId: Number((row as any).user_id),
      email: String((row as any).email ?? ""),
      name: String((row as any).name ?? ""),
    }));
  }

  const rows = await db.execute(sql`
    SELECT DISTINCT u.id AS user_id, u.email, u.name
    FROM club_meet_entries ce
    JOIN club_meet_events e ON e.id = ce.meet_event_id
    JOIN users u ON u.id = ce.user_id
    WHERE e.meet_id = ${meet.id}
      AND ce.status IN ('pending', 'confirmed', 'waitlist')
  `);

  return rows.rows.map((row) => ({
    userId: Number((row as any).user_id),
    email: String((row as any).email ?? ""),
    name: String((row as any).name ?? ""),
  }));
}
