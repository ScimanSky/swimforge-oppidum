import { ENV } from "../_core/env";
import { uploadImageToMediaProviders } from "../lib/image_upload";
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
import { trackProductEvent } from "../product_analytics";
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

const ENTRY_STATUS_VALUES = ["pending", "confirmed", "waitlist", "rejected", "withdrawn"] as const;
const WORKOUT_FOCUS_VALUES = ["tecnica", "aerobico", "soglia", "velocita", "recupero"] as const;
const WORKOUT_STROKE_VALUES = ["sl", "do", "ra", "de", "mx"] as const;
const WORKOUT_EQUIPMENT_VALUES = ["pinne", "palette", "pull", "tavoletta", "snorkel"] as const;

const CLUB_POOL_WORKOUT_DIRECTIVES_SCHEMA = z.object({
    focus: z.array(z.enum(WORKOUT_FOCUS_VALUES)).min(1).max(5),
    volume: z.enum(["light", "medium", "high", "very_high"]),
    intensity: z.enum(["easy", "mixed", "hard"]),
    strokeMix: z.array(z.enum(WORKOUT_STROKE_VALUES)).min(1).max(5),
    equipment: z.array(z.enum(WORKOUT_EQUIPMENT_VALUES)).max(5),
    sessionMinutes: z.union([z.literal(45), z.literal(60), z.literal(75), z.literal(90)]),
    targetDistanceMeters: z.number().min(500).max(10000).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
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

  const meetsProcedure = protectedProcedure.use(async ({ next }) => {
    if (!ENV.clubMeetsV1Enabled) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "La sezione gare del club è disattivata.",
      });
    }
    return next();
  });

  const historyProcedure = protectedProcedure.use(async ({ next }) => {
    if (!ENV.clubHistoryV1Enabled) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "La sezione storico club è disattivata.",
      });
    }
    return next();
  });

  const aiCoachAutomationProcedure = protectedProcedure.use(async ({ next }) => {
    if (!ENV.clubAiAutomationEnabled) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "La gestione automatica Coach AI è disattivata.",
      });
    }
    return next();
  });

  const CLUB_COACH_UPLOAD_ROLES = new Set(["coach", "owner", "admin", "moderator"]);
  const requireClubCoachUploadRole = async (userId: number, clubId: number) => {
    const role = await requireClubMemberRole(userId, clubId);
    if (!CLUB_COACH_UPLOAD_ROLES.has(role.role)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Solo coach/staff del club possono caricare PDF.",
      });
    }
    return role;
  };

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
                    coverImageUrl: input.coverImageUrl,
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

        // CLUB MEETS (gare/convocazioni)
        meets: router({
            list: meetsProcedure
                .input(z.object({
                    clubId: z.number(),
                    season: z.number().min(2000).max(2100).optional(),
                }))
                .query(async ({ ctx, input }) => {
                    const { listClubMeets } = await import("../db_club_meets");
                    return listClubMeets({
                        userId: ctx.user.id,
                        clubId: input.clubId,
                        season: input.season,
                    });
                }),

            get: meetsProcedure
                .input(z.object({ meetId: z.number() }))
                .query(async ({ ctx, input }) => {
                    const { getClubMeetDetail } = await import("../db_club_meets");
                    const detail = await getClubMeetDetail({
                        userId: ctx.user.id,
                        meetId: input.meetId,
                    });
                    if (!detail) throw new TRPCError({ code: "NOT_FOUND" });
                    return detail;
                }),

            create: meetsProcedure
                .input(z.object({
                    clubId: z.number(),
                    name: z.string().min(3).max(200),
                    venue: z.string().max(400).optional().nullable(),
                    startDate: z.string().datetime(),
                    endDate: z.string().datetime(),
                    registrationDeadline: z.string().datetime(),
                    notes: z.string().max(5000).optional().nullable(),
                    timezone: z.string().max(64).optional(),
                }))
                .mutation(async ({ ctx, input }) => {
                    const { createClubMeet } = await import("../db_club_meets");
                    try {
                        const meet = await createClubMeet({
                            actorId: ctx.user.id,
                            clubId: input.clubId,
                            name: input.name,
                            venue: input.venue ?? null,
                            startDate: new Date(input.startDate),
                            endDate: new Date(input.endDate),
                            registrationDeadline: new Date(input.registrationDeadline),
                            notes: input.notes ?? null,
                            timezone: input.timezone ?? "Europe/Rome",
                        });
                        return { success: true, meet };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile creare convocazione";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        if (message === "Duplicate meet") {
                            throw new TRPCError({
                                code: "CONFLICT",
                                message: "Esiste già una convocazione identica per questo club.",
                            });
                        }
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            update: meetsProcedure
                .input(z.object({
                    meetId: z.number(),
                    name: z.string().min(3).max(200).optional(),
                    venue: z.string().max(400).optional().nullable(),
                    startDate: z.string().datetime().optional(),
                    endDate: z.string().datetime().optional(),
                    registrationDeadline: z.string().datetime().optional(),
                    notes: z.string().max(5000).optional().nullable(),
                    timezone: z.string().max(64).optional(),
                }))
                .mutation(async ({ ctx, input }) => {
                    const { updateClubMeet } = await import("../db_club_meets");
                    try {
                        const updated = await updateClubMeet({
                            actorId: ctx.user.id,
                            meetId: input.meetId,
                            name: input.name,
                            venue: input.venue,
                            startDate: input.startDate ? new Date(input.startDate) : undefined,
                            endDate: input.endDate ? new Date(input.endDate) : undefined,
                            registrationDeadline: input.registrationDeadline ? new Date(input.registrationDeadline) : undefined,
                            notes: input.notes,
                            timezone: input.timezone,
                        });
                        return { success: true, meet: updated };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile aggiornare convocazione";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            publish: meetsProcedure
                .input(z.object({ meetId: z.number() }))
                .mutation(async ({ ctx, input }) => {
                    const { transitionClubMeetStatus, listMeetMemberRecipients } = await import("../db_club_meets");
                    const { createNotification } = await import("../db_social_enhanced");
                    try {
                        const { meet, changed } = await transitionClubMeetStatus({
                            actorId: ctx.user.id,
                            meetId: input.meetId,
                            status: "published",
                        });
                        if (changed) {
                            const recipients = await listMeetMemberRecipients({ meetId: input.meetId, audience: "all" });
                            await Promise.allSettled(
                                recipients.map((recipient) =>
                                    createNotification({
                                        userId: recipient.userId,
                                        type: "meet_published",
                                        title: "Nuova convocazione gara",
                                        message: `Il meeting \"${meet.name}\" è stato pubblicato.`,
                                        link: `/community/club/${meet.clubId}/meet/${meet.id}`,
                                        referenceId: meet.id,
                                    }),
                                ),
                            );
                        }
                        return { success: true, meet, changed };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile pubblicare convocazione";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            openEntries: meetsProcedure
                .input(z.object({ meetId: z.number() }))
                .mutation(async ({ ctx, input }) => {
                    const { transitionClubMeetStatus, listMeetMemberRecipients } = await import("../db_club_meets");
                    const { createNotification } = await import("../db_social_enhanced");
                    try {
                        const { meet, changed } = await transitionClubMeetStatus({
                            actorId: ctx.user.id,
                            meetId: input.meetId,
                            status: "open",
                        });
                        if (changed) {
                            const recipients = await listMeetMemberRecipients({ meetId: input.meetId, audience: "all" });
                            await Promise.allSettled(
                                recipients.map((recipient) =>
                                    createNotification({
                                        userId: recipient.userId,
                                        type: "meet_entries_open",
                                        title: "Iscrizioni aperte",
                                        message: `Le iscrizioni per \"${meet.name}\" sono aperte.`,
                                        link: `/community/club/${meet.clubId}/meet/${meet.id}`,
                                        referenceId: meet.id,
                                    }),
                                ),
                            );
                        }
                        return { success: true, meet, changed };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile aprire iscrizioni";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            closeEntries: meetsProcedure
                .input(z.object({ meetId: z.number() }))
                .mutation(async ({ ctx, input }) => {
                    const { transitionClubMeetStatus } = await import("../db_club_meets");
                    try {
                        const { meet, changed } = await transitionClubMeetStatus({
                            actorId: ctx.user.id,
                            meetId: input.meetId,
                            status: "closed",
                        });
                        return { success: true, meet, changed };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile chiudere iscrizioni";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            delete: meetsProcedure
                .input(z.object({ meetId: z.number() }))
                .mutation(async ({ ctx, input }) => {
                    const { deleteClubMeet } = await import("../db_club_meets");
                    try {
                        const outcome = await deleteClubMeet({
                            actorId: ctx.user.id,
                            meetId: input.meetId,
                        });
                        return { success: true, outcome };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile cancellare convocazione";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            events: router({
                upsertBatch: meetsProcedure
                    .input(z.object({
                        meetId: z.number(),
                        replaceAll: z.boolean().optional(),
                        events: z.array(z.object({
                            id: z.number().optional(),
                            label: z.string().min(2).max(120),
                            programOrder: z.number().min(0).max(1000).optional(),
                            distanceMeters: z.number().min(25).max(20000).optional().nullable(),
                            stroke: z.string().max(32).optional().nullable(),
                            gender: z.string().max(16).optional().nullable(),
                            masterCategory: z.string().max(64).optional().nullable(),
                            scheduledAt: z.string().datetime().optional().nullable(),
                            notes: z.string().max(500).optional().nullable(),
                        })).min(1).max(200),
                    }))
                    .mutation(async ({ ctx, input }) => {
                        const { upsertClubMeetEvents } = await import("../db_club_meets");
                        try {
                            const events = await upsertClubMeetEvents({
                                actorId: ctx.user.id,
                                meetId: input.meetId,
                                replaceAll: input.replaceAll,
                                events: input.events.map((item) => ({
                                    ...item,
                                    scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : null,
                                })),
                            });
                            return { success: true, events };
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile aggiornare programma gare";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                            if (message === "Cannot remove events with entries" || message === "Cannot remove events with results") {
                                throw new TRPCError({ code: "PRECONDITION_FAILED", message });
                            }
                            if (message === "Duplicate events in payload") {
                                throw new TRPCError({ code: "CONFLICT", message: "Programma contiene eventi duplicati." });
                            }
                            if (message === "Event not found") throw new TRPCError({ code: "NOT_FOUND", message });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),

            entries: router({
                list: meetsProcedure
                    .input(z.object({ meetId: z.number() }))
                    .query(async ({ ctx, input }) => {
                        const { listClubMeetEntries } = await import("../db_club_meets");
                        try {
                            return await listClubMeetEntries({
                                userId: ctx.user.id,
                                meetId: input.meetId,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile leggere iscrizioni";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),

                selfSet: meetsProcedure
                    .input(z.object({
                        meetEventId: z.number(),
                        status: z.enum(["pending", "withdrawn"]),
                        seedTimeCs: z.number().min(1).max(10_000_000).optional(),
                    }))
                    .mutation(async ({ ctx, input }) => {
                        const { selfSetMeetEntry, listMeetMemberRecipients } = await import("../db_club_meets");
                        const { createNotification } = await import("../db_social_enhanced");
                        try {
                            const result = await selfSetMeetEntry({
                                userId: ctx.user.id,
                                meetEventId: input.meetEventId,
                                status: input.status,
                                seedTimeCs: input.seedTimeCs,
                            });

                            if (result.shouldNotifyStaff) {
                                const recipients = await listMeetMemberRecipients({
                                    meetId: result.meetId,
                                    audience: "staff",
                                });
                                const actorName = String(ctx.user.name ?? "").trim()
                                    || String(ctx.user.email ?? "").split("@")[0]
                                    || "Un atleta";
                                await Promise.allSettled(
                                    recipients
                                        .filter((recipient) => recipient.userId !== ctx.user.id)
                                        .map((recipient) =>
                                            createNotification({
                                                userId: recipient.userId,
                                                type: "meet_entry_pending",
                                                title: "Nuova iscrizione gara da validare",
                                                message: `${actorName} ha richiesto iscrizione a ${result.eventLabel} (${result.meetName}).`,
                                                link: `/community/club/${result.clubId}/coach`,
                                                referenceId: result.meetId,
                                            }),
                                        ),
                                );
                            }

                            return { success: true, entry: result.entry };
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile aggiornare iscrizione";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Event not found" || message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                            throw new TRPCError({ code: "PRECONDITION_FAILED", message });
                        }
                    }),

                staffSet: meetsProcedure
                    .input(z.object({
                        entryId: z.number(),
                        status: z.enum(ENTRY_STATUS_VALUES),
                    }))
                    .mutation(async ({ ctx, input }) => {
                        const { staffSetMeetEntryStatus } = await import("../db_club_meets");
                        try {
                            const entry = await staffSetMeetEntryStatus({
                                actorId: ctx.user.id,
                                entryId: input.entryId,
                                status: input.status,
                            });
                            return { success: true, entry };
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile forzare stato iscrizione";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Entry not found" || message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),

            results: router({
                importCsv: meetsProcedure
                    .input(z.object({
                        meetId: z.number(),
                        csvBase64: z.string().min(1),
                        sourceFilename: z.string().max(255).optional(),
                    }))
                    .mutation(async ({ ctx, input }) => {
                        const { importMeetResultsCsv, listMeetMemberRecipients } = await import("../db_club_meets");
                        const { createNotification } = await import("../db_social_enhanced");
                        try {
                            const outcome = await importMeetResultsCsv({
                                actorId: ctx.user.id,
                                meetId: input.meetId,
                                csvBase64: input.csvBase64,
                                sourceFilename: input.sourceFilename,
                            });
                            const recipients = await listMeetMemberRecipients({ meetId: input.meetId, audience: "all" });
                            await Promise.allSettled(
                                recipients.map((recipient) =>
                                    createNotification({
                                        userId: recipient.userId,
                                        type: "meet_results_imported",
                                        title: "Risultati gara aggiornati",
                                        message: "Nuovi risultati disponibili per il meeting del club.",
                                        link: `/community/club`,
                                        referenceId: input.meetId,
                                    }),
                                ),
                            );
                            return { success: true, mode: "csv" as const, outcome };
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Import CSV non riuscito";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                            throw new TRPCError({ code: "PRECONDITION_FAILED", message });
                        }
                    }),

                importPdfManual: meetsProcedure
                    .input(z.object({
                        meetId: z.number(),
                        rows: z.array(z.object({
                            meetEventId: z.number().optional(),
                            eventLabel: z.string().max(120).optional(),
                            athleteName: z.string().max(255).optional(),
                            athleteEmail: z.string().email().optional(),
                            userId: z.number().optional(),
                            clubName: z.string().max(255).optional(),
                            finalTime: z.string().max(32).optional(),
                            finalTimeCs: z.number().min(0).max(100_000_000).optional(),
                            rank: z.number().min(1).max(10_000).optional(),
                            points: z.number().min(0).max(100_000).optional(),
                            dq: z.boolean().optional(),
                            notes: z.string().max(1000).optional(),
                            seedTime: z.string().max(32).optional(),
                            seedTimeCs: z.number().min(0).max(100_000_000).optional(),
                        })).max(5000),
                    }))
                    .mutation(async ({ ctx, input }) => {
                        const { importMeetResultsPdfManual } = await import("../db_club_meets");
                        try {
                            const outcome = await importMeetResultsPdfManual({
                                actorId: ctx.user.id,
                                meetId: input.meetId,
                                rows: input.rows,
                            });
                            return { success: true, mode: "pdf_manual" as const, outcome };
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Import manuale risultati non riuscito";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                            throw new TRPCError({ code: "PRECONDITION_FAILED", message });
                        }
                    }),

                list: meetsProcedure
                    .input(z.object({ meetId: z.number() }))
                    .query(async ({ ctx, input }) => {
                        const { listMeetResults } = await import("../db_club_meets");
                        try {
                            return await listMeetResults({
                                userId: ctx.user.id,
                                meetId: input.meetId,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile leggere risultati";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),

            stats: router({
                get: meetsProcedure
                    .input(z.object({ meetId: z.number() }))
                    .query(async ({ ctx, input }) => {
                        const { getMeetStats } = await import("../db_club_meets");
                        try {
                            return await getMeetStats({
                                userId: ctx.user.id,
                                meetId: input.meetId,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile caricare statistiche meeting";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),

            communications: router({
                whatsappLink: meetsProcedure
                    .input(z.object({
                        meetId: z.number(),
                        audience: z.enum(["all", "entered", "staff"]),
                    }))
                    .query(async ({ ctx, input }) => {
                        const { buildMeetWhatsappLink } = await import("../db_club_meets");
                        try {
                            return await buildMeetWhatsappLink({
                                userId: ctx.user.id,
                                meetId: input.meetId,
                                audience: input.audience,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile generare link WhatsApp";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Meet not found") throw new TRPCError({ code: "NOT_FOUND" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),
        }),

        workouts: router({
            listPublished: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    limit: z.number().min(1).max(100).optional(),
                    offset: z.number().min(0).optional(),
                }))
                .query(async ({ ctx, input }) => {
                    const { listPublishedClubWorkouts } = await import("../db_club_workouts");
                    try {
                        const workouts = await listPublishedClubWorkouts({
                            userId: ctx.user.id,
                            clubId: input.clubId,
                            limit: input.limit,
                            offset: input.offset,
                        });
                        return { workouts };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile leggere workouts club";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            getPublished: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    workoutId: z.number(),
                    source: z.string().max(80).optional(),
                }))
                .query(async ({ ctx, input }) => {
                    const { getPublishedClubWorkoutById } = await import("../db_club_workouts");
                    try {
                        const workout = await getPublishedClubWorkoutById({
                            userId: ctx.user.id,
                            clubId: input.clubId,
                            workoutId: input.workoutId,
                        });
                        await trackProductEvent({
                            userId: ctx.user.id,
                            eventName: "club_workout_open",
                            source: input.source ?? "club_workout_detail",
                            entityType: "club_workout",
                            entityId: workout.id,
                            metadata: {
                                clubId: input.clubId,
                            },
                        });
                        return { workout };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile leggere dettaglio workout";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        if (message === "Workout not found") throw new TRPCError({ code: "NOT_FOUND" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            markCompleted: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    workoutId: z.number(),
                    completionStatus: z.enum(["completed", "partial", "skipped"]).optional(),
                }))
                .mutation(async ({ ctx, input }) => {
                    const { getPublishedClubWorkoutById } = await import("../db_club_workouts");
                    try {
                        const workout = await getPublishedClubWorkoutById({
                            userId: ctx.user.id,
                            clubId: input.clubId,
                            workoutId: input.workoutId,
                        });
                        await trackProductEvent({
                            userId: ctx.user.id,
                            eventName: "club_workout_complete",
                            source: "club_workout_detail",
                            entityType: "club_workout",
                            entityId: workout.id,
                            metadata: {
                                clubId: input.clubId,
                                status: input.completionStatus ?? "completed",
                            },
                        });
                        return { success: true, workoutId: workout.id };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile registrare completamento workout";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        if (message === "Workout not found") throw new TRPCError({ code: "NOT_FOUND" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            coach: router({
                generationStatus: protectedProcedure
                    .input(z.object({
                        clubId: z.number(),
                        sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                    }))
                    .query(async ({ ctx, input }) => {
                        await requireClubCoachUploadRole(ctx.user.id, input.clubId);
                        const { getClubWorkoutGenerationStatus } = await import("../db_club_workouts");
                        try {
                            return await getClubWorkoutGenerationStatus({
                                userId: ctx.user.id,
                                clubId: input.clubId,
                                sessionDate: input.sessionDate,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile leggere stato generazione workout";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),

                getByDate: protectedProcedure
                    .input(z.object({
                        clubId: z.number(),
                        sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                    }))
                    .query(async ({ ctx, input }) => {
                        await requireClubCoachUploadRole(ctx.user.id, input.clubId);
                        const { getClubWorkoutBySessionDate } = await import("../db_club_workouts");
                        try {
                            return await getClubWorkoutBySessionDate({
                                userId: ctx.user.id,
                                clubId: input.clubId,
                                sessionDate: input.sessionDate,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile leggere workout per data";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),

                generateDraft: protectedProcedure
                    .input(z.object({
                        clubId: z.number(),
                        sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
                        directives: CLUB_POOL_WORKOUT_DIRECTIVES_SCHEMA,
                    }))
                    .mutation(async ({ ctx, input }) => {
                        await requireClubCoachUploadRole(ctx.user.id, input.clubId);
                        const { getClubWorkoutGenerationStatus, createClubWorkoutDraftFromGeneration } = await import("../db_club_workouts");
                        const { generateClubPoolWorkoutPlan } = await import("../club_workouts_ai");

                        const status = await getClubWorkoutGenerationStatus({
                            userId: ctx.user.id,
                            clubId: input.clubId,
                            sessionDate: input.sessionDate,
                        });

                        if (!status.canGenerate && status.nextAvailableAt) {
                            const nextLabel = new Date(status.nextAvailableAt).toLocaleString("it-IT");
                            throw new TRPCError({
                                code: "PRECONDITION_FAILED",
                                message: `Cooldown attivo: nuova generazione disponibile il ${nextLabel}`,
                                cause: { nextAvailableAt: status.nextAvailableAt },
                            });
                        }

                        const generation = await generateClubPoolWorkoutPlan({
                            sessionDate: input.sessionDate,
                            directives: input.directives,
                        });

                        const saved = await createClubWorkoutDraftFromGeneration({
                            userId: ctx.user.id,
                            clubId: input.clubId,
                            sessionDate: input.sessionDate,
                            directives: input.directives,
                            workout: generation.plan,
                            runStatus: generation.status,
                            provider: generation.provider,
                            model: generation.model,
                            promptVersion: generation.promptVersion,
                            rawResponse: generation.rawResponse,
                            error: generation.error,
                        });

                        return {
                            success: true,
                            workout: saved.workout,
                            run: saved.run,
                            cooldown: saved.cooldown,
                            generation: {
                                status: generation.status,
                                provider: generation.provider,
                                model: generation.model,
                                warnings: generation.warnings ?? [],
                                quality: generation.quality ?? null,
                            },
                        };
                    }),

                publish: protectedProcedure
                    .input(z.object({
                        workoutId: z.number(),
                    }))
                    .mutation(async ({ ctx, input }) => {
                        const { publishClubWorkout, listClubWorkoutRecipients } = await import("../db_club_workouts");
                        const { createNotification } = await import("../db_social_enhanced");
                        try {
                            const { workout, changed } = await publishClubWorkout({
                                userId: ctx.user.id,
                                workoutId: input.workoutId,
                            });

                            let notifiedCount = 0;
                            let failedNotificationCount = 0;
                            if (changed) {
                                const recipients = await listClubWorkoutRecipients({
                                    userId: ctx.user.id,
                                    clubId: workout.clubId,
                                });
                                const members = recipients.filter((r) => Number(r.userId) !== Number(ctx.user.id));
                                const deliveries = await Promise.allSettled(
                                    members.map((recipient) =>
                                        createNotification({
                                            userId: recipient.userId,
                                            type: "club_workout_published",
                                            title: "Workout del giorno pubblicato",
                                            message: `Nuovo workout disponibile: ${workout.title}`,
                                            link: `/community/club/${workout.clubId}/workouts/${workout.id}`,
                                            referenceId: workout.id,
                                        }),
                                    ),
                                );

                                const failedDeliveries = deliveries.filter((item) => item.status === "rejected");
                                notifiedCount = deliveries.length - failedDeliveries.length;
                                failedNotificationCount = failedDeliveries.length;

                                if (failedDeliveries.length > 0) {
                                    logger.warn("[club_workouts] notification delivery partial failure", {
                                        event: "club_workouts:publish_notification_partial_failure",
                                        clubId: workout.clubId,
                                        workoutId: workout.id,
                                        recipientCount: members.length,
                                        successCount: notifiedCount,
                                        failedCount: failedDeliveries.length,
                                        failedReasons: failedDeliveries
                                            .slice(0, 5)
                                            .map((item) =>
                                                item.reason instanceof Error ? item.reason.message : String(item.reason),
                                            ),
                                    });
                                }
                            }

                            return {
                                success: true,
                                workout,
                                changed,
                                notifiedCount,
                                failedNotificationCount,
                            };
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile pubblicare workout";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "Workout not found") throw new TRPCError({ code: "NOT_FOUND" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),
        }),

        aiCoach: router({
            getConfig: aiCoachAutomationProcedure
                .input(z.object({ clubId: z.number() }))
                .query(async ({ ctx, input }) => {
                    await requireClubStaffRole(ctx.user.id, input.clubId);
                    const { ensureClubAiBotUser, ensureClubAiConfig, getClubAiConfig, getClubAiSummary } = await import("../db_club_ai_automation");
                    const bot = await ensureClubAiBotUser(input.clubId);
                    if (ENV.clubAiDefaultClubIds.includes(input.clubId)) {
                        const existingConfig = await getClubAiConfig({
                            userId: ctx.user.id,
                            clubId: input.clubId,
                        });
                        if (!existingConfig) {
                            await ensureClubAiConfig({
                                clubId: input.clubId,
                                enabled: true,
                                actorUserId: bot.userId,
                                timezone: ENV.clubAiTimezone,
                                scanSourceUrl: "https://www.nuotosardegna.it/category/comunicati-master/",
                                imageModel: ENV.clubAiPostImageModel || null,
                            });
                        }
                    }
                    const config = await getClubAiConfig({
                        userId: ctx.user.id,
                        clubId: input.clubId,
                    });
                    const summary = await getClubAiSummary(input.clubId);
                    return {
                        mode: config?.enabled ? "enabled" : "disabled",
                        config,
                        summary,
                        actorBot: bot,
                    };
                }),

            upsertConfig: aiCoachAutomationProcedure
                .input(z.object({
                    clubId: z.number(),
                    enabled: z.boolean(),
                    actorUserId: z.number().int().positive(),
                    imageModel: z.string().max(120).optional().nullable(),
                    motivationPrompt: z.string().max(2000).optional().nullable(),
                    scanUrl: z.string().url().optional().nullable(),
                    timezone: z.string().max(64).optional().nullable(),
                }))
                .mutation(async ({ ctx, input }) => {
                    await requireClubStaffRole(ctx.user.id, input.clubId);
                    const { upsertClubAiConfig } = await import("../db_club_ai_automation");
                    try {
                        const config = await upsertClubAiConfig({
                            actorId: ctx.user.id,
                            clubId: input.clubId,
                            enabled: input.enabled,
                            actorUserId: input.actorUserId,
                            imageModel: input.imageModel,
                            motivationPrompt: input.motivationPrompt,
                            scanUrl: input.scanUrl,
                            timezone: input.timezone,
                        });
                        return { success: true, config };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile aggiornare configurazione Coach AI";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            lastRuns: aiCoachAutomationProcedure
                .input(z.object({
                    clubId: z.number(),
                    limit: z.number().min(1).max(100).optional(),
                }))
                .query(async ({ ctx, input }) => {
                    await requireClubStaffRole(ctx.user.id, input.clubId);
                    const { listClubAiRuns } = await import("../db_club_ai_automation");
                    try {
                        const runs = await listClubAiRuns({
                            userId: ctx.user.id,
                            clubId: input.clubId,
                            limit: input.limit,
                        });
                        return { runs };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile leggere run Coach AI";
                        if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),

            manualRun: aiCoachAutomationProcedure
                .input(z.object({
                    clubId: z.number(),
                    jobType: z.enum(["scan_meets_weekly", "generate_workouts_weekly", "publish_workout_daily", "post_motivation_mwf"]),
                }))
                .mutation(async ({ ctx, input }) => {
                    await requireClubStaffRole(ctx.user.id, input.clubId);
                    const { runClubAiManualJob } = await import("../club_ai_automation");
                    try {
                        const run = await runClubAiManualJob({
                            clubId: input.clubId,
                            jobType: input.jobType,
                            requestedBy: ctx.user.id,
                        });
                        return { success: true, run };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Esecuzione manuale Coach AI non riuscita";
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
                }),
        }),

        history: router({
            config: router({
                get: historyProcedure
                    .input(z.object({ clubId: z.number() }))
                    .query(async ({ ctx, input }) => {
                        const { getClubHistoryConfig } = await import("../db_club_history");
                        try {
                            return await getClubHistoryConfig({
                                userId: ctx.user.id,
                                clubId: input.clubId,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile leggere configurazione storico";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),

                upsert: historyProcedure
                    .input(z.object({
                        clubId: z.number(),
                        provider: z.enum(["oppidum_html"]),
                        rootUrl: z.string().url(),
                        enabled: z.boolean(),
                    }))
                    .mutation(async ({ ctx, input }) => {
                        const { upsertClubHistoryConfig } = await import("../db_club_history");
                        try {
                            const source = await upsertClubHistoryConfig({
                                actorId: ctx.user.id,
                                clubId: input.clubId,
                                provider: input.provider,
                                rootUrl: input.rootUrl,
                                enabled: input.enabled,
                            });
                            return { success: true, source };
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile aggiornare configurazione storico";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),

            import: router({
                start: historyProcedure
                    .input(z.object({
                        clubId: z.number(),
                        mode: z.enum(["oppidum_index_full", "oppidum_meet_only", "oppidum_athlete_only"]),
                        url: z.string().url().optional(),
                    }))
                    .mutation(async ({ ctx, input }) => {
                        const { startClubHistoryImport } = await import("../db_club_history");
                        try {
                            return await startClubHistoryImport({
                                actorId: ctx.user.id,
                                clubId: input.clubId,
                                mode: input.mode,
                                url: input.url,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Import storico non riuscito";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "History not enabled for this club") {
                                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Storico non abilitato per questo club." });
                            }
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),

                lastRun: historyProcedure
                    .input(z.object({ clubId: z.number() }))
                    .query(async ({ ctx, input }) => {
                        const { getClubHistoryLastRun } = await import("../db_club_history");
                        try {
                            return await getClubHistoryLastRun({
                                userId: ctx.user.id,
                                clubId: input.clubId,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile leggere ultimo import storico";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "History not enabled for this club") {
                                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Storico non abilitato per questo club." });
                            }
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),

            athletes: router({
                list: historyProcedure
                    .input(z.object({
                        clubId: z.number(),
                        search: z.string().max(120).optional(),
                        season: z.number().min(2000).max(2100).optional(),
                        limit: z.number().min(1).max(100).optional(),
                        offset: z.number().min(0).optional(),
                    }))
                    .query(async ({ ctx, input }) => {
                        const { listClubHistoryAthletes } = await import("../db_club_history");
                        try {
                            return await listClubHistoryAthletes({
                                userId: ctx.user.id,
                                clubId: input.clubId,
                                search: input.search,
                                season: input.season,
                                limit: input.limit,
                                offset: input.offset,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile leggere storico atleti";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "History not enabled for this club") {
                                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Storico non abilitato per questo club." });
                            }
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),

                get: historyProcedure
                    .input(z.object({
                        clubId: z.number(),
                        athleteSlug: z.string().min(1).max(255),
                    }))
                    .query(async ({ ctx, input }) => {
                        const { getClubHistoryAthlete } = await import("../db_club_history");
                        try {
                            const result = await getClubHistoryAthlete({
                                userId: ctx.user.id,
                                clubId: input.clubId,
                                athleteSlug: input.athleteSlug,
                            });
                            if (!result) throw new TRPCError({ code: "NOT_FOUND" });
                            return result;
                        } catch (error) {
                            if (error instanceof TRPCError) throw error;
                            const message = error instanceof Error ? error.message : "Impossibile leggere dettaglio atleta";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "History not enabled for this club") {
                                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Storico non abilitato per questo club." });
                            }
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),

            meets: router({
                list: historyProcedure
                    .input(z.object({
                        clubId: z.number(),
                        season: z.number().min(2000).max(2100).optional(),
                        search: z.string().max(120).optional(),
                        limit: z.number().min(1).max(100).optional(),
                        offset: z.number().min(0).optional(),
                    }))
                    .query(async ({ ctx, input }) => {
                        const { listClubHistoryMeets } = await import("../db_club_history");
                        try {
                            return await listClubHistoryMeets({
                                userId: ctx.user.id,
                                clubId: input.clubId,
                                season: input.season,
                                search: input.search,
                                limit: input.limit,
                                offset: input.offset,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile leggere storico meeting";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "History not enabled for this club") {
                                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Storico non abilitato per questo club." });
                            }
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),

                get: historyProcedure
                    .input(z.object({
                        clubId: z.number(),
                        meetSlug: z.string().min(1).max(255),
                    }))
                    .query(async ({ ctx, input }) => {
                        const { getClubHistoryMeet } = await import("../db_club_history");
                        try {
                            const result = await getClubHistoryMeet({
                                userId: ctx.user.id,
                                clubId: input.clubId,
                                meetSlug: input.meetSlug,
                            });
                            if (!result) throw new TRPCError({ code: "NOT_FOUND" });
                            return result;
                        } catch (error) {
                            if (error instanceof TRPCError) throw error;
                            const message = error instanceof Error ? error.message : "Impossibile leggere dettaglio meeting";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "History not enabled for this club") {
                                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Storico non abilitato per questo club." });
                            }
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),

                results: historyProcedure
                    .input(z.object({
                        clubId: z.number(),
                        meetSlug: z.string().min(1).max(255),
                        searchAthlete: z.string().max(120).optional(),
                        eventLabel: z.string().max(120).optional(),
                        sort: z.enum(["time_asc", "time_desc", "points_desc", "athlete_asc"]).optional(),
                    }))
                    .query(async ({ ctx, input }) => {
                        const { listClubHistoryMeetResults } = await import("../db_club_history");
                        try {
                            return await listClubHistoryMeetResults({
                                userId: ctx.user.id,
                                clubId: input.clubId,
                                meetSlug: input.meetSlug,
                                searchAthlete: input.searchAthlete,
                                eventLabel: input.eventLabel,
                                sort: input.sort,
                            });
                        } catch (error) {
                            const message = error instanceof Error ? error.message : "Impossibile leggere risultati meeting";
                            if (message === "Forbidden") throw new TRPCError({ code: "FORBIDDEN" });
                            if (message === "History not enabled for this club") {
                                throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Storico non abilitato per questo club." });
                            }
                            throw new TRPCError({ code: "BAD_REQUEST", message });
                        }
                    }),
            }),
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

                    try {
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
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "Impossibile creare evento";
                        if (message === "Duplicate club event") {
                            throw new TRPCError({
                                code: "CONFLICT",
                                message: "Esiste già un evento identico.",
                            });
                        }
                        throw new TRPCError({ code: "BAD_REQUEST", message });
                    }
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
                    mediaType: z.enum(["image", "video", "pdf"]).optional(),
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

            generateBrandAsset: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    kind: z.enum(["logo", "cover"]),
                    prompt: z.string().max(500).optional().nullable(),
                }))
                .mutation(async ({ ctx, input }) => {
                    const { getClubById, updateClub } = await import("../db_clubs");
                    const club = await getClubById(ctx.user.id, input.clubId);
                    if (!club) {
                        throw new TRPCError({ code: "NOT_FOUND" });
                    }
                    if (Number(club.owner_id) !== ctx.user.id) {
                        throw new TRPCError({
                            code: "FORBIDDEN",
                            message: "Solo il proprietario del club può aggiornare logo/copertina.",
                        });
                    }

                    try {
                        const { generateClubBrandingAsset } = await import("../club_branding_ai");
                        const generated = await generateClubBrandingAsset({
                            clubId: input.clubId,
                            kind: input.kind,
                            clubName: String(club.name ?? ""),
                            clubTagline: club.tagline == null ? null : String(club.tagline),
                            clubDescription: club.description == null ? null : String(club.description),
                            themeColor: club.theme_color == null ? null : String(club.theme_color),
                            customPrompt: input.prompt ?? null,
                            userId: ctx.user.id,
                        });

                        await updateClub(ctx.user.id, input.clubId, input.kind === "logo"
                            ? { logoUrl: generated.url }
                            : { coverImageUrl: generated.url });

                        return {
                            success: true,
                            kind: input.kind,
                            url: generated.url,
                            model: generated.model,
                            width: generated.width,
                            height: generated.height,
                        };
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        if (message === "Forbidden") {
                            throw new TRPCError({
                                code: "FORBIDDEN",
                                message: "Solo il proprietario del club può aggiornare logo/copertina.",
                            });
                        }
                        if (
                            message.includes("OPENAI_API_KEY") ||
                            message.includes("CLUB_BRANDING_AI_ENABLED")
                        ) {
                            throw new TRPCError({
                                code: "PRECONDITION_FAILED",
                                message,
                            });
                        }
                        throw new TRPCError({
                            code: "INTERNAL_SERVER_ERROR",
                            message: `Generazione immagine fallita: ${message}`,
                        });
                    }
                }),

            upload: protectedProcedure
                .input(z.object({
                    clubId: z.number(),
                    mediaType: z.enum(["image", "video", "pdf"]),
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

            uploadPdfFile: protectedProcedure
                .input(
                    z.object({
                        clubId: z.number(),
                        caption: z.string().max(500).optional(),
                        fileName: z.string().min(1).max(180).optional(),
                        fileBase64: z
                            .string()
                            .min(1)
                            .max(22 * 1024 * 1024, "File troppo grande (max 15MB)")
                            .regex(/^[A-Za-z0-9+/=]+$/, "Invalid base64"),
                        mimeType: z.literal("application/pdf"),
                    })
                )
                .mutation(async ({ ctx, input }) => {
                    await requireClubCoachUploadRole(ctx.user.id, input.clubId);

                    const MAX_BYTES = 15 * 1024 * 1024;
                    let buffer: Buffer;
                    try {
                        buffer = Buffer.from(input.fileBase64, "base64");
                    } catch {
                        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid base64 payload" });
                    }

                    if (buffer.length > MAX_BYTES) {
                        throw new TRPCError({
                            code: "PAYLOAD_TOO_LARGE",
                            message: "File troppo grande (max 15MB)",
                        });
                    }

                    if (buffer.length < 5 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
                        throw new TRPCError({
                            code: "BAD_REQUEST",
                            message: "Il file caricato non sembra un PDF valido.",
                        });
                    }

                    const rawFileName = (input.fileName ?? "documento-club.pdf").trim();
                    const withPdfExt = rawFileName.toLowerCase().endsWith(".pdf") ? rawFileName : `${rawFileName}.pdf`;
                    const safeFileName = withPdfExt
                        .replace(/[^a-zA-Z0-9._-]/g, "_")
                        .replace(/^_+|_+$/g, "")
                        .slice(0, 140) || `documento-${Date.now()}.pdf`;

                    let publicUrl: string | null = null;
                    if (ENV.imagekitPrivateKey) {
                        const authHeader = `Basic ${Buffer.from(`${ENV.imagekitPrivateKey}:`).toString("base64")}`;
                        const formData = new FormData();
                        formData.append("file", new Blob([new Uint8Array(buffer)], { type: input.mimeType }), safeFileName);
                        formData.append("fileName", safeFileName);
                        formData.append("folder", `/clubs/${input.clubId}/${ctx.user.id}/docs`);
                        formData.append("useUniqueFileName", "true");
                        formData.append("tags", `club,club-${input.clubId},pdf,swimforge`);

                        const res = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
                            method: "POST",
                            headers: {
                                Authorization: authHeader,
                            },
                            body: formData,
                        });

                        if (!res.ok) {
                            let detail = "";
                            try {
                                const payload = (await res.json()) as { message?: string; help?: string };
                                detail = payload.message || payload.help || "";
                            } catch {
                                detail = await res.text().catch(() => "");
                            }
                            throw new TRPCError({
                                code: "INTERNAL_SERVER_ERROR",
                                message: `Upload PDF failed: ${detail || `${res.status} ${res.statusText}`}`,
                            });
                        }

                        const payload = (await res.json()) as { url?: string };
                        if (!payload.url) {
                            throw new TRPCError({
                                code: "INTERNAL_SERVER_ERROR",
                                message: "Upload PDF failed: URL non restituito da ImageKit.",
                            });
                        }
                        publicUrl = payload.url;
                    } else {
                        const { getSupabaseAdminClient } = await import("../_core/supabase_admin");
                        const admin = getSupabaseAdminClient();
                        const filePath = `clubs/${input.clubId}/${ctx.user.id}/docs/${Date.now()}-${safeFileName}`;
                        const { error } = await admin.storage
                            .from("profile-media")
                            .upload(filePath, buffer, {
                                contentType: input.mimeType,
                                upsert: true,
                            });
                        if (error) {
                            throw new TRPCError({
                                code: "INTERNAL_SERVER_ERROR",
                                message: `Upload failed: ${error.message}`,
                            });
                        }
                        const { data } = admin.storage.from("profile-media").getPublicUrl(filePath);
                        publicUrl = data.publicUrl;
                    }

                    const { uploadClubMedia } = await import("../db_social_enhanced");
                    const media = await uploadClubMedia({
                        clubId: input.clubId,
                        uploaderId: ctx.user.id,
                        mediaType: "pdf",
                        mediaUrl: publicUrl,
                        caption: input.caption?.trim() || safeFileName,
                    });

                    logger.info("club media uploadPdfFile: success", {
                        event: "club_media:upload_pdf_success",
                        userId: ctx.user.id,
                        clubId: input.clubId,
                        mediaId: media.id,
                    });

                    return { success: true, media, url: publicUrl };
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

                    let publicUrl = "";
                    try {
                        const uploaded = await uploadImageToMediaProviders({
                            buffer,
                            mimeType: detected.mimeType,
                            folder: `clubs/${input.clubId}/${ctx.user.id}`,
                            fileNamePrefix: "club-media",
                            tags: ["club", `club-${input.clubId}`, `user-${ctx.user.id}`],
                        });
                        publicUrl = uploaded.url;
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        throw new TRPCError({
                            code: "INTERNAL_SERVER_ERROR",
                            message: `Upload failed: ${message}`,
                        });
                    }

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
