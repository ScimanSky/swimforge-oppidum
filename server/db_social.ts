import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  socialPosts,
  socialSplashes,
  socialComments,
  swimmingActivities,
} from "../drizzle/schema";

export type FeedScope = "global" | "self";

export async function getSocialFeed(userId: number, options: { limit?: number; scope?: FeedScope; before?: Date } = {}) {
  const db = await getDb();
  if (!db) return [];

  const limit = options.limit ?? 20;
  const scope = options.scope ?? "global";
  const filters = [sql`p.is_deleted = false`];

  if (scope === "self") {
    filters.push(sql`p.user_id = ${userId}`);
  }
  if (options.before) {
    filters.push(sql`p.created_at < ${options.before}`);
  }

  const whereClause = sql.join(filters, sql` AND `);

  const result = await db.execute(sql`
    SELECT
      p.id,
      p.user_id,
      p.activity_id,
      p.content,
      p.media_url,
      p.visibility,
      p.created_at,
      p.updated_at,
      u.name AS user_name,
      u.email AS user_email,
      sp.avatar_url AS user_avatar,
      a.distance_meters AS activity_distance_meters,
      a.duration_seconds AS activity_duration_seconds,
      a.activity_date AS activity_date,
      a.activity_source AS activity_source,
      a.stroke_type AS activity_stroke_type,
      a.is_open_water AS activity_is_open_water,
      COALESCE((SELECT COUNT(*) FROM social_splashes s WHERE s.post_id = p.id), 0) AS splash_count,
      COALESCE((SELECT COUNT(*) FROM social_comments c WHERE c.post_id = p.id), 0) AS comment_count,
      EXISTS(
        SELECT 1 FROM social_splashes s
        WHERE s.post_id = p.id AND s.user_id = ${userId}
      ) AS has_splashed
    FROM social_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    LEFT JOIN swimming_activities a ON a.id = p.activity_id
    WHERE ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `);

  return result.rows;
}

export async function upsertActivityPost(userId: number, activityId: number, data: { content?: string | null; mediaUrl?: string | null; visibility?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const activity = await db
    .select({ id: swimmingActivities.id })
    .from(swimmingActivities)
    .where(and(eq(swimmingActivities.id, activityId), eq(swimmingActivities.userId, userId)))
    .limit(1);

  if (!activity.length) {
    throw new Error("Activity not found");
  }

  await db
    .update(swimmingActivities)
    .set({ shareToFeed: true })
    .where(eq(swimmingActivities.id, activityId));

  const existing = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(eq(socialPosts.activityId, activityId))
    .limit(1);

  const payload = {
    userId,
    activityId,
    content: data.content ?? null,
    mediaUrl: data.mediaUrl ?? null,
    visibility: data.visibility ?? "public",
    isDeleted: false,
    updatedAt: new Date(),
  };

  if (existing.length) {
    await db.update(socialPosts).set(payload).where(eq(socialPosts.id, existing[0].id));
    return existing[0].id;
  }

  const inserted = await db.insert(socialPosts).values({ ...payload, createdAt: new Date() }).returning({ id: socialPosts.id });
  return inserted[0]?.id ?? null;
}

export async function setActivityShare(userId: number, activityId: number, share: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const activity = await db
    .select({ id: swimmingActivities.id })
    .from(swimmingActivities)
    .where(and(eq(swimmingActivities.id, activityId), eq(swimmingActivities.userId, userId)))
    .limit(1);

  if (!activity.length) {
    throw new Error("Activity not found");
  }

  await db.update(swimmingActivities).set({ shareToFeed: share }).where(eq(swimmingActivities.id, activityId));

  if (share) {
    await upsertActivityPost(userId, activityId, { content: null, mediaUrl: null, visibility: "public" });
  } else {
    await db.update(socialPosts).set({ isDeleted: true, updatedAt: new Date() }).where(eq(socialPosts.activityId, activityId));
  }
}

export async function toggleSplash(userId: number, postId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const owner = await db.execute(sql`
    SELECT user_id FROM social_posts WHERE id = ${postId} LIMIT 1
  `);
  const ownerId = (owner.rows[0] as any)?.user_id;
  if (ownerId && ownerId === userId) {
    throw new Error("Cannot splash your own post");
  }

  const existing = await db
    .select({ id: socialSplashes.id })
    .from(socialSplashes)
    .where(and(eq(socialSplashes.postId, postId), eq(socialSplashes.userId, userId)))
    .limit(1);

  if (existing.length) {
    await db.delete(socialSplashes).where(eq(socialSplashes.id, existing[0].id));
    return { splashed: false };
  }

  await db.insert(socialSplashes).values({ postId, userId, createdAt: new Date() });
  return { splashed: true };
}

export async function addComment(userId: number, postId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const inserted = await db
    .insert(socialComments)
    .values({ postId, userId, content, createdAt: new Date(), updatedAt: new Date() })
    .returning({ id: socialComments.id });

  return inserted[0]?.id ?? null;
}

export async function getComments(postId: number) {
  const db = await getDb();
  if (!db) return [];

  const result = await db.execute(sql`
    SELECT
      c.id,
      c.post_id,
      c.user_id,
      c.content,
      c.created_at,
      u.name AS user_name,
      u.email AS user_email,
      sp.avatar_url AS user_avatar
    FROM social_comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN swimmer_profiles sp ON sp.user_id = u.id
    WHERE c.post_id = ${postId}
    ORDER BY c.created_at ASC
    LIMIT 50
  `);

  return result.rows;
}
