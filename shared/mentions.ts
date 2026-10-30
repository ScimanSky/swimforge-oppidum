/**
 * «@» mentions in post text. Usernames are free text, not unique and may be missing, so a
 * mention is a user id picked in the composer plus the token written for it: `@username`, else
 * `@name`. Client and server use the same matcher: the server keeps only the picked ids whose
 * token is still in the text, the feed links a token to the stored id (never a text lookup).
 */

export type MentionCandidate = {
  id: number;
  name?: string | null;
  username?: string | null;
};

export type MentionMatch = { start: number; end: number; id: number };

// Built with the constructor: the type check targets a version without the `u` literal flag.
const WORD_CHAR = new RegExp("[\\p{L}\\p{N}_]", "u");

const clean = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");

/** The text the composer writes for a user: `@username`, else `@name`; null without either. */
export function mentionToken(user: MentionCandidate): string | null {
  const text = clean(user.username) || clean(user.name);
  return text ? `@${text}` : null;
}

/** Every token a user can be mentioned with: `@username` and `@name`. */
function tokensOf(user: MentionCandidate): string[] {
  return Array.from(new Set([clean(user.username), clean(user.name)].filter(Boolean).map((text) => `@${text}`)));
}

/**
 * The mentions of `candidates` in `text`, left to right. A mention starts with «@» at the start
 * or after a character that is not a letter, digit or «_» (so not inside an email), and ends
 * before one that is not. Case-insensitive; at one position the longest token wins
 * (`@Ada Rossi` over `@Ada`).
 */
export function findMentions(text: string | null | undefined, candidates: MentionCandidate[]): MentionMatch[] {
  if (!text) return [];
  const tokens = candidates
    .flatMap((user) => tokensOf(user).map((token) => ({ id: user.id, token, lower: token.toLowerCase() })))
    .sort((a, b) => b.token.length - a.token.length);
  if (!tokens.length) return [];

  const matches: MentionMatch[] = [];
  let index = text.indexOf("@");
  while (index !== -1) {
    const before = index > 0 ? text[index - 1] : "";
    let next = index + 1;
    if (!before || !WORD_CHAR.test(before)) {
      for (const candidate of tokens) {
        const end = index + candidate.token.length;
        if (text.slice(index, end).toLowerCase() !== candidate.lower) continue;
        const after = text[end] ?? "";
        if (after && WORD_CHAR.test(after)) continue;
        matches.push({ start: index, end, id: candidate.id });
        next = end;
        break;
      }
    }
    index = text.indexOf("@", next);
  }
  return matches;
}

/** The ids of `candidates` still mentioned in `text`, once each, in the candidates' order. */
export function mentionedIds(text: string | null | undefined, candidates: MentionCandidate[]): number[] {
  const found = new Set(findMentions(text, candidates).map((match) => match.id));
  return Array.from(new Set(candidates.map((user) => user.id))).filter((id) => found.has(id));
}
