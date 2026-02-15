import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { deleteImageKitFileById } from "./lib/imagekit";

export const STORY_REACTION_TYPES = ["splash", "fire", "strong", "clap", "wave"] as const;
export type StoryReactionType = (typeof STORY_REACTION_TYPES)[number];

function normalizeReactionCounts(raw: unknown): Record<string, number> {
  if (!raw) return {};
  const input =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        })()
      : raw;
  if (typeof input !== "object" || input === null || Array.isArray(input)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n > 0) out[key] = Math.floor(n);
  }
  return out;
}

export async function createStory(
  userId: number,
  data: { mediaUrl?: string | null; imageKitFileId?: string | null; caption?: string | null; type: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    INSERT INTO stories (user_id, media_url, imagekit_file_id, caption, type, expires_at, created_at)
    VALUES (
      ${userId},
      ${data.mediaUrl ?? null},
      ${data.imageKitFileId ?? null},
      ${data.caption ?? null},
      ${data.type},
      NOW() + INTERVAL '24 hours',
      NOW()
    )
    RETURNING id, user_id, media_url, imagekit_file_id, caption, type, expires_at, created_at
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
      COALESCE((
        SELECT jsonb_object_agg(sr.reaction_type, sr.cnt)
        FROM (
          SELECT reaction_type, COUNT(*)::int AS cnt
          FROM story_reactions
          WHERE story_id = s.id
          GROUP BY reaction_type
        ) sr
      ), '{}'::jsonb) AS reaction_counts,
      (
        SELECT sr.reaction_type
        FROM story_reactions sr
        WHERE sr.story_id = s.id AND sr.user_id = ${viewerId}
        LIMIT 1
      ) AS user_reaction,
      COALESCE((
        SELECT COUNT(*)::int
        FROM story_reactions sr
        WHERE sr.story_id = s.id
      ), 0) AS reactions_total,
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
      reactionCounts: normalizeReactionCounts(row.reaction_counts),
      userReaction: row.user_reaction ?? null,
      reactionsTotal: Number(row.reactions_total ?? 0),
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

  const existing = await db.execute(sql`
    SELECT id, imagekit_file_id
    FROM stories
    WHERE id = ${storyId} AND user_id = ${userId}
    LIMIT 1
  `);

  if (!existing.rows.length) {
    throw new Error("Story not found or not owned by user");
  }

  await db.execute(sql`
    DELETE FROM story_reactions
    WHERE story_id = ${storyId}
  `);

  await db.execute(sql`
    DELETE FROM story_views
    WHERE story_id = ${storyId}
  `);

  await db.execute(sql`
    DELETE FROM stories
    WHERE id = ${storyId} AND user_id = ${userId}
    RETURNING id, imagekit_file_id
  `);

  const deleted = existing.rows[0] as { id: number; imagekit_file_id: string | null };
  return {
    success: true,
    storyId: deleted.id,
    imageKitFileId: deleted.imagekit_file_id,
  };
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

export async function getStoryById(storyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    SELECT id, user_id, expires_at
    FROM stories
    WHERE id = ${storyId}
    LIMIT 1
  `);
  return (result.rows[0] as { id: number; user_id: number; expires_at: Date } | undefined) ?? null;
}

export async function toggleStoryReaction(params: {
  storyId: number;
  userId: number;
  reactionType: StoryReactionType;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const story = await getStoryById(params.storyId);
  if (!story) throw new Error("Story not found");
  if (new Date(story.expires_at).getTime() <= Date.now()) {
    throw new Error("Story expired");
  }

  const existingResult = await db.execute(sql`
    SELECT id, reaction_type
    FROM story_reactions
    WHERE story_id = ${params.storyId} AND user_id = ${params.userId}
    LIMIT 1
  `);
  const existing = existingResult.rows[0] as { id: number; reaction_type: StoryReactionType } | undefined;

  if (existing) {
    if (existing.reaction_type === params.reactionType) {
      await db.execute(sql`
        DELETE FROM story_reactions
        WHERE id = ${existing.id}
      `);
      return { storyOwnerId: story.user_id, reaction: null, removed: true };
    }

    const updated = await db.execute(sql`
      UPDATE story_reactions
      SET reaction_type = ${params.reactionType}, created_at = NOW()
      WHERE id = ${existing.id}
      RETURNING id, story_id, user_id, reaction_type, created_at
    `);
    return {
      storyOwnerId: story.user_id,
      reaction: updated.rows[0] ?? null,
      removed: false,
    };
  }

  const inserted = await db.execute(sql`
    INSERT INTO story_reactions (story_id, user_id, reaction_type, created_at)
    VALUES (${params.storyId}, ${params.userId}, ${params.reactionType}, NOW())
    RETURNING id, story_id, user_id, reaction_type, created_at
  `);

  return {
    storyOwnerId: story.user_id,
    reaction: inserted.rows[0] ?? null,
    removed: false,
  };
}

export async function getStoryReactionSummary(storyId: number, viewerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    SELECT
      COALESCE((
        SELECT jsonb_object_agg(sr.reaction_type, sr.cnt)
        FROM (
          SELECT reaction_type, COUNT(*)::int AS cnt
          FROM story_reactions
          WHERE story_id = ${storyId}
          GROUP BY reaction_type
        ) sr
      ), '{}'::jsonb) AS reaction_counts,
      (
        SELECT sr.reaction_type
        FROM story_reactions sr
        WHERE sr.story_id = ${storyId} AND sr.user_id = ${viewerId}
        LIMIT 1
      ) AS user_reaction,
      COALESCE((
        SELECT COUNT(*)::int
        FROM story_reactions sr
        WHERE sr.story_id = ${storyId}
      ), 0) AS reactions_total
  `);

  const row = (result.rows[0] as {
    reaction_counts: unknown;
    user_reaction: StoryReactionType | null;
    reactions_total: number;
  } | undefined) ?? {
    reaction_counts: {},
    user_reaction: null,
    reactions_total: 0,
  };

  return {
    counts: normalizeReactionCounts(row.reaction_counts),
    userReaction: row.user_reaction ?? null,
    total: Number(row.reactions_total ?? 0),
  };
}

export async function cleanupExpiredStories(limit = 300) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const expiredResult = await db.execute(sql`
    SELECT id, imagekit_file_id
    FROM stories
    WHERE expires_at <= NOW()
    ORDER BY expires_at ASC
    LIMIT ${Math.max(1, Math.min(limit, 2000))}
  `);

  const expiredStories = expiredResult.rows as Array<{ id: number; imagekit_file_id: string | null }>;
  if (!expiredStories.length) {
    return {
      scanned: 0,
      deletedStories: 0,
      deletedFiles: 0,
      notFoundFiles: 0,
      failedFiles: 0,
      skippedStories: 0,
    };
  }

  const fileDeleteState = new Map<string, "ok" | "not_found" | "failed">();
  const deletableStoryIds: number[] = [];
  let deletedFiles = 0;
  let notFoundFiles = 0;
  let failedFiles = 0;
  let skippedStories = 0;

  for (const story of expiredStories) {
    const fileId = story.imagekit_file_id?.trim() ?? "";
    if (!fileId) {
      deletableStoryIds.push(story.id);
      continue;
    }

    const cachedStatus = fileDeleteState.get(fileId);
    if (cachedStatus === "ok" || cachedStatus === "not_found") {
      deletableStoryIds.push(story.id);
      continue;
    }
    if (cachedStatus === "failed") {
      skippedStories += 1;
      continue;
    }

    try {
      const deletion = await deleteImageKitFileById(fileId);
      if (deletion.deleted) {
        deletedFiles += 1;
        fileDeleteState.set(fileId, "ok");
      } else if (deletion.notFound) {
        notFoundFiles += 1;
        fileDeleteState.set(fileId, "not_found");
      } else {
        fileDeleteState.set(fileId, "ok");
      }
      deletableStoryIds.push(story.id);
    } catch {
      failedFiles += 1;
      skippedStories += 1;
      fileDeleteState.set(fileId, "failed");
    }
  }

  if (deletableStoryIds.length) {
    const storyIdsSql = sql.join(deletableStoryIds.map((id) => sql`${id}`), sql`, `);

    await db.execute(sql`
      DELETE FROM story_reactions
      WHERE story_id IN (${storyIdsSql})
    `);

    await db.execute(sql`
      DELETE FROM story_views
      WHERE story_id IN (${storyIdsSql})
    `);

    await db.execute(sql`
      DELETE FROM stories
      WHERE id IN (${storyIdsSql})
    `);
  }

  return {
    scanned: expiredStories.length,
    deletedStories: deletableStoryIds.length,
    deletedFiles,
    notFoundFiles,
    failedFiles,
    skippedStories,
  };
}

export async function getStoryCleanupStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM stories) AS total_stories,
      (SELECT COUNT(*)::int FROM stories WHERE expires_at > NOW()) AS active_stories,
      (SELECT COUNT(*)::int FROM stories WHERE expires_at <= NOW()) AS expired_stories,
      (SELECT COUNT(*)::int FROM stories WHERE expires_at <= NOW() AND imagekit_file_id IS NOT NULL AND imagekit_file_id <> '') AS expired_with_imagekit,
      (SELECT COUNT(*)::int FROM stories WHERE imagekit_file_id IS NOT NULL AND imagekit_file_id <> '') AS stories_with_imagekit,
      (SELECT COUNT(*)::int FROM story_reactions) AS total_reactions,
      (SELECT COUNT(*)::int FROM story_views) AS total_views
  `);

  const row = (result.rows[0] as {
    total_stories: number;
    active_stories: number;
    expired_stories: number;
    expired_with_imagekit: number;
    stories_with_imagekit: number;
    total_reactions: number;
    total_views: number;
  } | undefined) ?? {
    total_stories: 0,
    active_stories: 0,
    expired_stories: 0,
    expired_with_imagekit: 0,
    stories_with_imagekit: 0,
    total_reactions: 0,
    total_views: 0,
  };

  return {
    totalStories: Number(row.total_stories ?? 0),
    activeStories: Number(row.active_stories ?? 0),
    expiredStories: Number(row.expired_stories ?? 0),
    expiredWithImagekit: Number(row.expired_with_imagekit ?? 0),
    storiesWithImagekit: Number(row.stories_with_imagekit ?? 0),
    totalReactions: Number(row.total_reactions ?? 0),
    totalViews: Number(row.total_views ?? 0),
  };
}
