/**
 * The clubs, challenges, events and invites of an account being deleted. Deleting an account never
 * deletes what other users have:
 * - a club the user owns with other active members blocks the deletion until its ownership is
 *   transferred (community.clubs.transferOwnership);
 * - a club with no other active member is deleted with the account, explicitly and whole (its posts
 *   too: the social_posts.club_id foreign key only sets null, which would surface them in the
 *   public feed);
 * - challenges, club events and invites the user created stay, with the creator set to null.
 * Migration 0036 makes the foreign keys agree (owner RESTRICT, creators SET NULL).
 */
import { sql, type SQL } from "drizzle-orm";
import { deleteFromIfExists, relationExists, type SqlExecutor } from "./lib/relation-exists";

export type OwnedClub = { id: number; name: string; otherActiveMembers: number };

/** «Rari Nantes» and «Swim Team» still have members: the account cannot be deleted yet. */
export class AccountDeletionBlockedError extends Error {
  constructor(public readonly clubs: OwnedClub[]) {
    super(accountDeletionBlockedMessage(clubs));
    this.name = "AccountDeletionBlockedError";
  }
}

export function accountDeletionBlockedMessage(clubs: Array<Pick<OwnedClub, "name">>): string {
  const names = clubs.map((club) => `«${club.name}»`).join(", ");
  return clubs.length === 1
    ? `Sei proprietario del club ${names}, che ha altri membri. Trasferisci la proprietà a un altro membro prima di eliminare l'account.`
    : `Sei proprietario dei club ${names}, che hanno altri membri. Trasferisci la proprietà a un altro membro prima di eliminare l'account.`;
}

const ownedClubsQuery = (userId: number, lock: boolean): SQL => sql`
  SELECT
    c.id,
    c.name,
    (
      SELECT COUNT(*)::int FROM community_club_members m
      WHERE m.club_id = c.id AND m.user_id <> ${userId} AND m.status = 'active'
    ) AS other_members
  FROM community_clubs c
  WHERE c.owner_id = ${userId}
  ORDER BY c.id
  ${lock ? sql`FOR UPDATE OF c` : sql``}`;

const toOwnedClubs = (rows: unknown[]): OwnedClub[] =>
  (rows as Array<{ id: unknown; name: unknown; other_members: unknown }>).map((row) => ({
    id: Number(row.id),
    name: String(row.name ?? ""),
    otherActiveMembers: Number(row.other_members ?? 0),
  }));

/** The clubs the user owns, with how many other active members each has (none without clubs). */
export async function listOwnedClubs(db: SqlExecutor, userId: number): Promise<OwnedClub[]> {
  if (!(await relationExists(db, "public.community_clubs"))) return [];
  return toOwnedClubs((await db.execute(ownedClubsQuery(userId, false))).rows);
}

/** Same, locking the club rows for the deletion transaction. */
export async function lockOwnedClubs(tx: SqlExecutor, userId: number): Promise<OwnedClub[]> {
  if (!(await relationExists(tx, "public.community_clubs"))) return [];
  return toOwnedClubs((await tx.execute(ownedClubsQuery(userId, true))).rows);
}

export const clubsBlockingDeletion = (clubs: OwnedClub[]) => clubs.filter((club) => club.otherActiveMembers > 0);

export type ClubTransferCandidate = { userId: number; name: string | null; username: string | null };
export type ClubBlockingDeletion = OwnedClub & { members: ClubTransferCandidate[] };

/**
 * The owned clubs that block the account deletion, each with the active members it can be
 * transferred to (staff first, then by seniority). Shown in Settings → Privacy.
 */
export async function listClubsBlockingDeletion(db: SqlExecutor, userId: number): Promise<ClubBlockingDeletion[]> {
  const blocking = clubsBlockingDeletion(await listOwnedClubs(db, userId));
  if (blocking.length === 0) return [];
  const ids = sql.join(
    blocking.map((club) => sql`${club.id}`),
    sql`, `,
  );
  const members = await db.execute(sql`
    SELECT m.club_id, m.user_id, u.name, sp.username
    FROM community_club_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = m.user_id
    WHERE m.club_id IN (${ids}) AND m.user_id <> ${userId} AND m.status = 'active'
    ORDER BY m.club_id,
      CASE m.role WHEN 'admin' THEN 0 WHEN 'moderator' THEN 1 WHEN 'coach' THEN 2 ELSE 3 END,
      m.joined_at, m.user_id`);
  const rows = members.rows as Array<{ club_id: unknown; user_id: unknown; name: unknown; username: unknown }>;
  return blocking.map((club) => ({
    ...club,
    members: rows
      .filter((row) => Number(row.club_id) === club.id)
      .map((row) => ({
        userId: Number(row.user_id),
        name: typeof row.name === "string" ? row.name : null,
        username: typeof row.username === "string" ? row.username : null,
      })),
  }));
}

/**
 * Deletes the clubs and everything that belongs to them, children first: posts (with reactions,
 * comments, splashes, hides, reports and analytics), events and attendees, gallery, announcements,
 * invites, members, meets, history, pool workouts and the AI automation rows. Ghost challenges set
 * in the club lose the club. Run inside a transaction.
 */
export async function deleteClubRows(tx: SqlExecutor, clubIds: number[]): Promise<void> {
  if (clubIds.length === 0) return;
  const ids = sql.join(
    clubIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const inClubs = sql`club_id IN (${ids})`;
  const clubPosts = sql`SELECT id FROM social_posts WHERE club_id IN (${ids})`;
  const clubMeets = sql`SELECT id FROM club_meets WHERE club_id IN (${ids})`;

  await deleteFromIfExists(
    tx,
    "public.product_engagement_events",
    sql`entity_type = 'social_post' AND entity_id IN (${clubPosts})`,
    ["public.social_posts"],
  );
  for (const table of [
    "public.post_reactions",
    "public.social_comments",
    "public.social_splashes",
    "public.social_hidden_posts",
    "public.social_post_reports",
  ]) {
    await deleteFromIfExists(tx, table, sql`post_id IN (${clubPosts})`, ["public.social_posts"]);
  }
  await deleteFromIfExists(tx, "public.social_posts", inClubs);

  await deleteFromIfExists(
    tx,
    "public.event_attendees",
    sql`event_id IN (SELECT id FROM club_events WHERE club_id IN (${ids}))`,
    ["public.club_events"],
  );
  await deleteFromIfExists(tx, "public.club_media", inClubs);
  await deleteFromIfExists(tx, "public.club_events", inClubs);
  await deleteFromIfExists(tx, "public.club_announcements", inClubs);
  await deleteFromIfExists(tx, "public.community_club_invites", inClubs);
  await deleteFromIfExists(tx, "public.community_club_members", inClubs);

  // Meets (gare e convocazioni): results and entries before the meet events, then the meets.
  await deleteFromIfExists(tx, "public.club_ai_external_meet_sources", inClubs);
  await deleteFromIfExists(tx, "public.club_meet_results", sql`meet_id IN (${clubMeets})`, ["public.club_meets"]);
  await deleteFromIfExists(
    tx,
    "public.club_meet_entries",
    sql`meet_event_id IN (SELECT id FROM club_meet_events WHERE meet_id IN (${clubMeets}))`,
    ["public.club_meet_events", "public.club_meets"],
  );
  await deleteFromIfExists(tx, "public.club_meet_result_import_batches", sql`meet_id IN (${clubMeets})`, ["public.club_meets"]);
  await deleteFromIfExists(tx, "public.club_meet_events", sql`meet_id IN (${clubMeets})`, ["public.club_meets"]);
  await deleteFromIfExists(tx, "public.club_meets", inClubs);

  // History, pool workouts and AI automation of the club.
  for (const table of [
    "public.club_historical_results",
    "public.club_historical_meets",
    "public.club_historical_athletes",
    "public.club_historical_import_runs",
    "public.club_historical_sources",
    "public.club_pool_workout_runs",
    "public.club_pool_workouts",
    "public.club_ai_automation_runs",
    "public.club_ai_automation_configs",
  ]) {
    await deleteFromIfExists(tx, table, inClubs);
  }

  if (await relationExists(tx, "public.ghost_challenges")) {
    await tx.execute(sql`UPDATE ghost_challenges SET club_id = NULL WHERE club_id IN (${ids})`);
  }

  await deleteFromIfExists(tx, "public.community_clubs", sql`id IN (${ids})`);
}

/** Rows other users still use, whose author column is set to null when the author goes. */
const AUTHORED_ROWS = [
  { table: "challenges", column: "creator_id" },
  { table: "club_events", column: "creator_id" },
  { table: "community_club_invites", column: "inviter_id" },
] as const;

/**
 * Challenges, club events and invites the user created stay, with the author set to null. A
 * column still NOT NULL (migration 0036 not run yet) is left to its foreign key.
 */
export async function releaseAuthoredRows(tx: SqlExecutor, userId: number): Promise<void> {
  for (const { table, column } of AUTHORED_ROWS) {
    const nullable = await tx.execute(sql`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}`);
    if ((nullable.rows[0] as { is_nullable?: string } | undefined)?.is_nullable !== "YES") continue;
    // Constant table and column names, never user input.
    await tx.execute(sql`UPDATE ${sql.raw(table)} SET ${sql.raw(column)} = NULL WHERE ${sql.raw(column)} = ${userId}`);
  }
}
