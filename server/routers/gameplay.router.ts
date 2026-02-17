import {
    protectedProcedure, publicProcedure, router, z, db,
    TRPCError,
    getOrSetCached, cacheKeys, CACHE_TTL,
    invalidateUserCache, invalidateLeaderboardCache,
    getCurrentSeasonState, getSeasonLeaderboard, getMySeasonRank,
    getSeasonEngagementSnapshot, getActionXpStatus,
    claimSeasonReward,
    listSeasonActivityPredictions,
    createSeasonActivityPrediction,
    evaluateSeasonPredictionWithActivity,
    getCurrentClubQuestStates,
    claimCurrentClubQuestReward,
    runAutoSync,
    garmin, strava,
} from "./_shared";
import { hasGrantedConsent } from "../consent";

async function assertHealthAndProviderConsent(userId: number, provider: "garmin_sync" | "strava_sync") {
    const [healthAllowed, providerAllowed] = await Promise.all([
        hasGrantedConsent(userId, "health_data_processing"),
        hasGrantedConsent(userId, provider),
    ]);

    if (!healthAllowed) {
        throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Per usare la sincronizzazione devi accettare il consenso per il trattamento dati salute in Impostazioni > Privacy.",
        });
    }
    if (!providerAllowed) {
        throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Devi autorizzare il consenso ${provider === "garmin_sync" ? "Garmin" : "Strava"} in Impostazioni > Privacy.`,
        });
    }
}

// Auto sync Garmin + Strava (login/app open)
export const syncRouter = router({
    auto: protectedProcedure
        .input(z.object({ force: z.boolean().optional() }).optional())
        .mutation(async ({ ctx, input }) => {
            await runAutoSync(ctx.user.id, { force: input?.force });
            return { success: true } as const;
        }),
});

// Leaderboard
export const leaderboardRouter = router({
    get: protectedProcedure
        .input(z.object({
            orderBy: z.enum(["level", "totalXp", "badges"]).default("totalXp"),
            period: z.enum(["all", "week", "month"]).default("all"),
            limit: z.number().min(1).max(100).default(50),
        }))
        .query(async ({ input }) => {
            return await getOrSetCached(
                cacheKeys.leaderboard(input.orderBy, input.period, input.limit, 0),
                () => db.getLeaderboard(input.orderBy, input.limit, input.period),
                CACHE_TTL.LEADERBOARD
            );
        }),
});

// Season (Battle Pass + Missions)
export const seasonRouter = router({
    getCurrent: protectedProcedure.query(async ({ ctx }) => {
        return getCurrentSeasonState(ctx.user.id);
    }),
    getEngagement: protectedProcedure.query(async ({ ctx }) => {
        return getSeasonEngagementSnapshot(ctx.user.id);
    }),
    actionXpStatus: protectedProcedure.query(async ({ ctx }) => {
        return getActionXpStatus(ctx.user.id);
    }),
    getLeaderboard: protectedProcedure
        .input(
            z
                .object({
                    limit: z.number().min(1).max(100).optional(),
                })
                .optional()
        )
        .query(async ({ input }) => {
            return getSeasonLeaderboard(input?.limit ?? 20);
        }),
    getMyRank: protectedProcedure.query(async ({ ctx }) => {
        return getMySeasonRank(ctx.user.id);
    }),
    claimReward: protectedProcedure
        .input(
            z.object({
                rewardCode: z.string().min(3).max(120),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const result = await claimSeasonReward(ctx.user.id, input.rewardCode);
            if (!result.success) {
                if (result.reason === "locked") {
                    throw new TRPCError({
                        code: "PRECONDITION_FAILED",
                        message: "Ricompensa non ancora sbloccata.",
                    });
                }
                if (result.reason === "not_found") {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Ricompensa non trovata.",
                    });
                }
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Impossibile riscattare la ricompensa.",
                });
            }
            await invalidateUserCache(String(ctx.user.id));
            await invalidateLeaderboardCache();
            return result;
        }),
    predictions: router({
        list: protectedProcedure
            .input(
                z
                    .object({
                        limit: z.number().min(1).max(30).optional(),
                    })
                    .optional(),
            )
            .query(async ({ ctx, input }) => {
                return listSeasonActivityPredictions(ctx.user.id, input?.limit ?? 12);
            }),
        create: protectedProcedure
            .input(
                z.object({
                    targetDistanceMeters: z.number().min(100).max(50000).optional().nullable(),
                    targetPacePer100m: z.number().min(50).max(600).optional().nullable(),
                    targetDurationSeconds: z.number().min(300).max(21600).optional().nullable(),
                    targetRpe: z.number().min(1).max(10).optional().nullable(),
                    note: z.string().max(500).optional().nullable(),
                }),
            )
            .mutation(async ({ ctx, input }) => {
                const created = await createSeasonActivityPrediction({
                    userId: ctx.user.id,
                    targetDistanceMeters: input.targetDistanceMeters ?? null,
                    targetPacePer100m: input.targetPacePer100m ?? null,
                    targetDurationSeconds: input.targetDurationSeconds ?? null,
                    targetRpe: input.targetRpe ?? null,
                    note: input.note ?? null,
                });
                await invalidateUserCache(String(ctx.user.id));
                return { success: true, prediction: created };
            }),
        evaluateLatest: protectedProcedure
            .input(
                z
                    .object({
                        activityId: z.number().optional(),
                    })
                    .optional(),
            )
            .mutation(async ({ ctx, input }) => {
                const result = await evaluateSeasonPredictionWithActivity({
                    userId: ctx.user.id,
                    activityId: input?.activityId,
                });
                if (result.status === "evaluated" && result.xpAwarded > 0) {
                    await invalidateUserCache(String(ctx.user.id));
                    await invalidateLeaderboardCache();
                }
                return result;
            }),
    }),
    clubQuest: router({
        getCurrent: protectedProcedure.query(async ({ ctx }) => {
            return getCurrentClubQuestStates(ctx.user.id);
        }),
        claim: protectedProcedure
            .input(
                z.object({
                    clubId: z.number(),
                }),
            )
            .mutation(async ({ ctx, input }) => {
                const result = await claimCurrentClubQuestReward({
                    userId: ctx.user.id,
                    clubId: input.clubId,
                });
                if (result.success && result.xpAwarded > 0) {
                    await invalidateUserCache(String(ctx.user.id));
                    await invalidateLeaderboardCache();
                }
                return result;
            }),
    }),
});

// Video / Remotion data payloads
export const videoRouter = router({
    seasonRecap: protectedProcedure
        .input(
            z
                .object({
                    activityLimit: z.number().min(1).max(6).optional(),
                    leaderboardLimit: z.number().min(3).max(50).optional(),
                })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            const activityLimit = input?.activityLimit ?? 3;
            const leaderboardLimit = input?.leaderboardLimit ?? 20;

            const [seasonState, seasonLeaderboard, activities, profile] = await Promise.all([
                getCurrentSeasonState(ctx.user.id),
                getSeasonLeaderboard(leaderboardLimit),
                db.getActivities(ctx.user.id, activityLimit, 0, { source: "all" }),
                db.getSwimmerProfile(ctx.user.id),
            ]);

            const topThree = seasonLeaderboard.slice(0, 3).map((entry) => ({
                rank: Number(entry.rank ?? 0),
                name: String(entry.name ?? "Nuotatore"),
                seasonXp: Number(entry.seasonXp ?? 0),
                userId: Number(entry.userId ?? 0),
            }));

            const meRow =
                seasonLeaderboard.find((entry) => Number(entry.userId) === Number(ctx.user.id)) ?? null;

            const highlights = activities.map((activity) => ({
                id: Number(activity.id),
                name: String(activity.activityName ?? "Swim Session"),
                distanceMeters: Number(activity.distanceMeters ?? 0),
                durationSeconds: Number(activity.durationSeconds ?? 0),
                pacePer100m:
                    Number(activity.avgPacePer100m ?? 0) > 0
                        ? Number(activity.avgPacePer100m)
                        : Number(activity.distanceMeters ?? 0) > 0 && Number(activity.durationSeconds ?? 0) > 0
                            ? Number(activity.durationSeconds) / (Number(activity.distanceMeters) / 100)
                            : 0,
                xpEarned: Number(activity.xpEarned ?? 0),
                activityDate: activity.activityDate ? new Date(activity.activityDate).toISOString() : null,
                isOpenWater: Boolean(activity.isOpenWater),
            }));

            return {
                generatedAt: new Date().toISOString(),
                user: {
                    id: ctx.user.id,
                    displayName:
                        profile?.username || ctx.user.name || ctx.user.email?.split("@")[0] || "Nuotatore",
                    avatarUrl: profile?.avatarUrl ?? null,
                },
                season: {
                    id: seasonState.season.id,
                    name: seasonState.season.name,
                    number: seasonState.season.seasonNumber,
                    remainingDays: seasonState.season.remainingDays,
                    level: seasonState.progress.currentLevel,
                    seasonXp: seasonState.progress.seasonXp,
                    levelProgressPercent: seasonState.progress.levelProgressPercent,
                    xpToNextLevel: seasonState.progress.xpToNextLevel,
                },
                missions: {
                    completed: seasonState.missions.completedMissions,
                    total: seasonState.missions.totalMissions,
                    completionRate: seasonState.missions.completionRate,
                    dailyPreview: seasonState.missions.daily.slice(0, 3).map((mission) => ({
                        id: mission.id,
                        title: mission.title,
                        progress: mission.progress,
                        xpReward: mission.xpReward,
                        completed: mission.completed,
                    })),
                    weeklyPreview: seasonState.missions.weekly.slice(0, 2).map((mission) => ({
                        id: mission.id,
                        title: mission.title,
                        progress: mission.progress,
                        xpReward: mission.xpReward,
                        completed: mission.completed,
                    })),
                },
                leaderboard: {
                    topThree,
                    me:
                        meRow === null
                            ? null
                            : {
                                rank: Number(meRow.rank ?? 0),
                                seasonXp: Number(meRow.seasonXp ?? 0),
                            },
                },
                highlights,
            };
        }),
});

// Personal Records
export const recordsRouter = router({
    list: protectedProcedure.query(async ({ ctx }) => {
        return await db.getPersonalRecords(ctx.user.id);
    }),
});

// XP History
export const xpRouter = router({
    history: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
        .query(async ({ ctx, input }) => {
            return await db.getXpTransactions(ctx.user.id, input.limit);
        }),
});

// Level Thresholds (public for display)
export const levelsRouter = router({
    all: publicProcedure.query(async () => {
        return await getOrSetCached(
            "level:thresholds",
            () => db.getAllLevelThresholds(),
            CACHE_TTL.BADGES
        );
    }),
});

// Garmin Integration
export const garminRouter = router({
    status: protectedProcedure.query(async ({ ctx }) => {
        return await garmin.getGarminStatus(ctx.user.id);
    }),

    connect: protectedProcedure
        .input(z.object({
            email: z.string().email(),
            password: z.string().min(1),
        }))
        .mutation(async ({ ctx, input }) => {
            await assertHealthAndProviderConsent(ctx.user.id, "garmin_sync");
            return await garmin.connectGarmin(ctx.user.id, input.email, input.password);
        }),

    // Complete MFA authentication with code from email
    completeMfa: protectedProcedure
        .input(z.object({
            mfaCode: z.string().min(1),
            email: z.string().email(),
        }))
        .mutation(async ({ ctx, input }) => {
            return await garmin.completeMfa(ctx.user.id, input.mfaCode, input.email);
        }),

    // Check MFA status
    mfaStatus: protectedProcedure.query(async ({ ctx }) => {
        return await garmin.getMfaStatus(ctx.user.id);
    }),

    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
        const success = await garmin.disconnectGarmin(ctx.user.id);
        return { success };
    }),

    sync: protectedProcedure
        .input(z.object({ daysBack: z.number().min(1).max(365).default(30) }))
        .mutation(async ({ ctx, input }) => {
            await assertHealthAndProviderConsent(ctx.user.id, "garmin_sync");
            return await garmin.syncGarminActivities(ctx.user.id, input.daysBack);
        }),

    migrateHrZones: protectedProcedure.mutation(async ({ ctx }) => {
        return await garmin.migrateHrZones(ctx.user.id);
    }),
});

// Strava Integration
export const stravaRouter = router({
    status: protectedProcedure.query(async ({ ctx }) => {
        return await strava.getStravaStatus(ctx.user.id);
    }),

    getAuthorizeUrl: protectedProcedure.mutation(async ({ ctx }) => {
        const authorizeUrl = await strava.getStravaAuthorizeUrl(ctx.user.id);
        return { authorizeUrl };
    }),

    exchangeToken: protectedProcedure
        .input(z.object({ code: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await assertHealthAndProviderConsent(ctx.user.id, "strava_sync");
            return await strava.exchangeStravaToken(ctx.user.id, input.code);
        }),

    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
        return await strava.disconnectStrava(ctx.user.id);
    }),

    sync: protectedProcedure
        .input(z.object({ daysBack: z.number().min(1).max(365).default(7) }))
        .mutation(async ({ ctx, input }) => {
            await assertHealthAndProviderConsent(ctx.user.id, "strava_sync");
            return await strava.syncStravaActivities(ctx.user.id, input.daysBack);
        }),
});
