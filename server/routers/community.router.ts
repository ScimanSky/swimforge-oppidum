import {
    protectedProcedure, router, z,
    TRPCError,
    invalidateUserCache, invalidateLeaderboardCache,
    getSocialFeed, upsertActivityPost, setActivityShare,
    toggleSplash, addComment, getComments, deleteOwnPost,
    hidePostForUser, unhidePostForUser, reportPost,
    getUserPublicProfile, toggleFollow, getSuggestedUsers, searchUsers,
    awardActionXp,
    detectImageType, logger,
} from "./_shared";
import type { ClubEventInsert, ClubAnnouncementInsert } from "./_shared";
import { ENV } from "../_core/env";
import { socialPosts } from "../../drizzle/schema";

const CLUB_STAFF_ROLES = new Set(["owner", "admin", "moderator"]);
const REACTION_TYPES = ["splash", "fire", "strong", "clap", "wave", "love", "rocket", "wow", "laugh", "cry"] as const;
const HASHTAG_REGEX = /(^|\s)#([A-Za-z0-9_]{2,40})/g;
const ROUTE_GEOJSON_SCHEMA = z.object({
    type: z.literal("LineString"),
    coordinates: z
        .array(
            z.tuple([
                z.number().min(-180).max(180),
                z.number().min(-90).max(90),
            ])
        )
        .min(2)
        .max(500),
});

function normalizeMediaUrls(mediaUrls?: string[] | null, mediaUrl?: string | null) {
    const values = [...(mediaUrls ?? []), mediaUrl ?? ""]
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 6);
    return Array.from(new Set(values));
}

function normalizeTaggedUserIds(authorUserId: number, taggedUserIds?: number[] | null) {
    if (!taggedUserIds?.length) return [];
    const unique = Array.from(new Set(taggedUserIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
    return unique.filter((id) => id !== authorUserId).slice(0, 10);
}

function extractHashtagsFromContent(content?: string | null) {
    if (!content) return [] as string[];
    const matches = content.matchAll(HASHTAG_REGEX);
    const tags = Array.from(matches)
        .map((entry) => (entry?.[2] ?? "").trim().toLowerCase())
        .filter((tag) => tag.length >= 2 && tag.length <= 40);
    return Array.from(new Set(tags));
}

function normalizeHashtags(content?: string | null, hashtags?: string[] | null) {
    const explicit = (hashtags ?? [])
        .map((raw) => raw.replace(/^#+/, "").trim().toLowerCase())
        .filter((tag) => tag.length >= 2 && tag.length <= 40);
    const all = [...extractHashtagsFromContent(content), ...explicit];
    return Array.from(new Set(all)).slice(0, 20);
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function routeDistanceMeters(routeGeoJson?: { coordinates: Array<[number, number]> } | null) {
    if (!routeGeoJson?.coordinates?.length || routeGeoJson.coordinates.length < 2) return null;
    let total = 0;
    for (let i = 1; i < routeGeoJson.coordinates.length; i += 1) {
        const [prevLng, prevLat] = routeGeoJson.coordinates[i - 1];
        const [currLng, currLat] = routeGeoJson.coordinates[i];
        total += haversineMeters(prevLat, prevLng, currLat, currLng);
    }
    return Math.round(total);
}

async function notifyTaggedUsers(input: {
    authorUserId: number;
    taggedUserIds: number[];
    postId: number;
    clubId?: number | null;
}) {
    if (!input.taggedUserIds.length) return;

    try {
        const { getDb } = await import("../db");
        const { sql } = await import("drizzle-orm");
        const { createNotification } = await import("../db_social_enhanced");
        const db = await getDb();
        if (!db) return;

        const actorResult = await db.execute(sql`SELECT name FROM users WHERE id = ${input.authorUserId} LIMIT 1`);
        const actorName = ((actorResult.rows[0] as any)?.name as string | undefined) || "Qualcuno";
        const link = input.clubId ? `/community/club/${input.clubId}` : `/post/${input.postId}`;

        await Promise.all(
            input.taggedUserIds.map((taggedUserId) =>
                createNotification({
                    userId: taggedUserId,
                    type: "mention",
                    title: "Sei stato taggato",
                    message: `${actorName} ti ha taggato in un post.`,
                    link,
                    referenceId: input.postId,
                })
            )
        );
    } catch {
        // Best-effort: tagging notification should not block post creation
    }
}

async function requireClubMemberRole(userId: number, clubId: number) {
    const { getClubMemberRole } = await import("../db_clubs");
    const role = await getClubMemberRole(userId, clubId);
    if (!role || role.status !== "active") {
        throw new TRPCError({ code: "FORBIDDEN" });
    }
    return role;
}

async function requireClubStaffRole(userId: number, clubId: number) {
    const role = await requireClubMemberRole(userId, clubId);
    if (!CLUB_STAFF_ROLES.has(role.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
    }
    return role;
}

async function requireClubReadable(userId: number, clubId: number) {
    const { getClubById } = await import("../db_clubs");
    const club = await getClubById(userId, clubId);
    if (!club) {
        throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (!club.is_member) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: "Devi iscriverti al club per visualizzare i contenuti.",
        });
    }
    return club;
}

async function requirePostReadable(userId: number, postId: number) {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }

    const postResult = await db.execute(sql`
        SELECT id, user_id, club_id, visibility, is_deleted
        FROM social_posts
        WHERE id = ${postId}
        LIMIT 1
    `);

    const row = postResult.rows[0] as {
        id: number;
        user_id: number;
        club_id: number | null;
        visibility: string | null;
        is_deleted: boolean;
    } | undefined;

    if (!row || row.is_deleted) {
        throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (row.club_id) {
        await requireClubReadable(userId, row.club_id);
    } else if (row.visibility === "private" && row.user_id !== userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
    }

    return {
        postId: row.id,
        ownerId: row.user_id,
        clubId: row.club_id,
    };
}

export const communityRouter = router({
    postById: protectedProcedure
        .input(z.object({ postId: z.number() }))
        .query(async ({ ctx, input }) => {
            await requirePostReadable(ctx.user.id, input.postId);

            const { getDb } = await import("../db");
            const { sql } = await import("drizzle-orm");
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

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
                    WHERE s.post_id = p.id AND s.user_id = ${ctx.user.id}
                  ) AS has_splashed,
                  EXISTS(
                    SELECT 1 FROM social_follows f
                    WHERE f.follower_id = ${ctx.user.id} AND f.following_id = p.user_id AND f.status = 'accepted'
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
                WHERE p.id = ${input.postId}
                  AND p.is_deleted = false
                  AND NOT EXISTS (
                    SELECT 1 FROM social_hidden_posts hp
                    WHERE hp.post_id = p.id AND hp.user_id = ${ctx.user.id}
                  )
                LIMIT 1
            `);

            const row = result.rows[0];
            if (!row) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Post non trovato" });
            }
            return row;
        }),

    feed: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(50).optional(),
            scope: z.enum(["global", "self", "following"]).optional(),
            before: z.string().datetime().optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
            const before = input?.before ? new Date(input.before) : undefined;
            return getSocialFeed(ctx.user.id, {
                limit: input?.limit,
                scope: input?.scope,
                before,
            });
        }),

    createPost: protectedProcedure
        .input(z.object({
            activityId: z.number(),
            content: z.string().max(2000).optional().nullable(),
            mediaUrl: z.string().url().optional().nullable(),
            mediaUrls: z.array(z.string().url()).max(6).optional(),
            taggedUserIds: z.array(z.number().int().positive()).max(10).optional(),
            hashtags: z.array(z.string().min(1).max(64)).max(20).optional(),
            visibility: z.enum(["public", "private"]).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const content = input.content?.trim() ?? null;
            const mediaUrls = normalizeMediaUrls(input.mediaUrls, input.mediaUrl ?? null);
            const taggedUserIds = normalizeTaggedUserIds(ctx.user.id, input.taggedUserIds);
            const hashtags = normalizeHashtags(content, input.hashtags);
            const postId = await upsertActivityPost(ctx.user.id, input.activityId, {
                content,
                mediaUrl: mediaUrls[0] ?? null,
                mediaUrls,
                taggedUserIds,
                hashtags,
                visibility: input.visibility ?? "public",
            });
            if (postId) {
                await notifyTaggedUsers({
                    authorUserId: ctx.user.id,
                    taggedUserIds,
                    postId,
                    clubId: null,
                });
            }
            return { success: true, postId };
        }),

    toggleShare: protectedProcedure
        .input(z.object({
            activityId: z.number(),
            share: z.boolean(),
        }))
        .mutation(async ({ ctx, input }) => {
            await setActivityShare(ctx.user.id, input.activityId, input.share);
            await invalidateUserCache(String(ctx.user.id));
            return { success: true };
        }),

    toggleSplash: protectedProcedure
        .input(z.object({
            postId: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {
            const splashResult = await toggleSplash(ctx.user.id, input.postId);
            let actionXp = null;
            if (splashResult?.splashed) {
                actionXp = await awardActionXp({
                    userId: ctx.user.id,
                    actionType: "splash",
                    entityId: input.postId,
                });
                if (actionXp.awardedXp > 0) {
                    await invalidateUserCache(String(ctx.user.id));
                    await invalidateLeaderboardCache();
                }
            }
            return { ...splashResult, actionXp };
        }),

    addComment: protectedProcedure
        .input(z.object({
            postId: z.number(),
            content: z.string().min(1).max(1000),
        }))
        .mutation(async ({ ctx, input }) => {
            const commentId = await addComment(ctx.user.id, input.postId, input.content);
            const actionXp = await awardActionXp({
                userId: ctx.user.id,
                actionType: "comment",
                entityId: input.postId,
            });
            if (actionXp.awardedXp > 0) {
                await invalidateUserCache(String(ctx.user.id));
                await invalidateLeaderboardCache();
            }
            return { success: true, commentId, actionXp };
        }),

    comments: protectedProcedure
        .input(z.object({
            postId: z.number(),
        }))
        .query(async ({ input }) => {
            return getComments(input.postId);
        }),

    hidePost: protectedProcedure
        .input(z.object({
            postId: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {
            return hidePostForUser(ctx.user.id, input.postId);
        }),

    unhidePost: protectedProcedure
        .input(z.object({
            postId: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {
            return unhidePostForUser(ctx.user.id, input.postId);
        }),

    deletePost: protectedProcedure
        .input(z.object({
            postId: z.number(),
        }))
        .mutation(async ({ ctx, input }) => {
            try {
                return await deleteOwnPost(ctx.user.id, input.postId);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Impossibile eliminare il post";
                if (message === "Post not found") {
                    throw new TRPCError({ code: "NOT_FOUND", message: "Post non trovato" });
                }
                if (message === "Cannot delete other users posts") {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Puoi eliminare solo i tuoi post" });
                }
                if (message.startsWith("Delete window expired")) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Tempo massimo per eliminare il post superato",
                    });
                }
                throw new TRPCError({ code: "BAD_REQUEST", message });
            }
        }),

    reportPost: protectedProcedure
        .input(z.object({
            postId: z.number(),
            reason: z.enum(["spam", "offensive", "harassment", "misinformation", "other"]),
            details: z.string().max(1000).optional().nullable(),
        }))
        .mutation(async ({ ctx, input }) => {
            const details = input.details?.trim() ?? "";
            if (input.reason === "other" && details.length < 10) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Per 'Altro' inserisci almeno 10 caratteri di dettaglio.",
                });
            }
            return reportPost(ctx.user.id, {
                postId: input.postId,
                reason: input.reason,
                details: details || null,
            });
        }),

    createTextPost: protectedProcedure
        .input(z.object({
            content: z.string().max(2000).optional().nullable(),
            mediaUrl: z.string().url().optional().nullable(),
            mediaUrls: z.array(z.string().url()).max(6).optional(),
            taggedUserIds: z.array(z.number().int().positive()).max(10).optional(),
            hashtags: z.array(z.string().min(1).max(64)).max(20).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { getDb } = await import("../db");
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

            const content = input.content?.trim() ?? null;
            const mediaUrls = normalizeMediaUrls(input.mediaUrls, input.mediaUrl ?? null);
            const taggedUserIds = normalizeTaggedUserIds(ctx.user.id, input.taggedUserIds);
            const hashtags = normalizeHashtags(content, input.hashtags);
            if (!content && mediaUrls.length === 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Inserisci un testo o almeno un media." });
            }

            const inserted = await db
                .insert(socialPosts)
                .values({
                    userId: ctx.user.id,
                    activityId: null,
                    clubId: null,
                    content,
                    mediaUrl: mediaUrls[0] ?? null,
                    mediaUrls,
                    taggedUserIds,
                    hashtags,
                    visibility: "public",
                    isDeleted: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning({ id: socialPosts.id });
            const postId = inserted[0]?.id ?? null;
            if (postId) {
                await notifyTaggedUsers({
                    authorUserId: ctx.user.id,
                    taggedUserIds,
                    postId,
                    clubId: null,
                });
            }
            return { success: true, postId };
        }),

    postImageKitAuth: protectedProcedure
        .mutation(async ({ ctx }) => {
            if (!ENV.imagekitPrivateKey || !ENV.imagekitPublicKey || !ENV.imagekitUrlEndpoint) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "ImageKit non configurato sul server.",
                });
            }

            const { createHmac, randomBytes } = await import("crypto");
            const token = randomBytes(16).toString("hex");
            const expire = Math.floor(Date.now() / 1000) + 60 * 10;
            const signature = createHmac("sha1", ENV.imagekitPrivateKey)
                .update(token + String(expire))
                .digest("hex");

            return {
                token,
                expire,
                signature,
                publicKey: ENV.imagekitPublicKey,
                urlEndpoint: ENV.imagekitUrlEndpoint,
                folder: `/posts/${ctx.user.id}`,
            } as const;
        }),

    unsharedActivities: protectedProcedure
        .query(async ({ ctx }) => {
            const { getDb } = await import("../db");
            const { sql } = await import("drizzle-orm");
            const db = await getDb();
            if (!db) return [];

            const result = await db.execute(sql`
                SELECT id, activity_name, distance_meters, duration_seconds, activity_date, activity_source
                FROM swimming_activities
                WHERE user_id = ${ctx.user.id}
                  AND share_to_feed = false
                  AND activity_date > NOW() - INTERVAL '30 days'
                ORDER BY activity_date DESC
                LIMIT 20
            `);
            return result.rows;
        }),

    stories: router({
        active: protectedProcedure
            .query(async ({ ctx }) => {
                const { getActiveStories } = await import("../db_stories");
                return getActiveStories(ctx.user.id);
            }),

        imageKitAuth: protectedProcedure
            .mutation(async ({ ctx }) => {
                if (!ENV.imagekitPrivateKey || !ENV.imagekitPublicKey || !ENV.imagekitUrlEndpoint) {
                    throw new TRPCError({
                        code: "PRECONDITION_FAILED",
                        message: "ImageKit non configurato sul server.",
                    });
                }

                const { createHmac, randomBytes } = await import("crypto");
                const token = randomBytes(16).toString("hex");
                const expire = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes
                const signature = createHmac("sha1", ENV.imagekitPrivateKey)
                    .update(token + String(expire))
                    .digest("hex");

                return {
                    token,
                    expire,
                    signature,
                    publicKey: ENV.imagekitPublicKey,
                    urlEndpoint: ENV.imagekitUrlEndpoint,
                    folder: `/stories/${ctx.user.id}`,
                } as const;
            }),

        create: protectedProcedure
            .input(z.object({
                mediaUrl: z.string().url().optional(),
                imageKitFileId: z.string().min(6).max(200).optional(),
                caption: z.string().max(500).optional(),
                type: z.enum(["image", "video", "text"]),
            }))
            .mutation(async ({ ctx, input }) => {
                const { createStory } = await import("../db_stories");
                const story = await createStory(ctx.user.id, {
                    mediaUrl: input.mediaUrl ?? null,
                    imageKitFileId: input.imageKitFileId ?? null,
                    caption: input.caption ?? null,
                    type: input.type,
                });
                return { success: true, story };
            }),

        uploadFile: protectedProcedure
            .input(z.object({
                caption: z.string().max(500).optional(),
                type: z.enum(["image", "video", "text"]),
                fileBase64: z
                    .string()
                    .min(1)
                    .max(7 * 1024 * 1024, "File troppo grande (max 5MB)")
                    .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64"),
                mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
            }))
            .mutation(async ({ ctx, input }) => {
                const { getSupabaseAdminClient } = await import("../_core/supabase_admin");
                const admin = getSupabaseAdminClient();

                const MAX_BYTES = 5 * 1024 * 1024;
                let buffer: Buffer;
                try {
                    buffer = Buffer.from(input.fileBase64, "base64");
                } catch {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid base64 payload" });
                }
                if (buffer.length > MAX_BYTES) {
                    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "File troppo grande (max 5MB)" });
                }

                const detected = detectImageType(buffer);
                if (!detected) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Formato immagine non supportato. Usa JPG, PNG o WEBP." });
                }
                if (detected.mimeType !== input.mimeType) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Il MIME type non corrisponde al contenuto del file." });
                }

                try {
                    type SharpPipeline = {
                        rotate: () => SharpPipeline;
                        resize: (options: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }) => SharpPipeline;
                        jpeg: (options: { quality: number }) => SharpPipeline;
                        png: (options: { compressionLevel: number }) => SharpPipeline;
                        webp: (options: { quality: number }) => SharpPipeline;
                        toBuffer: () => Promise<Buffer>;
                    };
                    type SharpFn = (input: Buffer) => SharpPipeline;

                    const sharpMod = (await import("sharp")) as unknown as { default?: unknown };
                    const sharpFn = ((sharpMod.default ?? sharpMod) as unknown) as SharpFn;
                    const pipeline = sharpFn(buffer)
                        .rotate()
                        .resize({ width: 1080, height: 1920, fit: "inside", withoutEnlargement: true });

                    if (detected.extension === "jpg") {
                        buffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
                    } else if (detected.extension === "png") {
                        buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
                    } else {
                        buffer = await pipeline.webp({ quality: 85 }).toBuffer();
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    logger.warn(`story uploadFile: image resize failed: ${message}`, {
                        event: "story:upload_resize_failed",
                        userId: ctx.user.id,
                        message,
                    });
                }

                const filePath = `stories/${ctx.user.id}/${Date.now()}.${detected.extension}`;
                const { error } = await admin.storage
                    .from("profile-media")
                    .upload(filePath, buffer, {
                        contentType: detected.mimeType,
                        upsert: true,
                    });
                if (error) {
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Upload failed: ${error.message}` });
                }

                const { data } = admin.storage.from("profile-media").getPublicUrl(filePath);
                const publicUrl = data.publicUrl;

                const { createStory } = await import("../db_stories");
                const story = await createStory(ctx.user.id, {
                    mediaUrl: publicUrl,
                    caption: input.caption ?? null,
                    type: input.type,
                });

                return { success: true, story, url: publicUrl };
            }),

        markViewed: protectedProcedure
            .input(z.object({ storyId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { markStoryViewed } = await import("../db_stories");
                return markStoryViewed(input.storyId, ctx.user.id);
            }),

        react: protectedProcedure
            .input(z.object({
                storyId: z.number(),
                reactionType: z.enum(REACTION_TYPES),
            }))
            .mutation(async ({ ctx, input }) => {
                try {
                    const { toggleStoryReaction, getStoryReactionSummary } = await import("../db_stories");
                    const toggled = await toggleStoryReaction({
                        storyId: input.storyId,
                        userId: ctx.user.id,
                        reactionType: input.reactionType,
                    });
                    const summary = await getStoryReactionSummary(input.storyId, ctx.user.id);

                    if (toggled.reaction && toggled.storyOwnerId !== ctx.user.id) {
                        try {
                            const { getDb } = await import("../db");
                            const { sql } = await import("drizzle-orm");
                            const db = await getDb();
                            if (!db) throw new Error("db not available");
                            const actorResult = await db.execute(sql`SELECT name FROM users WHERE id = ${ctx.user.id} LIMIT 1`);
                            const actorName = ((actorResult.rows[0] as any)?.name as string | undefined) || "Qualcuno";
                            const emojiMap: Record<string, string> = {
                                splash: "💧",
                                fire: "🔥",
                                strong: "💪",
                                clap: "👏",
                                wave: "🌊",
                                love: "❤️",
                                rocket: "🚀",
                                wow: "🤯",
                                laugh: "😂",
                                cry: "😢",
                            };
                            const emoji = emojiMap[input.reactionType] || "✨";
                            const { createNotification } = await import("../db_social_enhanced");
                            await createNotification({
                                userId: toggled.storyOwnerId,
                                type: "story_reaction",
                                title: "Nuova reazione alla story",
                                message: `${actorName} ha reagito ${emoji} alla tua story.`,
                                link: "/home",
                                referenceId: input.storyId,
                            });
                        } catch {
                            // Notifications are best-effort
                        }
                    }

                    return { success: true, reaction: toggled.reaction, removed: toggled.removed, summary };
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    if (message.includes("Story not found")) {
                        throw new TRPCError({ code: "NOT_FOUND", message: "Story non trovata." });
                    }
                    if (message.includes("Story expired")) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "Questa story è scaduta." });
                    }
                    throw error;
                }
            }),

        delete: protectedProcedure
            .input(z.object({ storyId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { deleteStory } = await import("../db_stories");
                const deleted = await deleteStory(input.storyId, ctx.user.id);

                if (deleted.imageKitFileId) {
                    try {
                        const { deleteImageKitFileById } = await import("../lib/imagekit");
                        await deleteImageKitFileById(deleted.imageKitFileId);
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        logger.warn(`story delete: ImageKit cleanup failed: ${message}`, {
                            event: "story:delete_imagekit_cleanup_failed",
                            userId: ctx.user.id,
                            storyId: input.storyId,
                            message,
                        });
                    }
                }

                return deleted;
            }),

        viewers: protectedProcedure
            .input(z.object({ storyId: z.number() }))
            .query(async ({ input }) => {
                const { getStoryViewers } = await import("../db_stories");
                return getStoryViewers(input.storyId);
            }),
    }),

    users: router({
        getPublicProfile: protectedProcedure
            .input(z.object({ userId: z.number() }))
            .query(async ({ ctx, input }) => {
                const profile = await getUserPublicProfile({
                    viewerUserId: ctx.user.id,
                    targetUserId: input.userId,
                });
                if (!profile) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
                }

                // Enforce profile visibility unless the viewer is the same user.
                if (!profile.profilePublic && ctx.user.id !== input.userId) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Questo profilo non è pubblico" });
                }

                return profile;
            }),

        toggleFollow: protectedProcedure
            .input(z.object({ userId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                if (input.userId === ctx.user.id) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Non puoi seguire te stesso" });
                }
                return toggleFollow({ followerId: ctx.user.id, followingId: input.userId });
            }),

        suggested: protectedProcedure
            .input(z.object({ limit: z.number().min(1).max(10).optional() }).optional())
            .query(async ({ ctx, input }) => {
                return getSuggestedUsers(ctx.user.id, input?.limit ?? 5);
            }),

        search: protectedProcedure
            .input(z.object({ query: z.string().min(1).max(100), limit: z.number().min(1).max(20).optional() }))
            .query(async ({ ctx, input }) => {
                return searchUsers(ctx.user.id, input.query, input.limit ?? 10);
            }),
    }),

    ghostChallenges: router({
        list: protectedProcedure
            .input(z.object({ clubId: z.number().optional() }).optional())
            .query(async ({ ctx, input }) => {
                const { listGhostChallenges } = await import("../db_ghost_challenges");
                return listGhostChallenges(ctx.user.id, input?.clubId);
            }),
        createFromPost: protectedProcedure
            .input(z.object({ postId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { createGhostChallengeFromPost } = await import("../db_ghost_challenges");
                try {
                    const result = await createGhostChallengeFromPost(ctx.user.id, input.postId);
                    if (!result) {
                        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Creazione sfida fallita" });
                    }
                    return { success: true, id: result.id };
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : undefined;
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: message || "Impossibile creare la Ghost Track",
                    });
                }
            }),
    }),

    ghostTrack: router({
        friends: protectedProcedure
            .input(z.object({ search: z.string().optional() }).optional())
            .query(async ({ ctx, input }) => {
                const { listGhostTrackFriends } = await import("../db_ghost_challenges");
                return listGhostTrackFriends(ctx.user.id, input?.search);
            }),
        sessions: protectedProcedure
            .input(z.object({ friendUserId: z.number() }))
            .query(async ({ ctx, input }) => {
                const { listGhostTrackSessions } = await import("../db_ghost_challenges");
                return listGhostTrackSessions(ctx.user.id, input.friendUserId);
            }),
        preview: protectedProcedure
            .input(z.object({ postId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { getGhostChallengeContextFromPost } = await import("../db_ghost_challenges");
                return getGhostChallengeContextFromPost(ctx.user.id, input.postId);
            }),
        laps: protectedProcedure
            .input(z.object({ activityIds: z.array(z.number()).min(1).max(2) }))
            .query(async ({ input }) => {
                const { getGhostTrackLaps } = await import("../db_ghost_challenges");
                return getGhostTrackLaps(input.activityIds);
            }),
        leaderboard: protectedProcedure
            .input(z.object({ limit: z.number().min(1).max(20).optional() }).optional())
            .query(async ({ input }) => {
                const { listGhostTrackLeaderboard } = await import("../db_ghost_challenges");
                return listGhostTrackLeaderboard(input?.limit ?? 5);
            }),
    }),

    clubs: router({
        list: protectedProcedure
            .input(z.object({
                search: z.string().max(120).optional(),
                scope: z.enum(["all", "mine"]).optional(),
                limit: z.number().min(1).max(100).optional(),
            }).optional())
            .query(async ({ ctx, input }) => {
                const { listClubs } = await import("../db_clubs");
                return listClubs(ctx.user.id, {
                    search: input?.search,
                    scope: input?.scope,
                    limit: input?.limit,
                });
            }),

        create: protectedProcedure
            .input(z.object({
                name: z.string().min(3).max(120),
                description: z.string().max(500).optional().nullable(),
                coverImageUrl: z.string().max(5000).optional().nullable(),
                rules: z.string().max(2000).optional().nullable(),
                visibility: z.enum(["public", "private", "invite"]).optional(),
                isPrivate: z.boolean().optional(),
            }))
            .mutation(async ({ ctx, input }) => {
                const { createClub } = await import("../db_clubs");
                if (input.coverImageUrl) {
                    const isHttpUrl = /^https?:\/\//i.test(input.coverImageUrl);
                    const isDataImage = input.coverImageUrl.startsWith("data:image/");
                    if (!isHttpUrl && !isDataImage) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cover image URL" });
                    }
                }
                const clubId = await createClub(ctx.user.id, input);
                return { success: true, clubId };
            }),

        join: protectedProcedure
            .input(z.object({ clubId: z.number(), acceptRules: z.boolean().optional() }))
            .mutation(async ({ ctx, input }) => {
                const { joinClub } = await import("../db_clubs");
                try {
                    return await joinClub(ctx.user.id, input.clubId, { acceptRules: input.acceptRules });
                } catch (error) {
                    const message = error instanceof Error ? error.message : "Impossibile iscriversi al club";
                    if (message === "Rules not accepted") {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Devi accettare esplicitamente il regolamento del club.",
                        });
                    }
                    throw new TRPCError({ code: "BAD_REQUEST", message });
                }
            }),

        leave: protectedProcedure
            .input(z.object({ clubId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { leaveClub } = await import("../db_clubs");
                return leaveClub(ctx.user.id, input.clubId);
            }),

        get: protectedProcedure
            .input(z.object({ clubId: z.number() }))
            .query(async ({ ctx, input }) => {
                const { getClubById } = await import("../db_clubs");
                const club = await getClubById(ctx.user.id, input.clubId);
                if (!club) {
                    throw new TRPCError({ code: "NOT_FOUND" });
                }
                if (club.is_private && !club.is_member) {
                    throw new TRPCError({ code: "FORBIDDEN" });
                }
                return club;
            }),

        weeklyStats: protectedProcedure
            .input(z.object({ clubId: z.number() }))
            .query(async ({ input }) => {
                const { getClubWeeklyStats } = await import("../db_clubs");
                return getClubWeeklyStats(input.clubId);
            }),

        members: protectedProcedure
            .input(z.object({ clubId: z.number() }))
            .query(async ({ ctx, input }) => {
                const { getClubById, listClubMembers } = await import("../db_clubs");
                const club = await getClubById(ctx.user.id, input.clubId);
                if (!club) {
                    throw new TRPCError({ code: "NOT_FOUND" });
                }
                if (!club.is_member) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Devi iscriverti al club per vedere i membri.",
                    });
                }
                return listClubMembers(input.clubId);
            }),

        requests: protectedProcedure
            .input(z.object({ clubId: z.number() }))
            .query(async ({ ctx, input }) => {
                const { getClubById, listClubMembersByStatus, getClubMemberRole } = await import("../db_clubs");
                const club = await getClubById(ctx.user.id, input.clubId);
                if (!club) throw new TRPCError({ code: "NOT_FOUND" });
                const role = await getClubMemberRole(ctx.user.id, input.clubId);
                if (!role || role.status !== "active" || !["owner", "admin", "moderator"].includes(role.role)) {
                    throw new TRPCError({ code: "FORBIDDEN" });
                }
                return listClubMembersByStatus(input.clubId, "pending");
            }),

        banned: protectedProcedure
            .input(z.object({ clubId: z.number() }))
            .query(async ({ ctx, input }) => {
                const { getClubById, listClubMembersByStatus, getClubMemberRole } = await import("../db_clubs");
                const club = await getClubById(ctx.user.id, input.clubId);
                if (!club) throw new TRPCError({ code: "NOT_FOUND" });
                const role = await getClubMemberRole(ctx.user.id, input.clubId);
                if (!role || role.status !== "active" || !["owner", "admin", "moderator"].includes(role.role)) {
                    throw new TRPCError({ code: "FORBIDDEN" });
                }
                return listClubMembersByStatus(input.clubId, "banned");
            }),

        invites: protectedProcedure
            .input(z.object({ clubId: z.number() }))
            .query(async ({ ctx, input }) => {
                const { listClubInvites } = await import("../db_clubs");
                return listClubInvites(ctx.user.id, input.clubId);
            }),

        createInvite: protectedProcedure
            .input(z.object({
                clubId: z.number(),
                role: z.enum(["member", "moderator"]).optional(),
                maxUses: z.number().min(1).max(100).optional(),
                expiresAt: z.date().optional().nullable(),
            }))
            .mutation(async ({ ctx, input }) => {
                const { createClubInvite } = await import("../db_clubs");
                const invite = await createClubInvite(ctx.user.id, input.clubId, {
                    role: input.role,
                    maxUses: input.maxUses,
                    expiresAt: input.expiresAt ?? null,
                });
                return { success: true, invite };
            }),

        revokeInvite: protectedProcedure
            .input(z.object({ clubId: z.number(), inviteId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { revokeClubInvite } = await import("../db_clubs");
                return revokeClubInvite(ctx.user.id, input.clubId, input.inviteId);
            }),

        acceptInvite: protectedProcedure
            .input(z.object({ code: z.string().min(6).max(32) }))
            .mutation(async ({ ctx, input }) => {
                const { acceptClubInvite } = await import("../db_clubs");
                return acceptClubInvite(ctx.user.id, input.code);
            }),

        feed: protectedProcedure
            .input(z.object({
                clubId: z.number(),
                limit: z.number().min(1).max(50).optional(),
            }))
            .query(async ({ ctx, input }) => {
                const { getClubById, getClubFeed } = await import("../db_clubs");
                const club = await getClubById(ctx.user.id, input.clubId);
                if (!club) {
                    throw new TRPCError({ code: "NOT_FOUND" });
                }
                if (!club.is_member) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Devi iscriverti al club per visualizzare il feed.",
                    });
                }
                return getClubFeed(ctx.user.id, input.clubId, input.limit ?? 20);
            }),

        createPost: protectedProcedure
            .input(z.object({
                clubId: z.number(),
                content: z.string().max(1000).optional().nullable(),
                mediaUrl: z.string().url().optional().nullable(),
                mediaUrls: z.array(z.string().url()).max(6).optional(),
                taggedUserIds: z.array(z.number().int().positive()).max(10).optional(),
                hashtags: z.array(z.string().min(1).max(64)).max(20).optional(),
            }))
            .mutation(async ({ ctx, input }) => {
                const { getClubById, createClubPost } = await import("../db_clubs");
                const club = await getClubById(ctx.user.id, input.clubId);
                if (!club) {
                    throw new TRPCError({ code: "NOT_FOUND" });
                }
                if (!club.is_member) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Devi iscriverti al club per pubblicare.",
                    });
                }
                const content = input.content?.trim() ?? null;
                const mediaUrls = normalizeMediaUrls(input.mediaUrls, input.mediaUrl ?? null);
                const taggedUserIds = normalizeTaggedUserIds(ctx.user.id, input.taggedUserIds);
                const hashtags = normalizeHashtags(content, input.hashtags);
                if (!content && mediaUrls.length === 0) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Inserisci un testo o almeno un media." });
                }
                const postId = await createClubPost(ctx.user.id, input.clubId, {
                    content,
                    mediaUrl: mediaUrls[0] ?? null,
                    mediaUrls,
                    taggedUserIds,
                    hashtags,
                });
                if (postId) {
                    await notifyTaggedUsers({
                        authorUserId: ctx.user.id,
                        taggedUserIds,
                        postId,
                        clubId: input.clubId,
                    });
                }
                const actionXp = await awardActionXp({
                    userId: ctx.user.id,
                    actionType: "club_post",
                    entityId: Number(postId ?? input.clubId),
                });
                if (actionXp.awardedXp > 0) {
                    await invalidateUserCache(String(ctx.user.id));
                    await invalidateLeaderboardCache();
                }
                return { success: true, postId, actionXp };
            }),

        update: protectedProcedure
            .input(z.object({
                clubId: z.number(),
                name: z.string().min(3).max(120).optional(),
                description: z.string().max(500).optional().nullable(),
                coverImageUrl: z.string().max(5000).optional().nullable(),
                rules: z.string().max(2000).optional().nullable(),
                visibility: z.enum(["public", "private", "invite"]).optional(),
                themeColor: z.enum(["cyan", "lime", "coral", "violet"]).optional(),
                logoUrl: z.string().max(5000).optional().nullable(),
                tagline: z.string().max(200).optional().nullable(),
            }))
            .mutation(async ({ ctx, input }) => {
                const { updateClub } = await import("../db_clubs");
                if (input.coverImageUrl) {
                    const isHttpUrl = /^https?:\/\//i.test(input.coverImageUrl);
                    const isDataImage = input.coverImageUrl.startsWith("data:image/");
                    if (!isHttpUrl && !isDataImage) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cover image URL" });
                    }
                }
                return updateClub(ctx.user.id, input.clubId, {
                    name: input.name,
                    description: input.description ?? undefined,
                    coverImageUrl: input.coverImageUrl ?? undefined,
                    rules: input.rules ?? undefined,
                    visibility: input.visibility,
                    themeColor: input.themeColor,
                    logoUrl: input.logoUrl,
                    tagline: input.tagline,
                });
            }),

        delete: protectedProcedure
            .input(z.object({ clubId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { deleteClub } = await import("../db_clubs");
                return deleteClub(ctx.user.id, input.clubId);
            }),

        approveRequest: protectedProcedure
            .input(z.object({ clubId: z.number(), userId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { approveJoinRequest } = await import("../db_clubs");
                return approveJoinRequest(ctx.user.id, input.clubId, input.userId);
            }),

        rejectRequest: protectedProcedure
            .input(z.object({ clubId: z.number(), userId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { rejectJoinRequest } = await import("../db_clubs");
                return rejectJoinRequest(ctx.user.id, input.clubId, input.userId);
            }),

        banMember: protectedProcedure
            .input(z.object({ clubId: z.number(), userId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { banMember } = await import("../db_clubs");
                return banMember(ctx.user.id, input.clubId, input.userId);
            }),

        unbanMember: protectedProcedure
            .input(z.object({ clubId: z.number(), userId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { unbanMember } = await import("../db_clubs");
                return unbanMember(ctx.user.id, input.clubId, input.userId);
            }),

        updateMemberRole: protectedProcedure
            .input(z.object({ clubId: z.number(), userId: z.number(), role: z.enum(["member", "moderator", "admin"]) }))
            .mutation(async ({ ctx, input }) => {
                const { updateMemberRole } = await import("../db_clubs");
                return updateMemberRole(ctx.user.id, input.clubId, input.userId, input.role);
            }),

        // CLUB EVENTS
        events: router({
            list: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    status: z.enum(["active", "cancelled", "completed"]).optional(),
                    fromDate: z.string().datetime().optional(),
                    toDate: z.string().datetime().optional(),
                    limit: z.number().min(1).max(100).optional(),
                }))
                .query(async ({ ctx, input }) => {
                    await requireClubReadable(ctx.user.id, input.clubId);
                    const { getClubEvents } = await import("../db_social_enhanced");
                    return getClubEvents({
                        clubId: input.clubId,
                        status: input.status,
                        fromDate: input.fromDate ? new Date(input.fromDate) : undefined,
                        toDate: input.toDate ? new Date(input.toDate) : undefined,
                        limit: input.limit,
                        viewerUserId: ctx.user.id,
                    });
                }),

            create: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    title: z.string().min(1).max(200),
                    description: z.string().max(5000).optional(),
                    eventType: z.enum(["training", "race", "social", "meeting"]),
                    location: z.string().max(500).optional(),
                    locationLat: z.number().min(-90).max(90).optional(),
                    locationLng: z.number().min(-180).max(180).optional(),
                    routeGeojson: ROUTE_GEOJSON_SCHEMA.optional(),
                    startTime: z.string().datetime(),
                    endTime: z.string().datetime().optional(),
                    maxAttendees: z.number().min(1).optional(),
                    isRecurring: z.boolean().optional(),
                    recurringRule: z.string().optional(),
                    coverImageUrl: z.string().url().optional(),
                }))
                .mutation(async ({ ctx, input }) => {
                    await requireClubStaffRole(ctx.user.id, input.clubId);
                    const { createClubEvent } = await import("../db_social_enhanced");
                    const startTime = new Date(input.startTime);
                    const endTime = input.endTime ? new Date(input.endTime) : undefined;
                    const distanceMeters = routeDistanceMeters(input.routeGeojson);

                    let weatherSnapshot: unknown = undefined;
                    let weatherFetchedAt: Date | undefined = undefined;
                    if (input.locationLat !== undefined && input.locationLng !== undefined) {
                        try {
                            const { fetchEventWeatherSnapshot } = await import("../lib/open_meteo");
                            weatherSnapshot = await fetchEventWeatherSnapshot({
                                lat: input.locationLat,
                                lng: input.locationLng,
                                targetTime: startTime,
                            });
                            weatherFetchedAt = new Date();
                        } catch (error) {
                            logger.warn("[Club Event] Weather snapshot fetch failed on create", {
                                event: "club_event:weather_snapshot_create_failed",
                                clubId: input.clubId,
                                message: error instanceof Error ? error.message : String(error),
                            });
                        }
                    }

                    const event = await createClubEvent({
                        ...input,
                        creatorId: ctx.user.id,
                        startTime,
                        endTime,
                        routeGeojson: input.routeGeojson,
                        routeDistanceMeters: distanceMeters ?? undefined,
                        weatherSnapshot,
                        weatherFetchedAt,
                    });
                    return { success: true, event };
                }),

            get: protectedProcedure
                .input(z.object({ eventId: z.number() }))
                .query(async ({ ctx, input }) => {
                    const { getEventById } = await import("../db_social_enhanced");
                    const event = await getEventById(input.eventId);
                    if (!event?.event?.clubId) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    await requireClubReadable(ctx.user.id, event.event.clubId);
                    return event;
                }),

            update: protectedProcedure
                .input(z.object({
                    eventId: z.number(),
                    title: z.string().min(1).max(200).optional(),
                    description: z.string().max(5000).optional(),
                    eventType: z.enum(["training", "race", "social", "meeting"]).optional(),
                    location: z.string().max(500).optional(),
                    locationLat: z.number().min(-90).max(90).optional(),
                    locationLng: z.number().min(-180).max(180).optional(),
                    routeGeojson: ROUTE_GEOJSON_SCHEMA.nullable().optional(),
                    startTime: z.string().datetime().optional(),
                    endTime: z.string().datetime().optional(),
                    status: z.enum(["active", "cancelled", "completed"]).optional(),
                }))
                .mutation(async ({ ctx, input }) => {
                    const { getClubEventById, updateClubEvent } = await import("../db_social_enhanced");
                    const { eventId, startTime, endTime, ...rest } = input;
                    const existingEvent = await getClubEventById(eventId);
                    if (!existingEvent) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    await requireClubStaffRole(ctx.user.id, existingEvent.clubId);
                    const updates: Partial<ClubEventInsert> = {
                        ...rest,
                        ...(startTime ? { startTime: new Date(startTime) } : {}),
                        ...(endTime ? { endTime: new Date(endTime) } : {}),
                    };
                    if (input.routeGeojson !== undefined) {
                        updates.routeGeojson = input.routeGeojson;
                        updates.routeDistanceMeters = input.routeGeojson ? routeDistanceMeters(input.routeGeojson) : null;
                    }

                    const nextLat = input.locationLat ?? existingEvent.locationLat ?? undefined;
                    const nextLng = input.locationLng ?? existingEvent.locationLng ?? undefined;
                    const nextStart = startTime ? new Date(startTime) : existingEvent.startTime;
                    if (nextLat !== undefined && nextLng !== undefined && Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
                        try {
                            const { fetchEventWeatherSnapshot } = await import("../lib/open_meteo");
                            updates.weatherSnapshot = await fetchEventWeatherSnapshot({
                                lat: Number(nextLat),
                                lng: Number(nextLng),
                                targetTime: nextStart instanceof Date ? nextStart : new Date(nextStart),
                            });
                            updates.weatherFetchedAt = new Date();
                        } catch (error) {
                            logger.warn("[Club Event] Weather snapshot fetch failed on update", {
                                event: "club_event:weather_snapshot_update_failed",
                                eventId,
                                message: error instanceof Error ? error.message : String(error),
                            });
                        }
                    }
                    const event = await updateClubEvent(eventId, updates);
                    return { success: true, event };
                }),

            refreshWeather: protectedProcedure
                .input(z.object({ eventId: z.number() }))
                .mutation(async ({ ctx, input }) => {
                    const { getClubEventById, updateClubEvent } = await import("../db_social_enhanced");
                    const existingEvent = await getClubEventById(input.eventId);
                    if (!existingEvent) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    await requireClubReadable(ctx.user.id, existingEvent.clubId);
                    if (!Number.isFinite(existingEvent.locationLat) || !Number.isFinite(existingEvent.locationLng)) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "Evento senza coordinate mappa" });
                    }

                    const { fetchEventWeatherSnapshot } = await import("../lib/open_meteo");
                    const weatherSnapshot = await fetchEventWeatherSnapshot({
                        lat: Number(existingEvent.locationLat),
                        lng: Number(existingEvent.locationLng),
                        targetTime: existingEvent.startTime ? new Date(existingEvent.startTime) : undefined,
                    });
                    const weatherFetchedAt = new Date();
                    await updateClubEvent(input.eventId, { weatherSnapshot, weatherFetchedAt });
                    return { success: true, weatherSnapshot, weatherFetchedAt };
                }),

            delete: protectedProcedure
                .input(z.object({ eventId: z.number() }))
                .mutation(async ({ ctx, input }) => {
                    const { getClubEventById, deleteClubEvent } = await import("../db_social_enhanced");
                    const existingEvent = await getClubEventById(input.eventId);
                    if (!existingEvent) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    await requireClubStaffRole(ctx.user.id, existingEvent.clubId);
                    await deleteClubEvent(input.eventId);
                    return { success: true };
                }),

            rsvp: protectedProcedure
                .input(z.object({
                    eventId: z.number(),
                    status: z.enum(["going", "maybe", "not_going"]),
                }))
                .mutation(async ({ ctx, input }) => {
                    const { getClubEventById, rsvpToEvent } = await import("../db_social_enhanced");
                    const event = await getClubEventById(input.eventId);
                    if (!event) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    await requireClubMemberRole(ctx.user.id, event.clubId);
                    const attendee = await rsvpToEvent({
                        eventId: input.eventId,
                        userId: ctx.user.id,
                        status: input.status,
                    });
                    let actionXp = null;
                    if (input.status === "going" || input.status === "maybe") {
                        actionXp = await awardActionXp({
                            userId: ctx.user.id,
                            actionType: "rsvp",
                            entityId: input.eventId,
                        });
                        if (actionXp.awardedXp > 0) {
                            await invalidateUserCache(String(ctx.user.id));
                            await invalidateLeaderboardCache();
                        }
                    }
                    return { success: true, attendee, actionXp };
                }),

            attendees: protectedProcedure
                .input(z.object({ eventId: z.number() }))
                .query(async ({ ctx, input }) => {
                    const { getClubEventById, getEventAttendees } = await import("../db_social_enhanced");
                    const event = await getClubEventById(input.eventId);
                    if (!event) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    await requireClubReadable(ctx.user.id, event.clubId);
                    return getEventAttendees(input.eventId);
                }),
        }),

        // CLUB ANNOUNCEMENTS
        announcements: router({
            list: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    includeExpired: z.boolean().optional(),
                }))
                .query(async ({ ctx, input }) => {
                    await requireClubReadable(ctx.user.id, input.clubId);
                    const { getClubAnnouncements } = await import("../db_social_enhanced");
                    return getClubAnnouncements(input.clubId, input.includeExpired);
                }),

            create: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    title: z.string().min(1).max(200),
                    content: z.string().min(1).max(10000),
                    isPinned: z.boolean().optional(),
                    expiresAt: z.string().datetime().optional(),
                }))
                .mutation(async ({ ctx, input }) => {
                    await requireClubStaffRole(ctx.user.id, input.clubId);
                    const { createClubAnnouncement } = await import("../db_social_enhanced");
                    const announcement = await createClubAnnouncement({
                        ...input,
                        authorId: ctx.user.id,
                        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
                    });
                    return { success: true, announcement };
                }),

            update: protectedProcedure
                .input(z.object({
                    announcementId: z.number(),
                    title: z.string().min(1).max(200).optional(),
                    content: z.string().min(1).max(10000).optional(),
                    isPinned: z.boolean().optional(),
                    expiresAt: z.string().datetime().optional(),
                }))
                .mutation(async ({ ctx, input }) => {
                    const { getClubAnnouncementById, updateClubAnnouncement } = await import("../db_social_enhanced");
                    const { announcementId, expiresAt, ...rest } = input;
                    const announcement = await getClubAnnouncementById(announcementId);
                    if (!announcement) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    await requireClubStaffRole(ctx.user.id, announcement.clubId);
                    const updates: Partial<ClubAnnouncementInsert> = {
                        ...rest,
                        ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
                    };
                    const updated = await updateClubAnnouncement(announcementId, updates);
                    return { success: true, announcement: updated };
                }),

            delete: protectedProcedure
                .input(z.object({ announcementId: z.number() }))
                .mutation(async ({ ctx, input }) => {
                    const { getClubAnnouncementById, deleteClubAnnouncement } = await import("../db_social_enhanced");
                    const announcement = await getClubAnnouncementById(input.announcementId);
                    if (!announcement) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    await requireClubStaffRole(ctx.user.id, announcement.clubId);
                    await deleteClubAnnouncement(input.announcementId);
                    return { success: true };
                }),
        }),

        // CLUB MEDIA GALLERY
        media: router({
            list: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    mediaType: z.enum(["image", "video"]).optional(),
                    eventId: z.number().optional(),
                    limit: z.number().min(1).max(100).optional(),
                    offset: z.number().min(0).optional(),
                }))
                .query(async ({ ctx, input }) => {
                    await requireClubReadable(ctx.user.id, input.clubId);
                    const { getClubMediaGallery } = await import("../db_social_enhanced");
                    return getClubMediaGallery(input);
                }),

            imageKitAuth: protectedProcedure
                .input(z.object({ clubId: z.number() }))
                .mutation(async ({ ctx, input }) => {
                    await requireClubStaffRole(ctx.user.id, input.clubId);
                    if (!ENV.imagekitPrivateKey || !ENV.imagekitPublicKey || !ENV.imagekitUrlEndpoint) {
                        throw new TRPCError({
                            code: "PRECONDITION_FAILED",
                            message: "ImageKit non configurato sul server.",
                        });
                    }

                    const { createHmac, randomBytes } = await import("crypto");
                    const token = randomBytes(16).toString("hex");
                    const expire = Math.floor(Date.now() / 1000) + 60 * 10;
                    const signature = createHmac("sha1", ENV.imagekitPrivateKey)
                        .update(token + String(expire))
                        .digest("hex");

                    return {
                        token,
                        expire,
                        signature,
                        publicKey: ENV.imagekitPublicKey,
                        urlEndpoint: ENV.imagekitUrlEndpoint,
                        folder: `/clubs/${input.clubId}/${ctx.user.id}`,
                    } as const;
                }),

            upload: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    mediaType: z.enum(["image", "video"]),
                    mediaUrl: z.string().url(),
                    thumbnailUrl: z.string().url().optional(),
                    caption: z.string().max(500).optional(),
                    eventId: z.number().optional(),
                }))
                .mutation(async ({ ctx, input }) => {
                    await requireClubStaffRole(ctx.user.id, input.clubId);
                    const { uploadClubMedia } = await import("../db_social_enhanced");
                    const media = await uploadClubMedia({
                        ...input,
                        uploaderId: ctx.user.id,
                    });
                    return { success: true, media };
                }),

            uploadFile: protectedProcedure
                .input(
                    z.object({
                        clubId: z.number(),
                        caption: z.string().max(500).optional(),
                        eventId: z.number().optional(),
                        fileBase64: z
                            .string()
                            .min(1)
                            .max(7 * 1024 * 1024, "File troppo grande (max 5MB)")
                            .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64"),
                        mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
                        extension: z.enum(["jpg", "jpeg", "png", "webp"]).optional(),
                    })
                )
                .mutation(async ({ ctx, input }) => {
                    await requireClubStaffRole(ctx.user.id, input.clubId);
                    const { getSupabaseAdminClient } = await import("../_core/supabase_admin");
                    const admin = getSupabaseAdminClient();

                    const MAX_BYTES = 5 * 1024 * 1024;
                    let buffer: Buffer;
                    try {
                        buffer = Buffer.from(input.fileBase64, "base64");
                    } catch {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid base64 payload" });
                    }
                    if (buffer.length > MAX_BYTES) {
                        throw new TRPCError({
                            code: "PAYLOAD_TOO_LARGE",
                            message: "File troppo grande (max 5MB)",
                        });
                    }

                    const detected = detectImageType(buffer);
                    if (!detected) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Formato immagine non supportato. Usa JPG, PNG o WEBP.",
                        });
                    }
                    if (detected.mimeType !== input.mimeType) {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Il MIME type non corrisponde al contenuto del file.",
                        });
                    }

                    // Resize (max 1920x1080) to reduce payload + prevent huge images.
                    try {
                        type SharpPipeline = {
                            rotate: () => SharpPipeline;
                            resize: (options: { width: number; height: number; fit: "inside"; withoutEnlargement: boolean }) => SharpPipeline;
                            jpeg: (options: { quality: number }) => SharpPipeline;
                            png: (options: { compressionLevel: number }) => SharpPipeline;
                            webp: (options: { quality: number }) => SharpPipeline;
                            toBuffer: () => Promise<Buffer>;
                        };
                        type SharpFn = (input: Buffer) => SharpPipeline;

                        const sharpMod = (await import("sharp")) as unknown as { default?: unknown };
                        const sharpFn = ((sharpMod.default ?? sharpMod) as unknown) as SharpFn;
                        const pipeline = sharpFn(buffer)
                            .rotate()
                            .resize({ width: 1920, height: 1080, fit: "inside", withoutEnlargement: true });

                        if (detected.extension === "jpg") {
                            buffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
                        } else if (detected.extension === "png") {
                            buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
                        } else {
                            buffer = await pipeline.webp({ quality: 85 }).toBuffer();
                        }
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        // Best-effort: if resize fails, upload original buffer (still size-limited above).
                        logger.warn(`club media uploadFile: image resize failed: ${message}`, {
                            event: "club_media:upload_resize_failed",
                            userId: ctx.user.id,
                            clubId: input.clubId,
                            message,
                        });
                    }

                    const filePath = `clubs/${input.clubId}/${ctx.user.id}/${Date.now()}.${detected.extension}`;
                    const { error } = await admin.storage
                        .from("profile-media")
                        .upload(filePath, buffer, {
                            contentType: detected.mimeType,
                            upsert: true,
                        });
                    if (error) {
                        throw new TRPCError({
                            code: "INTERNAL_SERVER_ERROR",
                            message: `Upload failed: ${error.message}`,
                        });
                    }

                    const { data } = admin.storage.from("profile-media").getPublicUrl(filePath);
                    const publicUrl = data.publicUrl;

                    const { uploadClubMedia } = await import("../db_social_enhanced");
                    const media = await uploadClubMedia({
                        clubId: input.clubId,
                        uploaderId: ctx.user.id,
                        mediaType: "image",
                        mediaUrl: publicUrl,
                        caption: input.caption,
                        eventId: input.eventId,
                    });

                    return { success: true, media, url: publicUrl };
                }),

            delete: protectedProcedure
                .input(z.object({ mediaId: z.number() }))
                .mutation(async ({ ctx, input }) => {
                    const { getClubMediaById, deleteClubMedia } = await import("../db_social_enhanced");
                    const media = await getClubMediaById(input.mediaId);
                    if (!media) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    await requireClubStaffRole(ctx.user.id, media.clubId);
                    await deleteClubMedia(input.mediaId);
                    return { success: true };
                }),
        }),
    }),

    // DIRECT MESSAGES
    messages: router({
        send: protectedProcedure
            .input(z.object({
                receiverId: z.number(),
                content: z.string().min(1).max(5000),
            }))
            .mutation(async ({ ctx, input }) => {
                const { sendDirectMessage } = await import("../db_social_enhanced");
                const message = await sendDirectMessage({
                    senderId: ctx.user.id,
                    receiverId: input.receiverId,
                    content: input.content,
                });
                return { success: true, message };
            }),

        conversation: protectedProcedure
            .input(z.object({
                otherUserId: z.number(),
                limit: z.number().min(1).max(100).optional(),
                offset: z.number().min(0).optional(),
            }))
            .query(async ({ ctx, input }) => {
                const { getConversation } = await import("../db_social_enhanced");
                return getConversation({
                    userId1: ctx.user.id,
                    userId2: input.otherUserId,
                    limit: input.limit,
                    offset: input.offset,
                });
            }),

        markRead: protectedProcedure
            .input(z.object({ senderId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { markMessagesAsRead } = await import("../db_social_enhanced");
                await markMessagesAsRead({
                    receiverId: ctx.user.id,
                    senderId: input.senderId,
                });
                return { success: true };
            }),

        recent: protectedProcedure
            .input(z.object({ limit: z.number().min(1).max(50).optional() }).optional())
            .query(async ({ ctx, input }) => {
                const { getRecentConversations } = await import("../db_social_enhanced");
                return getRecentConversations(ctx.user.id, input?.limit);
            }),

        unreadCount: protectedProcedure
            .query(async ({ ctx }) => {
                const { getUnreadDmCount } = await import("../db_social_enhanced");
                const count = await getUnreadDmCount(ctx.user.id);
                return { count };
            }),
    }),

    // NOTIFICATIONS
    notifications: router({
        list: protectedProcedure
            .input(z.object({
                limit: z.number().min(1).max(100).optional(),
                onlyUnread: z.boolean().optional(),
            }).optional())
            .query(async ({ ctx, input }) => {
                const { getUserNotifications } = await import("../db_social_enhanced");
                return getUserNotifications({
                    userId: ctx.user.id,
                    limit: input?.limit,
                    onlyUnread: input?.onlyUnread,
                });
            }),

        markRead: protectedProcedure
            .input(z.object({ notificationIds: z.array(z.number()).optional() }).optional())
            .mutation(async ({ ctx, input }) => {
                const { markNotificationsAsRead } = await import("../db_social_enhanced");
                await markNotificationsAsRead(ctx.user.id, input?.notificationIds);
                return { success: true };
            }),

        unreadCount: protectedProcedure
            .query(async ({ ctx }) => {
                const { getUnreadNotificationCount } = await import("../db_social_enhanced");
                const count = await getUnreadNotificationCount(ctx.user.id);
                return { count };
            }),
    }),

    // POST REACTIONS (Reazioni avanzate)
    reactions: router({
        toggle: protectedProcedure
            .input(z.object({
                postId: z.number(),
                reactionType: z.enum(REACTION_TYPES),
            }))
            .mutation(async ({ ctx, input }) => {
                const postMeta = await requirePostReadable(ctx.user.id, input.postId);
                const { togglePostReaction } = await import("../db_social_enhanced");
                const reaction = await togglePostReaction({
                    postId: input.postId,
                    userId: ctx.user.id,
                    reactionType: input.reactionType,
                });
                let actionXp = null;
                if (reaction) {
                    actionXp = await awardActionXp({
                        userId: ctx.user.id,
                        actionType: "reaction",
                        entityId: input.postId,
                    });
                    if (actionXp.awardedXp > 0) {
                        await invalidateUserCache(String(ctx.user.id));
                        await invalidateLeaderboardCache();
                    }

                    // Notify post owner about the reaction
                    try {
                        if (postMeta.ownerId !== ctx.user.id) {
                            const { getDb } = await import("../db");
                            const { sql } = await import("drizzle-orm");
                            const db = await getDb();
                            if (!db) throw new Error("db not available");
                            const actorResult = await db.execute(sql`SELECT name FROM users WHERE id = ${ctx.user.id} LIMIT 1`);
                            const actorName = ((actorResult.rows[0] as any)?.name as string | undefined) || "Qualcuno";
                            const emojiMap: Record<string, string> = {
                                splash: "💧",
                                fire: "🔥",
                                strong: "💪",
                                clap: "👏",
                                wave: "🌊",
                                love: "❤️",
                                rocket: "🚀",
                                wow: "🤯",
                                laugh: "😂",
                                cry: "😢",
                            };
                            const emoji = emojiMap[input.reactionType] || "✨";
                            const { createNotification } = await import("../db_social_enhanced");
                            const link = `/post/${input.postId}`;
                            await createNotification({
                                userId: postMeta.ownerId,
                                type: "reaction",
                                title: "Nuova reazione",
                                message: `${actorName} ha reagito ${emoji} al tuo post.`,
                                link,
                                referenceId: input.postId,
                            });
                        }
                    } catch {
                        // Notifications are best-effort
                    }
                }
                return { success: true, reaction, actionXp };
            }),

        list: protectedProcedure
            .input(z.object({ postId: z.number() }))
            .query(async ({ ctx, input }) => {
                await requirePostReadable(ctx.user.id, input.postId);
                const { getPostReactions } = await import("../db_social_enhanced");
                return getPostReactions(input.postId);
            }),

        userReaction: protectedProcedure
            .input(z.object({ postId: z.number() }))
            .query(async ({ ctx, input }) => {
                await requirePostReadable(ctx.user.id, input.postId);
                const { getUserPostReaction } = await import("../db_social_enhanced");
                return getUserPostReaction(input.postId, ctx.user.id);
            }),
    }),
});
