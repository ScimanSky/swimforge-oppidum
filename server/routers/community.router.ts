import {
    protectedProcedure, router, z,
    TRPCError,
    invalidateUserCache, invalidateLeaderboardCache,
    getSocialFeed, upsertActivityPost, setActivityShare,
    toggleSplash, addComment, getComments,
    getUserPublicProfile, toggleFollow, getSuggestedUsers,
    awardActionXp,
    detectImageType, logger,
} from "./_shared";
import type { ClubEventInsert, ClubAnnouncementInsert } from "./_shared";

export const communityRouter = router({
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
            visibility: z.enum(["public", "private"]).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const postId = await upsertActivityPost(ctx.user.id, input.activityId, {
                content: input.content ?? null,
                mediaUrl: input.mediaUrl ?? null,
                visibility: input.visibility ?? "public",
            });
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

    createTextPost: protectedProcedure
        .input(z.object({
            content: z.string().min(1).max(2000),
            mediaUrl: z.string().url().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const { getDb } = await import("../db");
            const { sql } = await import("drizzle-orm");
            const db = await getDb();
            if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

            const result = await db.execute(sql`
                INSERT INTO social_posts (user_id, activity_id, club_id, content, media_url, visibility, is_deleted, created_at, updated_at)
                VALUES (${ctx.user.id}, NULL, NULL, ${input.content}, ${input.mediaUrl ?? null}, 'public', false, NOW(), NOW())
                RETURNING id
            `);
            const postId = (result.rows[0] as any)?.id ?? null;
            return { success: true, postId };
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

        create: protectedProcedure
            .input(z.object({
                mediaUrl: z.string().url().optional(),
                caption: z.string().max(500).optional(),
                type: z.enum(["image", "video", "text"]),
            }))
            .mutation(async ({ ctx, input }) => {
                const { createStory } = await import("../db_stories");
                const story = await createStory(ctx.user.id, {
                    mediaUrl: input.mediaUrl ?? null,
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

        delete: protectedProcedure
            .input(z.object({ storyId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { deleteStory } = await import("../db_stories");
                return deleteStory(input.storyId, ctx.user.id);
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
            .input(z.object({ clubId: z.number() }))
            .mutation(async ({ ctx, input }) => {
                const { joinClub } = await import("../db_clubs");
                return joinClub(ctx.user.id, input.clubId);
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

        members: protectedProcedure
            .input(z.object({ clubId: z.number() }))
            .query(async ({ ctx, input }) => {
                const { getClubById, listClubMembers } = await import("../db_clubs");
                const club = await getClubById(ctx.user.id, input.clubId);
                if (!club) {
                    throw new TRPCError({ code: "NOT_FOUND" });
                }
                if (club.is_private && !club.is_member) {
                    throw new TRPCError({ code: "FORBIDDEN" });
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
                if (club.is_private && !club.is_member) {
                    throw new TRPCError({ code: "FORBIDDEN" });
                }
                return getClubFeed(ctx.user.id, input.clubId, input.limit ?? 20);
            }),

        createPost: protectedProcedure
            .input(z.object({
                clubId: z.number(),
                content: z.string().min(1).max(1000).optional(),
                mediaUrl: z.string().url().optional().nullable(),
            }))
            .mutation(async ({ ctx, input }) => {
                const { getClubById, createClubPost } = await import("../db_clubs");
                const club = await getClubById(ctx.user.id, input.clubId);
                if (!club) {
                    throw new TRPCError({ code: "NOT_FOUND" });
                }
                if (club.is_private && !club.is_member) {
                    throw new TRPCError({ code: "FORBIDDEN" });
                }
                const postId = await createClubPost(ctx.user.id, input.clubId, {
                    content: input.content ?? null,
                    mediaUrl: input.mediaUrl ?? null,
                });
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
                    startTime: z.string().datetime(),
                    endTime: z.string().datetime().optional(),
                    maxAttendees: z.number().min(1).optional(),
                    isRecurring: z.boolean().optional(),
                    recurringRule: z.string().optional(),
                    coverImageUrl: z.string().url().optional(),
                }))
                .mutation(async ({ ctx, input }) => {
                    const { createClubEvent } = await import("../db_social_enhanced");
                    const event = await createClubEvent({
                        ...input,
                        creatorId: ctx.user.id,
                        startTime: new Date(input.startTime),
                        endTime: input.endTime ? new Date(input.endTime) : undefined,
                    });
                    return { success: true, event };
                }),

            get: protectedProcedure
                .input(z.object({ eventId: z.number() }))
                .query(async ({ input }) => {
                    const { getEventById } = await import("../db_social_enhanced");
                    return getEventById(input.eventId);
                }),

            update: protectedProcedure
                .input(z.object({
                    eventId: z.number(),
                    title: z.string().min(1).max(200).optional(),
                    description: z.string().max(5000).optional(),
                    eventType: z.enum(["training", "race", "social", "meeting"]).optional(),
                    location: z.string().max(500).optional(),
                    startTime: z.string().datetime().optional(),
                    endTime: z.string().datetime().optional(),
                    status: z.enum(["active", "cancelled", "completed"]).optional(),
                }))
                .mutation(async ({ input }) => {
                    const { updateClubEvent } = await import("../db_social_enhanced");
                    const { eventId, startTime, endTime, ...rest } = input;
                    const updates: Partial<ClubEventInsert> = {
                        ...rest,
                        ...(startTime ? { startTime: new Date(startTime) } : {}),
                        ...(endTime ? { endTime: new Date(endTime) } : {}),
                    };
                    const event = await updateClubEvent(eventId, updates);
                    return { success: true, event };
                }),

            delete: protectedProcedure
                .input(z.object({ eventId: z.number() }))
                .mutation(async ({ input }) => {
                    const { deleteClubEvent } = await import("../db_social_enhanced");
                    await deleteClubEvent(input.eventId);
                    return { success: true };
                }),

            rsvp: protectedProcedure
                .input(z.object({
                    eventId: z.number(),
                    status: z.enum(["going", "maybe", "not_going"]),
                }))
                .mutation(async ({ ctx, input }) => {
                    const { rsvpToEvent } = await import("../db_social_enhanced");
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
                .query(async ({ input }) => {
                    const { getEventAttendees } = await import("../db_social_enhanced");
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
                .query(async ({ input }) => {
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
                .mutation(async ({ input }) => {
                    const { updateClubAnnouncement } = await import("../db_social_enhanced");
                    const { announcementId, expiresAt, ...rest } = input;
                    const updates: Partial<ClubAnnouncementInsert> = {
                        ...rest,
                        ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
                    };
                    const announcement = await updateClubAnnouncement(announcementId, updates);
                    return { success: true, announcement };
                }),

            delete: protectedProcedure
                .input(z.object({ announcementId: z.number() }))
                .mutation(async ({ input }) => {
                    const { deleteClubAnnouncement } = await import("../db_social_enhanced");
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
                .query(async ({ input }) => {
                    const { getClubMediaGallery } = await import("../db_social_enhanced");
                    return getClubMediaGallery(input);
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
                .mutation(async ({ input }) => {
                    const { deleteClubMedia } = await import("../db_social_enhanced");
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
                reactionType: z.enum(["splash", "fire", "strong", "clap", "wave"]),
            }))
            .mutation(async ({ ctx, input }) => {
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
                }
                return { success: true, reaction, actionXp };
            }),

        list: protectedProcedure
            .input(z.object({ postId: z.number() }))
            .query(async ({ input }) => {
                const { getPostReactions } = await import("../db_social_enhanced");
                return getPostReactions(input.postId);
            }),

        userReaction: protectedProcedure
            .input(z.object({ postId: z.number() }))
            .query(async ({ ctx, input }) => {
                const { getUserPostReaction } = await import("../db_social_enhanced");
                return getUserPostReaction(input.postId, ctx.user.id);
            }),
    }),
});
