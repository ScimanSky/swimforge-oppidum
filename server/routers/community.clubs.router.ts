import { ENV } from "../_core/env";
import {
  awardActionXp,
  detectImageType,
  invalidateLeaderboardCache,
  invalidateUserCache,
  logger,
  protectedProcedure,
  router,
  TRPCError,
  z,
} from "./_shared";
import type { ClubAnnouncementInsert, ClubEventInsert } from "./_shared";

const ROUTE_GEOJSON_SCHEMA = z.object({
  type: z.literal("LineString"),
  coordinates: z
    .array(
      z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ]),
    )
    .min(2)
    .max(500),
});

type NotifyTaggedUsersInput = {
  authorUserId: number;
  taggedUserIds: number[];
  postId: number;
  clubId?: number | null;
};

type CommunityClubsDeps = {
  requireClubMemberRole: (userId: number, clubId: number) => Promise<{ role: string; status: string } | { role: string }>;
  requireClubStaffRole: (userId: number, clubId: number) => Promise<unknown>;
  requireClubReadable: (userId: number, clubId: number) => Promise<unknown>;
  normalizeExternalWebsiteUrl: (raw?: string | null) => string | null;
  normalizeMediaUrls: (mediaUrls?: string[] | null, mediaUrl?: string | null) => string[];
  normalizeTaggedUserIds: (authorUserId: number, taggedUserIds?: number[] | null) => number[];
  normalizeHashtags: (content?: string | null, hashtags?: string[] | null) => string[];
  notifyTaggedUsers: (input: NotifyTaggedUsersInput) => Promise<void>;
  routeDistanceMeters: (routeGeoJson?: { coordinates: Array<[number, number]> } | null) => number | null;
  isClubStaffRole: (role: string) => boolean;
};

export function createCommunityClubsRouter(deps: CommunityClubsDeps) {
  const {
    requireClubMemberRole,
    requireClubStaffRole,
    requireClubReadable,
    normalizeExternalWebsiteUrl,
    normalizeMediaUrls,
    normalizeTaggedUserIds,
    normalizeHashtags,
    notifyTaggedUsers,
    routeDistanceMeters,
    isClubStaffRole,
  } = deps;

  return router({
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
                websiteUrl: z.string().max(500).optional().nullable(),
                rules: z.string().max(2000).optional().nullable(),
                visibility: z.enum(["public", "private", "invite"]).optional(),
                isPrivate: z.boolean().optional(),
            }))
            .mutation(async ({ ctx, input }) => {
                const { createClub } = await import("../db_clubs");
                const websiteUrl = normalizeExternalWebsiteUrl(input.websiteUrl ?? null);
                if (input.coverImageUrl) {
                    const isHttpUrl = /^https?:\/\//i.test(input.coverImageUrl);
                    const isDataImage = input.coverImageUrl.startsWith("data:image/");
                    if (!isHttpUrl && !isDataImage) {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cover image URL" });
                    }
                }
                const clubId = await createClub(ctx.user.id, {
                    ...input,
                    websiteUrl,
                });
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
                websiteUrl: z.string().max(500).optional().nullable(),
                rules: z.string().max(2000).optional().nullable(),
                visibility: z.enum(["public", "private", "invite"]).optional(),
                themeColor: z.enum(["cyan", "lime", "coral", "violet"]).optional(),
                logoUrl: z.string().max(5000).optional().nullable(),
                tagline: z.string().max(200).optional().nullable(),
            }))
            .mutation(async ({ ctx, input }) => {
                const { updateClub } = await import("../db_clubs");
                const normalizedWebsiteUrl =
                    input.websiteUrl === undefined
                        ? undefined
                        : normalizeExternalWebsiteUrl(input.websiteUrl);
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
                    websiteUrl: normalizedWebsiteUrl,
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
                    const memberRole = await requireClubMemberRole(ctx.user.id, input.clubId);
                    const isStaff = isClubStaffRole(memberRole.role);
                    if (!isStaff) {
                        const { countUserCreatedClubEventsSince } = await import("../db_social_enhanced");
                        const now = new Date();
                        const startOfUtcDay = new Date(Date.UTC(
                            now.getUTCFullYear(),
                            now.getUTCMonth(),
                            now.getUTCDate(),
                            0,
                            0,
                            0,
                            0,
                        ));
                        const createdToday = await countUserCreatedClubEventsSince({
                            userId: ctx.user.id,
                            since: startOfUtcDay,
                        });
                        if (createdToday >= 1) {
                            throw new TRPCError({
                                code: "PRECONDITION_FAILED",
                                message: "Hai già creato un evento oggi. Limite: 1 evento al giorno per membri non staff.",
                            });
                        }
                    }
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
  });
}
