/**
 * The user's data export (GDPR portability): one JSON document with a top-level `version`.
 *
 * It can be large (thousands of laps and lengths, the Garmin payload of each swim), so the big
 * sections are read a page at a time and the HTTP route streams it (GET /api/account/export, see
 * routes/account_export.ts); the tRPC auth.exportMyData of the older app builds builds the same
 * document in memory.
 */
import { sql, type SQL } from "drizzle-orm";
import type { SqlExecutor } from "./lib/relation-exists";

/** 2: laps, lengths, swim settings (CSS test, pace zones) and the AI coach rows. */
export const DATA_EXPORT_VERSION = 2;
export const DATA_EXPORT_PAGE_SIZE = 1000;
/** Each swim row carries its whole Garmin payload (raw_data): fewer of them per page. */
export const DATA_EXPORT_ACTIVITY_PAGE_SIZE = 50;

type Row = Record<string, unknown>;

/** Columns never exported: secrets, not data about the user. */
const SECRET_PROFILE_COLUMNS = ["garmin_token_encrypted"];

type Section =
  | { key: string; query: (userId: number) => SQL }
  /**
   * Read in id order, `limit` rows after `afterId`; the rows must carry `id`. `pageSize` caps the
   * page for sections with heavy rows.
   */
  | { key: string; page: (userId: number, afterId: number, limit: number) => SQL; pageSize?: number };

const SECTIONS: Section[] = [
  {
    key: "activities",
    pageSize: DATA_EXPORT_ACTIVITY_PAGE_SIZE,
    page: (userId, afterId, limit) =>
      sql`SELECT * FROM swimming_activities WHERE user_id = ${userId} AND id > ${afterId} ORDER BY id LIMIT ${limit}`,
  },
  {
    key: "laps",
    page: (userId, afterId, limit) => sql`
      SELECT l.* FROM garmin_activity_laps l
      JOIN swimming_activities a ON a.id = l.activity_id
      WHERE a.user_id = ${userId} AND l.id > ${afterId}
      ORDER BY l.id LIMIT ${limit}`,
  },
  {
    key: "lengths",
    page: (userId, afterId, limit) => sql`
      SELECT g.* FROM garmin_activity_lengths g
      JOIN swimming_activities a ON a.id = g.activity_id
      WHERE a.user_id = ${userId} AND g.id > ${afterId}
      ORDER BY g.id LIMIT ${limit}`,
  },
  { key: "personalRecords", query: (userId) => sql`SELECT * FROM personal_records WHERE user_id = ${userId} ORDER BY achieved_at DESC` },
  { key: "weeklyStats", query: (userId) => sql`SELECT * FROM weekly_stats WHERE user_id = ${userId} ORDER BY week_start DESC` },
  { key: "goals", query: (userId) => sql`SELECT * FROM user_goals WHERE user_id = ${userId} ORDER BY created_at DESC` },
  {
    key: "badges",
    query: (userId) => sql`
      SELECT ub.*, bd.code AS badge_code, bd.name AS badge_name
      FROM user_badges ub
      JOIN badge_definitions bd ON bd.id = ub.badge_id
      WHERE ub.user_id = ${userId}
      ORDER BY ub.earned_at DESC`,
  },
  { key: "achievementBadges", query: (userId) => sql`SELECT * FROM user_achievement_badges WHERE user_id = ${userId}` },
  {
    key: "xpTransactions",
    page: (userId, afterId, limit) =>
      sql`SELECT * FROM xp_transactions WHERE user_id = ${userId} AND id > ${afterId} ORDER BY id LIMIT ${limit}`,
  },
  // AI coach: the per-swim analyses, the Coach page advice and the generated workouts.
  { key: "activityInsights", query: (userId) => sql`SELECT * FROM activity_ai_insights WHERE user_id = ${userId} ORDER BY generated_at DESC` },
  { key: "coachInsights", query: (userId) => sql`SELECT * FROM ai_insights_cache WHERE user_id = ${userId}` },
  { key: "coachWorkouts", query: (userId) => sql`SELECT * FROM ai_coach_workouts WHERE user_id = ${userId}` },
  { key: "socialPosts", query: (userId) => sql`SELECT * FROM social_posts WHERE user_id = ${userId} ORDER BY created_at DESC` },
  { key: "socialComments", query: (userId) => sql`SELECT * FROM social_comments WHERE user_id = ${userId} ORDER BY created_at DESC` },
  { key: "socialSplashes", query: (userId) => sql`SELECT * FROM social_splashes WHERE user_id = ${userId} ORDER BY created_at DESC` },
  { key: "postReactions", query: (userId) => sql`SELECT * FROM post_reactions WHERE user_id = ${userId} ORDER BY created_at DESC` },
  {
    key: "socialFollows",
    query: (userId) =>
      sql`SELECT * FROM social_follows WHERE follower_id = ${userId} OR following_id = ${userId} ORDER BY created_at DESC`,
  },
  { key: "stories", query: (userId) => sql`SELECT * FROM stories WHERE user_id = ${userId} ORDER BY created_at DESC` },
  {
    key: "notifications",
    page: (userId, afterId, limit) =>
      sql`SELECT * FROM user_notifications WHERE user_id = ${userId} AND id > ${afterId} ORDER BY id LIMIT ${limit}`,
  },
  {
    key: "directMessages",
    page: (userId, afterId, limit) => sql`
      SELECT * FROM direct_messages
      WHERE (sender_id = ${userId} OR receiver_id = ${userId}) AND id > ${afterId}
      ORDER BY id LIMIT ${limit}`,
  },
  { key: "clubMemberships", query: (userId) => sql`SELECT * FROM community_club_members WHERE user_id = ${userId} ORDER BY joined_at DESC` },
  {
    key: "reports",
    query: (userId) =>
      sql`SELECT * FROM social_post_reports WHERE reporter_user_id = ${userId} OR handled_by = ${userId} ORDER BY created_at DESC`,
  },
  { key: "hiddenPosts", query: (userId) => sql`SELECT * FROM social_hidden_posts WHERE user_id = ${userId} ORDER BY created_at DESC` },
  { key: "consents", query: (userId) => sql`SELECT * FROM user_consents WHERE user_id = ${userId} ORDER BY created_at DESC` },
];

export const DATA_EXPORT_SECTIONS = SECTIONS.map((section) => section.key);

export type ExportEvent =
  | { type: "field"; key: string; value: unknown }
  | { type: "section"; key: string }
  | { type: "rows"; rows: Row[] }
  | { type: "endSection" };

function isMissingRelation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "42P01");
}

/**
 * A value as plain JSON (dates as ISO strings): what the file holds, for the in-memory document.
 * The streamed file is serialized once, straight from the database rows.
 */
const plain = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

async function readRows(db: SqlExecutor, query: SQL): Promise<Row[]> {
  try {
    return (await db.execute(query)).rows as Row[];
  } catch (error) {
    // A table missing on an older database: an empty section.
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** The CSS test and the manual pace zones, kept in swimmer_profiles.preferences. */
function swimSettings(profile: Row | null) {
  const preferences = parseJson(profile?.preferences);
  const prefs = preferences && typeof preferences === "object" ? (preferences as Row) : {};
  return { cssTest: prefs.cssTest ?? null, paceZones: prefs.paceZones ?? null };
}

/**
 * The export as a sequence of events: the top-level fields, then each section of `data` with its
 * rows, page by page for the big ones.
 */
export async function* userDataExportEvents(
  db: SqlExecutor,
  userId: number,
  pageSize: number = DATA_EXPORT_PAGE_SIZE,
): AsyncGenerator<ExportEvent> {
  const [user] = await readRows(
    db,
    sql`SELECT id, open_id, name, email, login_method, role, created_at, updated_at, last_signed_in
        FROM users WHERE id = ${userId} LIMIT 1`,
  );
  const [profileRow] = await readRows(db, sql`SELECT * FROM swimmer_profiles WHERE user_id = ${userId} LIMIT 1`);
  const profile = profileRow ? { ...profileRow } : null;
  for (const column of SECRET_PROFILE_COLUMNS) if (profile) delete profile[column];

  yield { type: "field", key: "version", value: DATA_EXPORT_VERSION };
  yield { type: "field", key: "exportedAt", value: new Date().toISOString() };
  yield { type: "field", key: "user", value: user ?? null };
  yield { type: "field", key: "profile", value: profile };
  yield { type: "field", key: "swimSettings", value: swimSettings(profile) };

  for (const section of SECTIONS) {
    yield { type: "section", key: section.key };
    if ("query" in section) {
      const rows = await readRows(db, section.query(userId));
      if (rows.length) yield { type: "rows", rows };
    } else {
      const limit = Math.min(section.pageSize ?? pageSize, pageSize);
      let afterId = 0;
      for (;;) {
        const rows = await readRows(db, section.page(userId, afterId, limit));
        if (rows.length) yield { type: "rows", rows };
        if (rows.length < limit) break;
        const lastId = Number(rows[rows.length - 1].id);
        if (!Number.isFinite(lastId) || lastId <= afterId) break;
        afterId = lastId;
      }
    }
    yield { type: "endSection" };
  }
}

/** The whole export as one object (tRPC auth.exportMyData). */
export async function buildUserDataExport(db: SqlExecutor, userId: number): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const data: Record<string, Row[]> = {};
  let current: Row[] | null = null;
  for await (const event of userDataExportEvents(db, userId)) {
    if (event.type === "field") result[event.key] = plain(event.value);
    else if (event.type === "section") current = data[event.key] = [];
    else if (event.type === "rows") current?.push(...plain(event.rows));
    else current = null;
  }
  result.data = data;
  return result;
}

/**
 * Writes the export as JSON text, a chunk per page: `write` may wait (back-pressure). Nothing is
 * written before the first query has answered, so an early failure can still become an error
 * response.
 */
export async function writeUserDataExport(
  db: SqlExecutor,
  userId: number,
  write: (chunk: string) => void | Promise<void>,
  pageSize: number = DATA_EXPORT_PAGE_SIZE,
): Promise<void> {
  let fields = 0;
  let sections = 0;
  let rowsInSection = 0;
  for await (const event of userDataExportEvents(db, userId, pageSize)) {
    if (event.type === "field") {
      await write(`${fields++ === 0 ? "{" : ","}${JSON.stringify(event.key)}:${JSON.stringify(event.value)}`);
    } else if (event.type === "section") {
      rowsInSection = 0;
      await write(`${sections++ === 0 ? ',"data":{' : ","}${JSON.stringify(event.key)}:[`);
    } else if (event.type === "rows") {
      const text = event.rows.map((row) => JSON.stringify(row)).join(",");
      await write(`${rowsInSection > 0 ? "," : ""}${text}`);
      rowsInSection += event.rows.length;
    } else {
      await write("]");
    }
  }
  await write(sections === 0 ? ',"data":{}}' : "}}");
}
