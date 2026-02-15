import { sql } from "drizzle-orm";
import { getDb } from "./db";

export async function createStory(
  userId: number,
  data: { mediaUrl?: string | null; caption?: string | null; type: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    INSERT INTO stories (user_id, media_url, caption, type, expires_at, created_at)
    VALUES (
      ${userId},
      ${data.mediaUrl ?? null},
      ${data.caption ?? null},
      ${data.type},
      NOW() + INTERVAL '24 hours',
      NOW()
    )
    RETURNING id, user_id, media_url, caption, type, expires_at, created_at
  `);

  return result.rows[0] ?? null;
}

export async function getActiveStories(viewerId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT
      s.id,
      s.user_id,
      s.media_url,
      s.caption,
      s.type,
      s.expires_at,
      s.created_at,
      u.name AS user_name,
      sp.avatar_url AS user_avatar,
      EXISTS(
        SELECT 1 FROM story_views sv
        WHERE sv.story_id = s.id AND sv.viewer_id = ${viewerId}
      ) AS has_viewed
    FROM stories s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    WHERE s.expires_at > NOW()
    ORDER BY s.user_id, s.created_at ASC
  `);

  // Group by user
  const grouped = new Map<
    number,
    { userId: number; userName: string | null; userAvatar: string | null; stories: unknown[] }
  >();

  for (const row of result.rows as any[]) {
    const uid = row.user_id as number;
    if (!grouped.has(uid)) {
      grouped.set(uid, {
        userId: uid,
        userName: row.user_name,
        userAvatar: row.user_avatar,
        stories: [],
      });
    }
    grouped.get(uid)!.stories.push({
      id: row.id,
      mediaUrl: row.media_url,
      caption: row.caption,
      type: row.type,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      hasViewed: row.has_viewed,
    });
  }

  return Array.from(grouped.values());
}

export async function markStoryViewed(storyId: number, viewerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(sql`
    INSERT INTO story_views (story_id, viewer_id, viewed_at)
    VALUES (${storyId}, ${viewerId}, NOW())
    ON CONFLICT (story_id, viewer_id) DO NOTHING
  `);

  return { success: true };
}

export async function deleteStory(storyId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    DELETE FROM stories
    WHERE id = ${storyId} AND user_id = ${userId}
    RETURNING id
  `);

  if (!result.rows.length) {
    throw new Error("Story not found or not owned by user");
  }

  return { success: true };
}

export async function getStoryViewers(storyId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT
      sv.viewer_id,
      sv.viewed_at,
      u.name AS viewer_name,
      sp.avatar_url AS viewer_avatar
    FROM story_views sv
    JOIN users u ON u.id = sv.viewer_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    WHERE sv.story_id = ${storyId}
    ORDER BY sv.viewed_at DESC
  `);

  return result.rows;
}
