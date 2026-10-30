import { findMentions, mentionedIds } from "@shared/mentions";

/** A user picked after «@» in a composer. */
export type MentionUser = { userId: number; name: string | null; username: string | null };

export const MAX_MENTIONS = 10;

// Built with the constructor: the type check targets a version without the `u` literal flag.
const WORD_CHAR = new RegExp("[\\p{L}\\p{N}_]", "u");
const QUERY_CHARS = new RegExp("^[\\p{L}\\p{N}_.'-]{0,30}$", "u");

/**
 * The «@word» being typed right before the caret: where its «@» is and the word so far (empty
 * just after «@»). Null when the caret is not in one (after a space, inside an email).
 */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && WORD_CHAR.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  return QUERY_CHARS.test(query) ? { start: at, query } : null;
}

/**
 * `text` with `range` replaced by `token` followed by a space (the one already there, if any);
 * the caret goes after the space.
 */
export function insertMention(text: string, range: { start: number; end: number }, token: string) {
  const after = text.slice(range.end);
  const inserted = /^\s/.test(after) ? token : `${token} `;
  return {
    text: text.slice(0, range.start) + inserted + after,
    caret: range.start + token.length + 1,
  };
}

/**
 * `user` added to the picked ones: once each, at most ten counting only the picks still written
 * in `text` (one deleted from the text frees its place).
 */
export function addMention(mentions: MentionUser[], user: MentionUser, text: string): MentionUser[] {
  if (mentions.some((item) => item.userId === user.userId)) return mentions;
  return pickedMentionIds(text, mentions).length >= MAX_MENTIONS ? mentions : [...mentions, user];
}

/** The ids to send: picked users whose `@username`/`@name` is still in the text. */
export function pickedMentionIds(text: string, mentions: MentionUser[]): number[] {
  return mentionedIds(
    text,
    mentions.map((user) => ({ id: user.userId, name: user.name, username: user.username })),
  );
}

/** A post's stored mention (`tagged_users` of the feed). */
export type StoredMention = { user_id: number; name?: string | null; username?: string | null };

/**
 * The post's tagged users not written in its text: posts from before «@» mentions tagged people
 * apart, so they are still shown as chips under the text (the others are links in the text).
 */
export function taggedUsersNotInText<T extends StoredMention>(text: string | null | undefined, tagged: T[]): T[] {
  const inText = new Set(
    findMentions(
      text,
      tagged.map((user) => ({ id: Number(user.user_id), name: user.name, username: user.username })),
    ).map((match) => match.id),
  );
  return tagged.filter((user) => !inText.has(Number(user.user_id)));
}
