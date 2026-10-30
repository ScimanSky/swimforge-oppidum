import { CLUB_POST_CONTENT_MAX_LENGTH, DB_UNAVAILABLE_ERR_MSG, POST_CONTENT_MAX_LENGTH } from "@shared/const";
import {
    protectedProcedure, router, z,
    TRPCError,
    invalidateUserCache,
    getSocialFeed, upsertActivityPost, setActivityShare,
    toggleSplash, addComment, getComments, deleteOwnPost,
    updateOwnPost, getOwnPostForEdit,
    hidePostForUser, unhidePostForUser, reportPost,
    detectImageType, logger,
} from "./_shared";
import { createHash } from "crypto";
import { ENV } from "../_core/env";
import { socialPosts } from "../../drizzle/schema";
import { getCloudinaryCreditUsage } from "../lib/cloudinary";
import { uploadImageToMediaProviders } from "../lib/image_upload";
import { activityCardSql, authorClubNameSql } from "../db_social";
import { notifyMentionedUsers, resolveMentionedUserIds, taggedApartIds } from "../lib/mentions";
import { createCommunityClubsRouter } from "./community.clubs.router";
import { createCommunityReactionsRouter } from "./community.reactions.router";
import { createCommunityMessagesRouter } from "./community.messages.router";
import { communityNotificationsRouter } from "./community.notifications.router";
import { communityUsersRouter } from "./community.users.router";
import { PRODUCT_ANALYTICS_EVENT_NAMES, trackProductEvent } from "../product_analytics";

const CLUB_STAFF_ROLES = new Set(["owner", "admin", "moderator"]);
function normalizeMediaUrls(mediaUrls?: string[] | null, mediaUrl?: string | null) {
    const values = [...(mediaUrls ?? []), mediaUrl ?? ""]
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 6);
    return Array.from(new Set(values));
}

function normalizeExternalWebsiteUrl(raw?: string | null) {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed: URL;
    try {
        parsed = new URL(candidate);
    } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "URL sito club non valido." });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "URL sito club non valido." });
    }
    return parsed.toString();
}

function buildCloudinarySignature(
    params: Record<string, string | number | undefined>,
    apiSecret: string
) {
    const payload = Object.entries(params)
        .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join("&");

    return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
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
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: DB_UNAVAILABLE_ERR_MSG });
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
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: DB_UNAVAILABLE_ERR_MSG });

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
                  p.visibility,
                  p.created_at,
                  p.updated_at,
                  u.name AS user_name,
                  sp.username AS user_username,
                  sp.avatar_url AS user_avatar,
                  ${authorClubNameSql(ctx.user.id)} AS user_club_name,
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
            await trackProductEvent({
                userId: ctx.user.id,
                eventName: "feed_post_view",
                source: "post_detail",
                entityType: "social_post",
                entityId: Number((row as { id?: number }).id ?? input.postId),
                metadata: {
                    clubId: (row as { club_id?: number | null }).club_id ?? null,
                },
            });
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
            content: z.string().max(POST_CONTENT_MAX_LENGTH).optional().nullable(),
            mediaUrl: z.string().url().optional().nullable(),
            mediaUrls: z.array(z.string().url()).max(6).optional(),
            /** Users picked after «@» in the composer; kept only if still written in the text. */
            taggedUserIds: z.array(z.number().int().positive()).max(20).optional(),
            visibility: z.enum(["public", "private"]).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const content = input.content?.trim() ?? null;
            const mediaUrls = normalizeMediaUrls(input.mediaUrls, input.mediaUrl ?? null);
            const taggedUserIds = await resolveMentionedUserIds(ctx.user.id, content, input.taggedUserIds);
            const postId = await upsertActivityPost(ctx.user.id, input.activityId, {
                content,
                mediaUrl: mediaUrls[0] ?? null,
                mediaUrls,
                taggedUserIds,
                visibility: input.visibility ?? "public",
            });
            if (postId) {
                await notifyMentionedUsers({
                    authorUserId: ctx.user.id,
                    mentionedUserIds: taggedUserIds,
                    postId,
                    clubId: null,
                });
                await trackProductEvent({
                    userId: ctx.user.id,
                    eventName: "feed_post_create",
                    source: "community_feed",
                    entityType: "social_post",
                    entityId: postId,
                    metadata: {
                        hasActivity: true,
                        hasMedia: mediaUrls.length > 0,
                        visibility: input.visibility ?? "public",
                    },
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
            await requirePostReadable(ctx.user.id, input.postId);
            // XP comes only from swimming: a splash gives none.
            return toggleSplash(ctx.user.id, input.postId);
        }),

    addComment: protectedProcedure
        .input(z.object({
            postId: z.number(),
            content: z.string().min(1).max(1000),
        }))
        .mutation(async ({ ctx, input }) => {
            await requirePostReadable(ctx.user.id, input.postId);
            // XP comes only from swimming: a comment gives none.
            const commentId = await addComment(ctx.user.id, input.postId, input.content);
            return { success: true, commentId };
        }),

    comments: protectedProcedure
        .input(z.object({
            postId: z.number(),
        }))
        .query(async ({ ctx, input }) => {
            await requirePostReadable(ctx.user.id, input.postId);
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
                throw new TRPCError({ code: "BAD_REQUEST", message });
            }
        }),

    /** The author's post as the editor needs it: by post id or by the shared swim. */
    ownPost: protectedProcedure
        .input(z.union([
            z.object({ postId: z.number().int().positive() }),
            z.object({ activityId: z.number().int().positive() }),
        ]))
        .query(async ({ ctx, input }) => {
            const post = await getOwnPostForEdit(ctx.user.id, input);
            if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post non trovato" });
            return post;
        }),

    /**
     * The author edits their post. A field left out stays as it is (null or [] clears it): text,
     * media, and the mentions (`taggedUserIds`). People tagged apart by posts from before «@»
     * stay while the editor still sends them.
     */
    updatePost: protectedProcedure
        .input(z.object({
            postId: z.number().int().positive(),
            content: z.string().max(POST_CONTENT_MAX_LENGTH).optional().nullable(),
            mediaUrls: z.array(z.string().url()).max(6).optional(),
            taggedUserIds: z.array(z.number().int().positive()).max(20).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            try {
                const existing = await getOwnPostForEdit(ctx.user.id, { postId: input.postId });
                const previousTagged = (existing?.taggedUsers ?? []).map((user) => user.userId);
                const content = input.content === undefined ? (existing?.content ?? null) : input.content;
                // Mentions count only while written in the text; people tagged apart (older
                // posts) stay while the editor sends them. No ids sent: the post's own.
                const taggedUserIds = await resolveMentionedUserIds(
                    ctx.user.id,
                    content,
                    input.taggedUserIds ?? previousTagged,
                    { keepTagged: taggedApartIds(existing?.content, existing?.taggedUsers ?? []) },
                );
                const result = await updateOwnPost(ctx.user.id, input.postId, {
                    content: input.content,
                    mediaUrls: input.mediaUrls === undefined ? undefined : normalizeMediaUrls(input.mediaUrls, null),
                    taggedUserIds,
                });
                // Only the mentions added by this edit are told (and never twice for a post).
                await notifyMentionedUsers({
                    authorUserId: ctx.user.id,
                    mentionedUserIds: result.addedTaggedUserIds,
                    postId: result.postId,
                    clubId: result.clubId,
                });
                return { success: true, postId: result.postId };
            } catch (error) {
                const message = error instanceof Error ? error.message : "";
                if (message === "Post not found") {
                    throw new TRPCError({ code: "NOT_FOUND", message: "Post non trovato" });
                }
                if (message === "Cannot edit other users posts") {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Puoi modificare solo i tuoi post" });
                }
                if (message === "Not a club member") {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "Non fai più parte del club: puoi eliminare il post, non modificarlo.",
                    });
                }
                if (message === "Empty post") {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Inserisci un testo o almeno un media." });
                }
                if (message === "Content too long") {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `Un post del club può avere al massimo ${CLUB_POST_CONTENT_MAX_LENGTH} caratteri.`,
                    });
                }
                if (message === DB_UNAVAILABLE_ERR_MSG) {
                    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
                }
                logger.error("[community] updatePost failed", {
                    userId: ctx.user.id,
                    postId: input.postId,
                    error: message || String(error),
                });
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Non riesco a salvare il post. Riprova." });
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
            content: z.string().max(POST_CONTENT_MAX_LENGTH).optional().nullable(),
            mediaUrl: z.string().url().optional().nullable(),
            mediaUrls: z.array(z.string().url()).max(6).optional(),
            /** Users picked after «@» in the composer; kept only if still written in the text. */
            taggedUserIds: z.array(z.number().int().positive()).max(20).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { getDb } = await import("../db");
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: DB_UNAVAILABLE_ERR_MSG });

            const content = input.content?.trim() ?? null;
            const mediaUrls = normalizeMediaUrls(input.mediaUrls, input.mediaUrl ?? null);
            if (!content && mediaUrls.length === 0) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Inserisci un testo o almeno un media." });
            }
            const taggedUserIds = await resolveMentionedUserIds(ctx.user.id, content, input.taggedUserIds);

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
                    visibility: "public",
                    isDeleted: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning({ id: socialPosts.id });
            const postId = inserted[0]?.id ?? null;
            if (postId) {
                await notifyMentionedUsers({
                    authorUserId: ctx.user.id,
                    mentionedUserIds: taggedUserIds,
                    postId,
                    clubId: null,
                });
                await trackProductEvent({
                    userId: ctx.user.id,
                    eventName: "feed_post_create",
                    source: "community_feed",
                    entityType: "social_post",
                    entityId: postId,
                    metadata: {
                        hasActivity: false,
                        hasMedia: mediaUrls.length > 0,
                        visibility: "public",
                    },
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

    postUploadImage: protectedProcedure
        .input(z.object({
            fileBase64: z
                .string()
                .min(1)
                .max(30 * 1024 * 1024, "File troppo grande (max 20MB)")
                .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64"),
            mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
        }))
        .mutation(async ({ ctx, input }) => {
            const MAX_BYTES = 20 * 1024 * 1024;
            let buffer: Buffer;
            try {
                buffer = Buffer.from(input.fileBase64, "base64");
            } catch {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid base64 payload" });
            }
            if (buffer.length > MAX_BYTES) {
                throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "File troppo grande (max 20MB)" });
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
                    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });

                if (detected.extension === "jpg") {
                    buffer = await pipeline.jpeg({ quality: 85 }).toBuffer();
                } else if (detected.extension === "png") {
                    buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
                } else {
                    buffer = await pipeline.webp({ quality: 85 }).toBuffer();
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logger.warn(`post upload fallback: image resize failed: ${message}`, {
                    event: "post:upload_fallback_resize_failed",
                    userId: ctx.user.id,
                    message,
                });
            }

            try {
                const uploaded = await uploadImageToMediaProviders({
                    buffer,
                    mimeType: detected.mimeType,
                    folder: `posts/${ctx.user.id}`,
                    fileNamePrefix: "post",
                    tags: ["post", `user-${ctx.user.id}`],
                });
                return { url: uploaded.url };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Upload failed: ${message}` });
            }
        }),

    cloudinaryVideoAuth: protectedProcedure
        .input(
            z
                .object({
                    scope: z.enum(["posts", "clubs"]).optional(),
                    clubId: z.number().optional(),
                })
                .optional()
        )
        .mutation(async ({ ctx, input }) => {
            if (!ENV.cloudinaryCloudName || !ENV.cloudinaryApiKey || !ENV.cloudinaryApiSecret) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: "Cloudinary non configurato sul server.",
                });
            }

            const scope = input?.scope ?? "posts";
            let folder = `posts/${ctx.user.id}`;

            if (scope === "clubs") {
                if (!input?.clubId) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "clubId richiesto per upload video del club.",
                    });
                }
                await requireClubStaffRole(ctx.user.id, input.clubId);
                folder = `clubs/${input.clubId}/${ctx.user.id}`;
            }

            const usage = await getCloudinaryCreditUsage();
            if (usage && usage.percentUsed >= ENV.cloudinaryVideoCreditBlockPercent) {
                throw new TRPCError({
                    code: "PRECONDITION_FAILED",
                    message: `Upload video temporaneamente bloccato: quota Cloudinary al ${usage.percentUsed.toFixed(
                        1
                    )}% (${usage.used}/${usage.limit} crediti).`,
                });
            }

            const warning =
                usage && usage.percentUsed >= ENV.cloudinaryVideoCreditWarnPercent
                    ? `Attenzione: quota Cloudinary al ${usage.percentUsed.toFixed(1)}% (${usage.used}/${usage.limit} crediti).`
                    : null;

            const timestamp = Math.floor(Date.now() / 1000);
            const signature = buildCloudinarySignature(
                {
                    folder,
                    timestamp,
                },
                ENV.cloudinaryApiSecret
            );

            return {
                cloudName: ENV.cloudinaryCloudName,
                apiKey: ENV.cloudinaryApiKey,
                timestamp,
                signature,
                folder,
                warning,
                creditUsage: usage,
            } as const;
        }),

    cloudinaryVideoUsage: protectedProcedure
        .query(async () => {
            const usage = await getCloudinaryCreditUsage();
            if (!usage) return null;
            return {
                ...usage,
                warnThreshold: ENV.cloudinaryVideoCreditWarnPercent,
                blockThreshold: ENV.cloudinaryVideoCreditBlockPercent,
                isWarning: usage.percentUsed >= ENV.cloudinaryVideoCreditWarnPercent,
                isBlocked: usage.percentUsed >= ENV.cloudinaryVideoCreditBlockPercent,
            };
        }),

    /**
     * Swims of the last 30 days not yet in the feed, plus `includeActivityId` (a swim opened
     * from its detail page, of any date) when it is the user's and not shared.
     */
    unsharedActivities: protectedProcedure
        .input(z.object({ includeActivityId: z.number().int().positive().optional() }).optional())
        .query(async ({ ctx, input }) => {
            const { getDb } = await import("../db");
            const { sql } = await import("drizzle-orm");
            const db = await getDb();
            if (!db) return [];

            const includeId = input?.includeActivityId ?? null;
            const recentOrIncluded = includeId
                ? sql`(activity_date > NOW() - INTERVAL '30 days' OR id = ${includeId})`
                : sql`activity_date > NOW() - INTERVAL '30 days'`;
            const result = await db.execute(sql`
                SELECT id, activity_name, distance_meters, duration_seconds, activity_date, activity_source
                FROM swimming_activities
                WHERE user_id = ${ctx.user.id}
                  AND share_to_feed = false
                  AND ${recentOrIncluded}
                ORDER BY activity_date DESC
                LIMIT 20
            `);
            const rows = result.rows as Array<{ id: number }>;
            if (includeId && !rows.some((row) => Number(row.id) === includeId)) {
                // The swim asked for (latestSwim): also when it is marked shared but its post is
                // gone, so sharing it again is possible (see latestSwim).
                const included = await db.execute(sql`
                    SELECT a.id, a.activity_name, a.distance_meters, a.duration_seconds, a.activity_date, a.activity_source
                    FROM swimming_activities a
                    WHERE a.user_id = ${ctx.user.id}
                      AND a.id = ${includeId}
                      AND (
                        a.share_to_feed = false
                        OR NOT EXISTS (
                          SELECT 1 FROM social_posts p
                          WHERE p.activity_id = a.id AND p.user_id = a.user_id AND p.is_deleted = false
                        )
                      )
                    LIMIT 1
                `);
                return [...included.rows, ...rows];
            }
            return rows;
        }),

    /**
     * The user's most recent swim, for «Condividi l'ultima nuotata»; null when none. `shared`
     * only when its post is really in the feed: a swim marked shared whose post is gone (an
     * older inconsistency) opens the share sheet, not an editor with nothing to edit.
     */
    latestSwim: protectedProcedure
        .query(async ({ ctx }) => {
            const { getDb } = await import("../db");
            const { sql } = await import("drizzle-orm");
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: DB_UNAVAILABLE_ERR_MSG });

            const result = await db.execute(sql`
                SELECT a.id, a.activity_name, a.activity_date,
                    (a.share_to_feed AND EXISTS (
                        SELECT 1 FROM social_posts p
                        WHERE p.activity_id = a.id AND p.user_id = a.user_id AND p.is_deleted = false
                    )) AS share_to_feed
                FROM swimming_activities a
                WHERE a.user_id = ${ctx.user.id}
                ORDER BY a.activity_date DESC, a.id DESC
                LIMIT 1
            `);
            const row = result.rows[0] as
                | { id: number; activity_name: string | null; activity_date: Date | string | null; share_to_feed: boolean | null }
                | undefined;
            if (!row) return null;
            return {
                id: Number(row.id),
                activityName: row.activity_name,
                activityDate: row.activity_date,
                shared: Boolean(row.share_to_feed),
            };
        }),

    users: communityUsersRouter,

    analytics: router({
        track: protectedProcedure
            .input(z.object({
                eventName: z.enum(PRODUCT_ANALYTICS_EVENT_NAMES),
                source: z.string().max(80).optional(),
                entityType: z.string().max(80).optional(),
                entityId: z.number().int().positive().optional(),
                metadata: z
                    .record(
                        z.string().min(1).max(48),
                        z.union([z.string().max(240), z.number(), z.boolean(), z.null()]),
                    )
                    .optional(),
            }))
            .mutation(async ({ ctx, input }) => {
                await trackProductEvent({
                    userId: ctx.user.id,
                    eventName: input.eventName,
                    source: input.source,
                    entityType: input.entityType,
                    entityId: input.entityId ?? null,
                    metadata: input.metadata,
                });
                return { success: true };
            }),
    }),

    clubs: createCommunityClubsRouter({
        requireClubMemberRole,
        requireClubStaffRole,
        requireClubReadable,
        normalizeExternalWebsiteUrl,
        normalizeMediaUrls,
        routeDistanceMeters,
        isClubStaffRole: (role) => CLUB_STAFF_ROLES.has(role),
    }),

    // DIRECT MESSAGES
    messages: createCommunityMessagesRouter({ requirePostReadable }),

    // NOTIFICATIONS
    notifications: communityNotificationsRouter,

    // POST REACTIONS (Reazioni avanzate)
    reactions: createCommunityReactionsRouter({ requirePostReadable }),
});
