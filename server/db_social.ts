import { DB_UNAVAILABLE_ERR_MSG } from "@shared/const";
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

/**
 * The name of the post author's most recent club (`p` is the social_posts alias), shown
 * next to the author. A club that is not public shows only to the viewer's own clubs:
 * otherwise the feed would tell everyone who belongs to a private or invite-only club.
 */
export function authorClubNameSql(viewerId: number) {
  return sql`(
    SELECT c.name
    FROM community_club_members m
    JOIN community_clubs c ON c.id = m.club_id
    WHERE m.user_id = p.user_id
      AND m.status = 'active'
      AND (
        (c.visibility = 'public' AND c.is_private IS NOT TRUE)
        OR EXISTS (
          SELECT 1
          FROM community_club_members vm
          WHERE vm.club_id = c.id
            AND vm.user_id = ${viewerId}
            AND vm.status = 'active'
        )
      )
    ORDER BY m.joined_at DESC NULLS LAST, m.id DESC
    LIMIT 1
  )`;
}

/**
 * Swim fields of a feed post (`p` post, `a` its activity): Garmin's average pace (from moving
 * time, not total time with rests) and the training records set in that swim, with the time
 * they beat.
 */
export function activityCardSql() {
  return sql`
      a.avg_pace_per_100m AS activity_avg_pace_per_100m,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'record_type', pr.record_type,
              'stroke_type', pr.stroke_type,
              'value', pr.value,
              'previous_value', pr.previous_value
            )
            ORDER BY pr.record_type, pr.stroke_type, pr.value
          )
          FROM personal_records pr
          WHERE p.activity_id IS NOT NULL
            AND pr.activity_id = p.activity_id
            AND pr.user_id = p.user_id
            AND pr.record_type LIKE 'pb\_%\_t'
        ),
        '[]'::json
      ) AS activity_records`;
}

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
      p.media_urls,
      p.tagged_user_ids,
      p.hashtags,
      p.visibility,
      p.created_at,
      p.updated_at,
      u.name AS user_name,
      sp.username AS user_username,
      sp.avatar_url AS user_avatar,
      ${authorClubNameSql(userId)} AS user_club_name,
      a.distance_meters AS activity_distance_meters,
      a.duration_seconds AS activity_duration_seconds,
      a.activity_date AS activity_date,
      a.activity_source AS activity_source,
      a.stroke_type AS activity_stroke_type,
      a.is_open_water AS activity_is_open_water,
      a.calories AS activity_calories,
      a.avg_heart_rate AS activity_heart_rate,
      a.swolf_score AS activity_swolf,
      ${activityCardSql()},
      COALESCE((SELECT COUNT(*) FROM social_splashes s WHERE s.post_id = p.id), 0) AS splash_count,
      COALESCE((SELECT COUNT(*) FROM social_comments c WHERE c.post_id = p.id), 0) AS comment_count,
      EXISTS(
        SELECT 1 FROM social_splashes s
        WHERE s.post_id = p.id AND s.user_id = ${userId}
      ) AS has_splashed,
      EXISTS(
        SELECT 1 FROM social_follows f
        WHERE f.follower_id = ${userId} AND f.following_id = p.user_id AND f.status = 'accepted'
      ) AS is_following,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'user_id', tu.id,
              'name', tu.name,
              'username', tsp.username,
              'avatar_url', tsp.avatar_url
            )
          )
          FROM users tu
          LEFT JOIN swimmer_profiles tsp ON tsp.user_id = tu.id
          WHERE tu.id = ANY(COALESCE(p.tagged_user_ids, '{}'::integer[]))
        ),
        '[]'::json
      ) AS tagged_users
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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  await db
    .delete(socialHiddenPosts)
    .where(and(eq(socialHiddenPosts.userId, userId), eq(socialHiddenPosts.postId, postId)));

  return { hidden: false };
}

type OwnPostRow = {
  id: number;
  user_id: number;
  activity_id: number | null;
  club_id: number | null;
  is_deleted: boolean;
  tagged_user_ids: number[] | null;
  activity_is_open_water?: boolean | null;
};

async function loadPostForAuthor(postId: number): Promise<OwnPostRow | null> {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);
  const result = await db.execute(sql`
    SELECT p.id, p.user_id, p.activity_id, p.club_id, p.is_deleted, p.tagged_user_ids,
      a.is_open_water AS activity_is_open_water
    FROM social_posts p
    LEFT JOIN swimming_activities a ON a.id = p.activity_id
    WHERE p.id = ${postId}
    LIMIT 1
  `);
  return (result.rows[0] as OwnPostRow | undefined) ?? null;
}

/** Default caption of a swim shared without text or photos. */
export function defaultActivityCaption(isOpenWater: boolean | null | undefined) {
  return isOpenWater ? "Allenamento in acque libere" : "Allenamento in piscina";
}

/**
 * The author deletes their post, at any time. Soft delete: every read filters is_deleted,
 * so the post disappears for everyone. A shared swim goes back to «not shared».
 */
export async function deleteOwnPost(userId: number, postId: number) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  const row = await loadPostForAuthor(postId);
  if (!row || row.is_deleted) {
    throw new Error("Post not found");
  }
  if (Number(row.user_id) !== userId) {
    throw new Error("Cannot delete other users posts");
  }

  await db.execute(sql`
    UPDATE social_posts SET is_deleted = true, updated_at = NOW()
    WHERE id = ${postId}
  `);

  if (row.activity_id) {
    await db.execute(sql`
      UPDATE swimming_activities SET share_to_feed = false
      WHERE id = ${row.activity_id} AND user_id = ${userId}
    `);
  }

  return { deleted: true as const };
}

/**
 * The author edits text and media of their post (feed, club or shared swim). The post keeps
 * its place in the feed. A swim without text or media gets the default caption; any other
 * post needs text or at least one media. Returns the mentions that were not there before.
 */
export async function updateOwnPost(
  userId: number,
  postId: number,
  data: { content?: string | null; mediaUrls?: string[] | null; taggedUserIds?: number[] | null }
) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  const row = await loadPostForAuthor(postId);
  if (!row || row.is_deleted) {
    throw new Error("Post not found");
  }
  if (Number(row.user_id) !== userId) {
    throw new Error("Cannot edit other users posts");
  }

  const mediaUrls = Array.from(
    new Set((data.mediaUrls ?? []).map((item) => item.trim()).filter((item) => item.length > 0))
  ).slice(0, 6);
  const rawContent = data.content?.trim() ?? "";
  let content: string | null = rawContent.length > 0 ? rawContent : null;
  if (!content && mediaUrls.length === 0) {
    if (!row.activity_id) throw new Error("Empty post");
    content = defaultActivityCaption(row.activity_is_open_water);
  }

  const previousTagged = new Set((row.tagged_user_ids ?? []).map(Number));
  const taggedUserIds = data.taggedUserIds ?? Array.from(previousTagged);
  const mediaArray = mediaUrls.length
    ? sql`ARRAY[${sql.join(mediaUrls.map((url) => sql`${url}`), sql`, `)}]::text[]`
    : sql`'{}'::text[]`;
  const taggedArray = taggedUserIds.length
    ? sql`ARRAY[${sql.join(taggedUserIds.map((id) => sql`${id}`), sql`, `)}]::integer[]`
    : sql`'{}'::integer[]`;

  await db.execute(sql`
    UPDATE social_posts
    SET content = ${content},
      media_url = ${mediaUrls[0] ?? null},
      media_urls = ${mediaArray},
      tagged_user_ids = ${taggedArray},
      updated_at = NOW()
    WHERE id = ${postId}
  `);

  return {
    postId,
    clubId: row.club_id,
    addedTaggedUserIds: taggedUserIds.filter((id) => !previousTagged.has(id)),
  };
}

/** The author's own post, by id or by the shared swim, with what the editor needs. */
export async function getOwnPostForEdit(userId: number, ref: { postId?: number; activityId?: number }) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);
  const where = ref.postId ? sql`p.id = ${ref.postId}` : sql`p.activity_id = ${ref.activityId ?? 0}`;
  const result = await db.execute(sql`
    SELECT
      p.id, p.activity_id, p.club_id, p.content, p.media_url, p.media_urls,
      COALESCE(
        (
          SELECT json_agg(json_build_object('user_id', tu.id, 'name', tu.name, 'username', tsp.username))
          FROM users tu
          LEFT JOIN swimmer_profiles tsp ON tsp.user_id = tu.id
          WHERE tu.id = ANY(COALESCE(p.tagged_user_ids, '{}'::integer[]))
        ),
        '[]'::json
      ) AS tagged_users
    FROM social_posts p
    WHERE ${where}
      AND p.user_id = ${userId}
      AND p.is_deleted = false
    ORDER BY p.id DESC
    LIMIT 1
  `);
  const row = result.rows[0] as
    | {
        id: number;
        activity_id: number | null;
        club_id: number | null;
        content: string | null;
        media_url: string | null;
        media_urls: string[] | null;
        tagged_users: Array<{ user_id: number; name: string | null; username: string | null }> | null;
      }
    | undefined;
  if (!row) return null;
  const mediaUrls = Array.isArray(row.media_urls) && row.media_urls.length
    ? row.media_urls
    : row.media_url
      ? [row.media_url]
      : [];
  return {
    id: Number(row.id),
    activityId: row.activity_id == null ? null : Number(row.activity_id),
    clubId: row.club_id == null ? null : Number(row.club_id),
    content: row.content ?? "",
    mediaUrls,
    taggedUsers: (row.tagged_users ?? []).map((user) => ({
      userId: Number(user.user_id),
      name: user.name ?? null,
      username: user.username ?? null,
    })),
  };
}

export async function reportPost(userId: number, input: { postId: number; reason: PostReportReason; details?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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

export async function upsertActivityPost(
  userId: number,
  activityId: number,
  data: {
    content?: string | null;
    mediaUrl?: string | null;
    mediaUrls?: string[] | null;
    taggedUserIds?: number[] | null;
    hashtags?: string[] | null;
    visibility?: string | null;
  }
) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  const activity = await db
    .select({
      id: swimmingActivities.id,
      isOpenWater: swimmingActivities.isOpenWater,
    })
    .from(swimmingActivities)
    .where(and(eq(swimmingActivities.id, activityId), eq(swimmingActivities.userId, userId)))
    .limit(1);

  if (!activity.length) {
    throw new Error("Activity not found");
  }

  const activityRow = activity[0];
  const normalizedMediaUrls = (data.mediaUrls ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
  const hasMedia = normalizedMediaUrls.length > 0 || Boolean(data.mediaUrl?.trim());
  const rawContent = data.content?.trim() ?? "";
  const fallbackContent = defaultActivityCaption(activityRow.isOpenWater);
  const resolvedContent = rawContent.length > 0 ? rawContent : !hasMedia ? fallbackContent : null;

  await db
    .update(swimmingActivities)
    .set({ shareToFeed: true })
    .where(eq(swimmingActivities.id, activityId));

  const existing = await db
    .select({ id: socialPosts.id, isDeleted: socialPosts.isDeleted })
    .from(socialPosts)
    .where(eq(socialPosts.activityId, activityId))
    .limit(1);

  // A swim with a training record tells the followers so.
  const recordCount = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM personal_records
    WHERE activity_id = ${activityId} AND user_id = ${userId} AND record_type LIKE 'pb\_%\_t'
  `);
  const hasRecord = Number((recordCount.rows[0] as { n?: number } | undefined)?.n ?? 0) > 0;
  const notificationTitle = hasRecord ? "Nuovo record nel feed" : "Nuova attività nel feed";
  const notificationText = hasRecord
    ? " ha condiviso una nuotata con un nuovo record."
    : " ha condiviso un nuovo allenamento.";

  const basePayload = {
    content: resolvedContent,
    mediaUrl: data.mediaUrl ?? null,
    mediaUrls: normalizedMediaUrls,
    taggedUserIds: data.taggedUserIds ?? [],
    hashtags: data.hashtags ?? [],
    visibility: data.visibility ?? "public",
    isDeleted: false,
    updatedAt: new Date(),
  };

  if (existing.length) {
    // A swim shared again after «Rimuovi dal feed» goes back to the top of the feed.
    const payload = existing[0].isDeleted ? { ...basePayload, createdAt: new Date() } : basePayload;
    await db.update(socialPosts).set(payload).where(eq(socialPosts.id, existing[0].id));
    await db.execute(sql`
      INSERT INTO user_notifications (user_id, type, title, message, link, reference_id, created_at)
      SELECT
        f.follower_id,
        'activity_shared',
        ${notificationTitle},
        COALESCE(u.name, 'Un nuotatore') || ${notificationText},
        ${`/post/${existing[0].id}`},
        ${existing[0].id},
        NOW()
      FROM social_follows f
      JOIN users u ON u.id = ${userId}
      WHERE f.following_id = ${userId}
        AND f.status = 'accepted'
        AND f.follower_id <> ${userId}
        AND NOT EXISTS (
          SELECT 1
          FROM user_notifications n
          WHERE n.user_id = f.follower_id
            AND n.type = 'activity_shared'
            AND n.reference_id = ${existing[0].id}
        )
    `);
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
  const postId = inserted[0]?.id ?? null;

  if (postId) {
    await db.execute(sql`
      INSERT INTO user_notifications (user_id, type, title, message, link, reference_id, created_at)
      SELECT
        f.follower_id,
        'activity_shared',
        ${notificationTitle},
        COALESCE(u.name, 'Un nuotatore') || ${notificationText},
        ${`/post/${postId}`},
        ${postId},
        NOW()
      FROM social_follows f
      JOIN users u ON u.id = ${userId}
      WHERE f.following_id = ${userId}
        AND f.status = 'accepted'
        AND f.follower_id <> ${userId}
    `);
  }

  return postId;
}

export async function setActivityShare(userId: number, activityId: number, share: boolean) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  const activity = await db.execute(sql`
    SELECT id FROM swimming_activities
    WHERE id = ${activityId} AND user_id = ${userId}
    LIMIT 1
  `);
  if (!activity.rows.length) {
    throw new Error("Activity not found");
  }

  if (!share) {
    await db.execute(sql`UPDATE swimming_activities SET share_to_feed = false WHERE id = ${activityId}`);
    await db.execute(sql`
      UPDATE social_posts SET is_deleted = true, updated_at = NOW()
      WHERE activity_id = ${activityId} AND user_id = ${userId}
    `);
    return;
  }

  // Sharing again a post that was removed brings it back with its text and photos.
  const existing = await db.execute(sql`
    SELECT id, is_deleted FROM social_posts
    WHERE activity_id = ${activityId} AND user_id = ${userId}
    ORDER BY id DESC
    LIMIT 1
  `);
  const post = existing.rows[0] as { id: number; is_deleted: boolean } | undefined;
  if (post) {
    await db.execute(sql`UPDATE swimming_activities SET share_to_feed = true WHERE id = ${activityId}`);
    await db.execute(sql`
      UPDATE social_posts SET is_deleted = false, updated_at = NOW()
      WHERE id = ${post.id}
    `);
    return;
  }

  await upsertActivityPost(userId, activityId, {
    content: null,
    mediaUrl: null,
    mediaUrls: [],
    taggedUserIds: [],
    hashtags: [],
    visibility: "public",
  });
}

export async function toggleSplash(userId: number, postId: number) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

  const postMeta = await db.execute(sql`
    SELECT user_id, club_id FROM social_posts WHERE id = ${postId} LIMIT 1
  `);
  const ownerId = (postMeta.rows[0] as any)?.user_id as number | undefined;
  const clubId = (postMeta.rows[0] as any)?.club_id as number | null | undefined;
  if (ownerId && ownerId === userId) {
    throw new Error("Cannot splash your own post");
  }

  const removed = await db
    .delete(socialSplashes)
    .where(and(eq(socialSplashes.postId, postId), eq(socialSplashes.userId, userId)))
    .returning({ id: socialSplashes.id });

  if (removed.length) {
    return { splashed: false };
  }

  const inserted = await db
    .insert(socialSplashes)
    .values({ postId, userId, createdAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: socialSplashes.id });

  if (!inserted.length) {
    // Another concurrent request inserted the splash first.
    return { splashed: true };
  }

  // Notification for post owner (only on create)
  if (ownerId && ownerId !== userId) {
    try {
      const actor = await db.execute(sql`SELECT name FROM users WHERE id = ${userId} LIMIT 1`);
      const actorName = ((actor.rows[0] as any)?.name as string | undefined) || "Qualcuno";
      const { createNotification } = await import("./db_social_enhanced");
      const link = `/post/${postId}`;
      await createNotification({
        userId: ownerId,
        type: "splash",
        title: "Nuovo Splash",
        message: `${actorName} ha messo Splash al tuo post.`,
        link,
        referenceId: postId,
        actorId: userId,
      });
    } catch {
      // Notifications are best-effort; don't break splash interaction if it fails.
    }
  }

  return { splashed: true };
}

export async function addComment(userId: number, postId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error(DB_UNAVAILABLE_ERR_MSG);

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
      const link = `/post/${postId}`;
      await createNotification({
        userId: ownerId,
        type: "comment",
        title: "Nuovo commento",
        message: `${actorName}: ${preview}${content.trim().length > 120 ? "..." : ""}`,
        link,
        referenceId: postId,
        actorId: userId,
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
      sp.username AS user_username,
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
