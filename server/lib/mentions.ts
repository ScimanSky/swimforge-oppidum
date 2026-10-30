/**
 * Server side of «@» mentions: the composer sends the ids it picked; only those still written
 * in the text (`@username` or `@name`, see shared/mentions.ts) are stored, and only those who
 * can read the post are told.
 */
import { sql } from "drizzle-orm";
import { mentionedIds, type MentionCandidate } from "@shared/mentions";
import { getDb } from "../db";

export const MAX_MENTIONS_PER_POST = 10;
/** Mentions plus the people tagged apart by posts from before «@» (the input allows 20). */
const MAX_TAGGED_PER_POST = 20;

function validIds(authorUserId: number, ids: readonly number[] | null | undefined) {
  return Array.from(
    new Set((ids ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0 && id !== authorUserId)),
  );
}

const idList = (ids: number[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `);

/**
 * The picked ids still mentioned in `content`: not the author, at most ten. With `keepTagged`
 * (the post's tagged users before an edit), a picked id among them stays even when it is not
 * written in the text: posts from before «@» mentions tagged people apart, and the editor keeps
 * those tags unless the author removes them. Users who no longer exist are dropped.
 */
export async function resolveMentionedUserIds(
  authorUserId: number,
  content: string | null | undefined,
  pickedIds: readonly number[] | null | undefined,
  options: { keepTagged?: readonly number[] | null } = {},
): Promise<number[]> {
  const keep = new Set(validIds(authorUserId, options.keepTagged));
  const picked = validIds(authorUserId, pickedIds);
  const ids = content?.includes("@") ? picked : picked.filter((id) => keep.has(id));
  if (!ids.length) return [];
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
  const mentioned = mentionedIds(content, candidates).slice(0, MAX_MENTIONS_PER_POST);
  const kept = candidates.map((user) => user.id).filter((id) => keep.has(id) && !mentioned.includes(id));
  return [...mentioned, ...kept].slice(0, MAX_TAGGED_PER_POST);
}

/**
 * The tagged users of a post not written in its text: posts from before «@» mentions tagged
 * people apart (shown as chips). An edit may keep them without writing them.
 */
export function taggedApartIds(
  content: string | null | undefined,
  tagged: ReadonlyArray<{ userId: number; name?: string | null; username?: string | null }>,
): number[] {
  const candidates = tagged.map((user) => ({ id: Number(user.userId), name: user.name, username: user.username }));
  const inText = new Set(mentionedIds(content, candidates));
  return candidates.map((user) => user.id).filter((id) => !inText.has(id));
}

/**
 * Tells the mentioned users, through the notifications (type `mention`, pushed like the others).
 * Only those who can read the post: a club post only to active members, a private post to nobody.
 * Once per post: whoever already has a `mention` notification for it is not told again, so
 * editing a post or sharing the same swim again never repeats it.
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
        AND NOT EXISTS (
          SELECT 1 FROM user_notifications n
          WHERE n.user_id = u.id
            AND n.type = 'mention'
            AND n.reference_id = ${input.postId}
        )
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
