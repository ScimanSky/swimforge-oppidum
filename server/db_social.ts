import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  socialPosts,
  socialSplashes,
  socialComments,
  socialHiddenPosts,
  socialPostReports,
  swimmingActivities,
  userNotifications,
} from "../drizzle/schema";

export type FeedScope = "global" | "self" | "following";
export type PostReportReason = "spam" | "offensive" | "harassment" | "misinformation" | "other";
export type PostReportStatus = "open" | "in_review" | "resolved" | "rejected";

export async function getSocialFeed(userId: number, options: { limit?: number; scope?: FeedScope; before?: Date } = {}) {
  const db = await getDb();
  if (!db) return [];

  const limit = options.limit ?? 20;
  const scope = options.scope ?? "global";
  const filters = [sql`p.is_deleted = false`, sql`p.club_id IS NULL`];
  filters.push(
    sql`NOT EXISTS (SELECT 1 FROM social_hidden_posts hp WHERE hp.post_id = p.id AND hp.user_id = ${userId})`
  );

  if (scope === "self") {
    filters.push(sql`p.user_id = ${userId}`);
  } else if (scope === "following") {
    filters.push(sql`p.user_id IN (SELECT following_id FROM social_follows WHERE follower_id = ${userId} AND status = 'accepted')`);
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
      p.club_id,
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
      ) AS has_splashed,
      EXISTS(
        SELECT 1 FROM social_follows f
        WHERE f.follower_id = ${userId} AND f.following_id = p.user_id AND f.status = 'accepted'
      ) AS is_following
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

export async function hidePostForUser(userId: number, postId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const post = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.isDeleted, false)))
    .limit(1);
  if (!post.length) {
    throw new Error("Post not found");
  }

  await db
    .insert(socialHiddenPosts)
    .values({
      userId,
      postId,
      createdAt: new Date(),
    })
    .onConflictDoNothing({
      target: [socialHiddenPosts.userId, socialHiddenPosts.postId],
    });

  return { hidden: true };
}

export async function unhidePostForUser(userId: number, postId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(socialHiddenPosts)
    .where(and(eq(socialHiddenPosts.userId, userId), eq(socialHiddenPosts.postId, postId)));

  return { hidden: false };
}

export async function reportPost(userId: number, input: { postId: number; reason: PostReportReason; details?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const post = await db
    .select({
      id: socialPosts.id,
      userId: socialPosts.userId,
      isDeleted: socialPosts.isDeleted,
    })
    .from(socialPosts)
    .where(eq(socialPosts.id, input.postId))
    .limit(1);

  const postRow = post[0];
  if (!postRow || postRow.isDeleted) {
    throw new Error("Post not found");
  }
  if (postRow.userId === userId) {
    throw new Error("Cannot report your own post");
  }

  const now = new Date();
  const inserted = await db
    .insert(socialPostReports)
    .values({
      postId: input.postId,
      reporterUserId: userId,
      reason: input.reason,
      details: input.details?.trim() || null,
      status: "open",
      adminNote: null,
      handledBy: null,
      handledAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [socialPostReports.postId, socialPostReports.reporterUserId],
      set: {
        reason: input.reason,
        details: input.details?.trim() || null,
        status: "open",
        adminNote: null,
        handledBy: null,
        handledAt: null,
        updatedAt: now,
      },
    })
    .returning({ id: socialPostReports.id });

  return { success: true, reportId: inserted[0]?.id ?? null };
}

export async function listPostReports(options: {
  status?: PostReportStatus | "all";
  limit?: number;
  offset?: number;
} = {}) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const offset = Math.max(0, options.offset ?? 0);
  const status = options.status ?? "open";
  const where = status === "all" ? sql`TRUE` : sql`r.status = ${status}`;

  const itemsResult = await db.execute(sql`
    SELECT
      r.id,
      r.post_id,
      r.reporter_user_id,
      r.reason,
      r.details,
      r.status,
      r.admin_note,
      r.handled_by,
      r.handled_at,
      r.created_at,
      r.updated_at,
      p.content AS post_content,
      p.media_url AS post_media_url,
      p.user_id AS post_author_id,
      author.name AS post_author_name,
      reporter.name AS reporter_name,
      handler.name AS handled_by_name
    FROM social_post_reports r
    JOIN social_posts p ON p.id = r.post_id
    JOIN users author ON author.id = p.user_id
    JOIN users reporter ON reporter.id = r.reporter_user_id
    LEFT JOIN users handler ON handler.id = r.handled_by
    WHERE ${where}
    ORDER BY r.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  const totalResult = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM social_post_reports r
    WHERE ${where}
  `);

  return {
    items: itemsResult.rows,
    total: Number((totalResult.rows[0] as { total?: number } | undefined)?.total ?? 0),
  };
}

export async function updatePostReportStatus(input: {
  reportId: number;
  status: PostReportStatus;
  adminUserId: number;
  adminNote?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const handledAt = input.status === "resolved" || input.status === "rejected" ? now : null;

  const updated = await db
    .update(socialPostReports)
    .set({
      status: input.status,
      adminNote: input.adminNote?.trim() || null,
      handledBy: input.adminUserId,
      handledAt,
      updatedAt: now,
    })
    .where(eq(socialPostReports.id, input.reportId))
    .returning({
      id: socialPostReports.id,
      postId: socialPostReports.postId,
      reporterUserId: socialPostReports.reporterUserId,
    });

  if (!updated.length) {
    throw new Error("Report not found");
  }

  const statusLabel: Record<PostReportStatus, string> = {
    open: "aperta",
    in_review: "in revisione",
    resolved: "risolta",
    rejected: "respinta",
  };
  const statusMessage: Record<PostReportStatus, string> = {
    open: "La tua segnalazione è stata riaperta.",
    in_review: "La tua segnalazione è ora in revisione.",
    resolved: "La tua segnalazione è stata risolta.",
    rejected: "La tua segnalazione è stata respinta.",
  };

  const adminNote = input.adminNote?.trim();
  const message = adminNote
    ? `${statusMessage[input.status]} Nota admin: ${adminNote}`
    : statusMessage[input.status];

  await db.insert(userNotifications).values({
    userId: updated[0].reporterUserId,
    type: "report_update",
    title: `Segnalazione ${statusLabel[input.status]}`,
    message,
    link: "/home",
    referenceId: updated[0].id,
  });

  return { success: true };
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

  const basePayload = {
    content: data.content ?? null,
    mediaUrl: data.mediaUrl ?? null,
    visibility: data.visibility ?? "public",
    isDeleted: false,
    updatedAt: new Date(),
  };

  if (existing.length) {
    await db.update(socialPosts).set(basePayload).where(eq(socialPosts.id, existing[0].id));
    return existing[0].id;
  }

  const inserted = await db
    .insert(socialPosts)
    .values({
      userId,
      activityId,
      clubId: null,
      ...basePayload,
      createdAt: new Date(),
    })
    .returning({ id: socialPosts.id });
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

  const postMeta = await db.execute(sql`
    SELECT user_id, club_id FROM social_posts WHERE id = ${postId} LIMIT 1
  `);
  const ownerId = (postMeta.rows[0] as any)?.user_id as number | undefined;
  const clubId = (postMeta.rows[0] as any)?.club_id as number | null | undefined;
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

  // Notification for post owner (only on create)
  if (ownerId && ownerId !== userId) {
    try {
      const actor = await db.execute(sql`SELECT name FROM users WHERE id = ${userId} LIMIT 1`);
      const actorName = ((actor.rows[0] as any)?.name as string | undefined) || "Qualcuno";
      const { createNotification } = await import("./db_social_enhanced");
      const link = clubId ? `/community/club/${clubId}` : "/community";
      await createNotification({
        userId: ownerId,
        type: "splash",
        title: "Nuovo Splash",
        message: `${actorName} ha messo Splash al tuo post.`,
        link,
        referenceId: postId,
      });
    } catch {
      // Notifications are best-effort; don't break splash interaction if it fails.
    }
  }

  return { splashed: true };
}

export async function addComment(userId: number, postId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const inserted = await db
    .insert(socialComments)
    .values({ postId, userId, content, createdAt: new Date(), updatedAt: new Date() })
    .returning({ id: socialComments.id });

  // Notification for post owner (only on create)
  try {
    const postMeta = await db.execute(sql`
      SELECT user_id, club_id FROM social_posts WHERE id = ${postId} LIMIT 1
    `);
    const ownerId = (postMeta.rows[0] as any)?.user_id as number | undefined;
    const clubId = (postMeta.rows[0] as any)?.club_id as number | null | undefined;

    if (ownerId && ownerId !== userId) {
      const actor = await db.execute(sql`SELECT name FROM users WHERE id = ${userId} LIMIT 1`);
      const actorName = ((actor.rows[0] as any)?.name as string | undefined) || "Qualcuno";
      const preview = content.trim().slice(0, 120);
      const { createNotification } = await import("./db_social_enhanced");
      const link = clubId ? `/community/club/${clubId}` : "/community";
      await createNotification({
        userId: ownerId,
        type: "comment",
        title: "Nuovo commento",
        message: `${actorName}: ${preview}${content.trim().length > 120 ? "..." : ""}`,
        link,
        referenceId: postId,
      });
    }
  } catch {
    // Best-effort
  }

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
