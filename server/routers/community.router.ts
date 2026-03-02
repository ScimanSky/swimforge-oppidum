import {
    protectedProcedure, router, z,
    TRPCError,
    invalidateUserCache, invalidateLeaderboardCache,
    getSocialFeed, upsertActivityPost, setActivityShare,
    toggleSplash, addComment, getComments, deleteOwnPost,
    hidePostForUser, unhidePostForUser, reportPost,
    awardActionXp,
    detectImageType, logger,
} from "./_shared";
import { createHash } from "crypto";
import { ENV } from "../_core/env";
import { socialPosts } from "../../drizzle/schema";
import { getCloudinaryCreditUsage } from "../lib/cloudinary";
import { uploadImageToMediaProviders } from "../lib/image_upload";
import { ensureUserPresenceSchema, getOnlineIntervalSql } from "../user_presence";
import { createCommunityClubsRouter } from "./community.clubs.router";
import { communityStoriesRouter } from "./community.stories.router";
import { createCommunityReactionsRouter } from "./community.reactions.router";
import { createCommunityMessagesRouter } from "./community.messages.router";
import { communityNotificationsRouter } from "./community.notifications.router";
import { communityUsersRouter } from "./community.users.router";
import { PRODUCT_ANALYTICS_EVENT_NAMES, trackProductEvent } from "../product_analytics";

const CLUB_STAFF_ROLES = new Set(["owner", "admin", "moderator"]);
const HASHTAG_REGEX = /(^|\s)#([A-Za-z0-9_]{2,40})/g;
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
            await ensureUserPresenceSchema();

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
                  (
                    SELECT c.name
                    FROM community_club_members m
                    JOIN community_clubs c ON c.id = m.club_id
                    WHERE m.user_id = p.user_id
                      AND m.status = 'active'
                    ORDER BY m.joined_at DESC NULLS LAST, m.id DESC
                    LIMIT 1
                  ) AS user_club_name,
                  EXISTS(
                    SELECT 1 FROM user_presence up
                    WHERE up.user_id = p.user_id
                      AND up.last_seen_at >= ${getOnlineIntervalSql()}
                  ) AS user_is_online,
                  a.distance_meters AS activity_distance_meters,
                  a.duration_seconds AS activity_duration_seconds,
                  a.activity_date AS activity_date,
                  a.activity_source AS activity_source,
                  a.stroke_type AS activity_stroke_type,
                  a.is_open_water AS activity_is_open_water,
                  a.calories AS activity_calories,
                  a.avg_heart_rate AS activity_heart_rate,
                  a.swolf_score AS activity_swolf,
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
                    scope: z.enum(["posts", "stories", "clubs"]).optional(),
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

            if (scope === "stories") {
                folder = `stories/${ctx.user.id}`;
            } else if (scope === "clubs") {
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

    stories: communityStoriesRouter,

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
                    await trackProductEvent({
                        userId: ctx.user.id,
                        eventName: "ghost_duel_create",
                        source: "ghost_track_tab",
                        entityType: "ghost_challenge",
                        entityId: result.id,
                        metadata: {
                            postId: input.postId,
                        },
                    });
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


    clubs: createCommunityClubsRouter({
        requireClubMemberRole,
        requireClubStaffRole,
        requireClubReadable,
        normalizeExternalWebsiteUrl,
        normalizeMediaUrls,
        normalizeTaggedUserIds,
        normalizeHashtags,
        notifyTaggedUsers,
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
