import { sql, type SQL } from "drizzle-orm";

/** `c` (a club) may be seen by the viewer: a public club, or one they are an active member of. */
function clubVisibleToViewerSql(viewerId: number) {
  return sql`(
    (c.visibility = 'public' AND c.is_private IS NOT TRUE)
    OR EXISTS (
      SELECT 1
      FROM community_club_members vm
      WHERE vm.club_id = c.id
        AND vm.user_id = ${viewerId}
        AND vm.status = 'active'
    )
  )`;
}

/**
 * The name of the author's club shown next to them (feed, post detail, public profile):
 * - their «Club principale» (`preferences.primaryClubId`) while they are still an active member
 *   of it; nothing when the viewer may not see that club (no other club in its place);
 * - nothing when they chose «Nessuno» (an explicit null);
 * - otherwise (not set, or a club they left) their most recently joined club the viewer may see.
 * A club that is not public shows only to its active members. `authorId` defaults to the post
 * author (`p.user_id`). Leaving the chosen club writes nothing: the membership check ignores it.
 */
export function authorClubNameSql(viewerId: number, authorId: SQL = sql`p.user_id`) {
  return sql`(
    SELECT CASE
      WHEN jsonb_typeof(pref.primary_club) = 'null' THEN NULL
      WHEN pref.primary_club_id IS NOT NULL AND EXISTS (
        SELECT 1
        FROM community_club_members pm
        WHERE pm.user_id = ${authorId}
          AND pm.status = 'active'
          AND pm.club_id = pref.primary_club_id
      ) THEN (
        SELECT c.name
        FROM community_clubs c
        WHERE c.id = pref.primary_club_id
          AND ${clubVisibleToViewerSql(viewerId)}
        LIMIT 1
      )
      ELSE (
        SELECT c.name
        FROM community_club_members m
        JOIN community_clubs c ON c.id = m.club_id
        WHERE m.user_id = ${authorId}
          AND m.status = 'active'
          AND ${clubVisibleToViewerSql(viewerId)}
        ORDER BY m.joined_at DESC NULLS LAST, m.id DESC
        LIMIT 1
      )
    END
    FROM (
      SELECT
        stored.value AS primary_club,
        -- Only a whole number is a club id (CASE: never casts anything else).
        CASE
          WHEN jsonb_typeof(stored.value) = 'number' AND (stored.value #>> '{}') ~ '^[0-9]{1,9}$'
            THEN (stored.value #>> '{}')::integer
        END AS primary_club_id
      FROM (SELECT 1) AS one
      LEFT JOIN swimmer_profiles psp ON psp.user_id = ${authorId}
      LEFT JOIN LATERAL (
        SELECT CASE
          WHEN jsonb_typeof(psp.preferences::jsonb) = 'object' THEN psp.preferences::jsonb -> 'primaryClubId'
        END AS value
      ) AS stored ON true
      LIMIT 1
    ) AS pref
  )`;
}
