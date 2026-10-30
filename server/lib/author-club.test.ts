import { describe, expect, it } from "vitest";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { authorClubNameSql } from "./author-club";

// The club next to an author's name: their «Club principale» when set and still theirs, nothing
// when they chose «Nessuno», else their most recently joined club. Either way a club that is not
// public shows only to its own active members.

const render = (query: SQL) => new PgDialect().sqlToQuery(query);

function between(text: string, from: string, to: string) {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start + from.length);
  expect(start, `«${from}» in the query`).toBeGreaterThanOrEqual(0);
  expect(end, `«${to}» after «${from}»`).toBeGreaterThan(start);
  return text.slice(start, end);
}

function expectVisibleOnlyToViewer(part: string, params: unknown[], viewerId: number) {
  expect(part).toMatch(/c\.visibility = 'public' AND c\.is_private IS NOT TRUE/);
  expect(part).toMatch(/vm\.club_id = c\.id/);
  expect(part).toMatch(/vm\.status = 'active'/);
  const viewerParam = /vm\.user_id = \$(\d+)/.exec(part);
  expect(viewerParam, "the membership check is bound to the viewer").not.toBeNull();
  expect(params[Number(viewerParam![1]) - 1]).toBe(viewerId);
}

describe("authorClubNameSql", () => {
  const { sql: text, params } = render(authorClubNameSql(42));

  it("reads the author's preferences.primaryClubId, only from an object, only a whole number as an id", () => {
    expect(text).toMatch(/LEFT JOIN swimmer_profiles psp ON psp\.user_id = p\.user_id/);
    expect(text).toMatch(/jsonb_typeof\(psp\.preferences::jsonb\) = 'object'/);
    expect(text).toMatch(/-> 'primaryClubId'/);
    // The cast sits inside a CASE after the checks: a malformed value can never break the feed.
    expect(text).toMatch(
      /CASE\s+WHEN jsonb_typeof\(stored\.value\) = 'number' AND \(stored\.value #>> '\{\}'\) ~ '\^\[0-9\]\{1,9\}\$'\s+THEN \(stored\.value #>> '\{\}'\)::integer/,
    );
  });

  it("«Nessuno» (an explicit null) shows no club", () => {
    expect(text).toMatch(/WHEN jsonb_typeof\(pref\.primary_club\) = 'null' THEN NULL/);
  });

  it("the chosen club only while the author is an active member, and only if the viewer may see it", () => {
    const primary = between(text, "WHEN pref.primary_club_id IS NOT NULL", "ELSE (");
    expect(primary).toMatch(/pm\.user_id = p\.user_id/);
    expect(primary).toMatch(/pm\.status = 'active'/);
    expect(primary).toMatch(/pm\.club_id = pref\.primary_club_id/);
    expect(primary).toMatch(/c\.id = pref\.primary_club_id/);
    // A private chosen club is not shown to non-members (and no other club in its place).
    expectVisibleOnlyToViewer(primary, params, 42);
  });

  it("otherwise (not set, or left) the most recently joined club the viewer may see", () => {
    const fallback = between(text, "ELSE (", "END");
    expect(fallback).toMatch(/m\.user_id = p\.user_id/);
    expect(fallback).toMatch(/m\.status = 'active'/);
    expect(fallback).toMatch(/ORDER BY m\.joined_at DESC NULLS LAST, m\.id DESC/);
    expectVisibleOnlyToViewer(fallback, params, 42);
  });

  it("takes the author from another column, e.g. a public profile", () => {
    const { sql: profileText } = render(authorClubNameSql(42, sql`u.id`));
    expect(profileText).not.toMatch(/\bp\.user_id/);
    expect(profileText).toMatch(/psp\.user_id = u\.id/);
    expect(profileText).toMatch(/pm\.user_id = u\.id/);
    expect(profileText).toMatch(/m\.user_id = u\.id/);
  });
});
