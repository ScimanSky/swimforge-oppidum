/**
 * Server side of «@» mentions: the composer sends the ids it picked; only those still written
 * in the text (`@username` or `@name`, see shared/mentions.ts) are stored, and only those who
 * can read the post are told.
 */
import { sql } from "drizzle-orm";
import { mentionedIds, type MentionCandidate } from "@shared/mentions";
import { getDb } from "../db";

export const MAX_MENTIONS_PER_POST = 10;

function validIds(authorUserId: number, ids: readonly number[] | null | undefined) {
  return Array.from(
    new Set((ids ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0 && id !== authorUserId)),
  );
}

const idList = (ids: number[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);

/** The picked ids still mentioned in `content`: not the author, at most ten. */
export async function resolveMentionedUserIds(
  authorUserId: number,
  content: string | null | undefined,
  pickedIds: readonly number[] | null | undefined,
): Promise<number[]> {
  const ids = validIds(authorUserId, pickedIds);
  if (!ids.length || !content?.includes("@")) return [];
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT u.id, u.name, sp.username
    FROM users u
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    WHERE u.id IN (${idList(ids)})
  `);
  const byId = new Map<number, MentionCandidate>(
    (result.rows as Array<{ id: number; name: string | null; username: string | null }>).map((row) => [
      Number(row.id),
      { id: Number(row.id), name: row.name, username: row.username },
    ]),
  );
  const candidates = ids.flatMap((id) => {
    const user = byId.get(id);
    return user ? [user] : [];
  });
  return mentionedIds(content, candidates).slice(0, MAX_MENTIONS_PER_POST);
}

/**
 * Tells the mentioned users, through the notifications (type `mention`, pushed like the others).
 * Only those who can read the post: a club post only to active members, a private post to nobody.
 * Best effort: never fails the post.
 */
export async function notifyMentionedUsers(input: {
  authorUserId: number;
  mentionedUserIds: readonly number[];
  postId: number;
  clubId?: number | null;
}) {
  const ids = validIds(input.authorUserId, input.mentionedUserIds);
  if (!ids.length) return;
  try {
    const db = await getDb();
    if (!db) return;
    const readers = await db.execute(sql`
      SELECT u.id
      FROM users u
      JOIN social_posts p ON p.id = ${input.postId}
      WHERE u.id IN (${idList(ids)})
        AND p.is_deleted = false
        AND CASE
          WHEN p.club_id IS NOT NULL THEN EXISTS (
            SELECT 1 FROM community_club_members m
            WHERE m.club_id = p.club_id AND m.user_id = u.id AND m.status = 'active'
          )
          ELSE p.visibility IS DISTINCT FROM 'private'
        END
    `);
    const readerIds = (readers.rows as Array<{ id: number }>).map((row) => Number(row.id));
    if (!readerIds.length) return;

    const actor = await db.execute(sql`SELECT name FROM users WHERE id = ${input.authorUserId} LIMIT 1`);
    const actorName = (actor.rows[0] as { name?: string | null } | undefined)?.name?.trim() || "Qualcuno";
    const link = input.clubId ? `/community/club/${input.clubId}` : `/post/${input.postId}`;
    const { createNotification } = await import("../db_social_enhanced");
    await Promise.all(
      readerIds.map((userId) =>
        createNotification({
          userId,
          type: "mention",
          title: "Ti hanno menzionato",
          message: `${actorName} ti ha menzionato in un post.`,
          link,
          referenceId: input.postId,
          actorId: input.authorUserId,
        }),
      ),
    );
  } catch {
    // Best effort: a mention notification never blocks the post.
  }
}
