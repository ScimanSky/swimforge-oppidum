import {
    protectedProcedure, publicProcedure, router, z, db, getDb, sql,
    TRPCError,
    getOrSetCached, cacheKeys, CACHE_TTL,
    invalidateUserCache, invalidateLeaderboardCache,
    getCurrentSeasonState, getSeasonLeaderboard, getMySeasonRank,
    getSeasonEngagementSnapshot, getActionXpStatus, resolveSeasonWeeklyFocus,
    claimSeasonReward,
    listSeasonActivityPredictions,
    createSeasonActivityPrediction,
    evaluateSeasonPredictionWithActivity,
    getCurrentClubQuestStates,
    claimCurrentClubQuestReward,
    runAutoSync,
    getUserPublicProfile,
    garmin, strava,
} from "./_shared";
import { hasGrantedConsent } from "../consent";
import { calculateFinaPoints, isSupportedFinaEvent } from "../lib/fina_points";

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

const RECORD_STROKES = ["freestyle", "backstroke", "breaststroke", "butterfly", "mixed"] as const;
const RECORD_SOURCES = ["official", "training"] as const;
const SEASON_WEEKLY_ACTION_TYPES = [
    "daily",
    "action_xp",
    "prediction",
    "weekly",
    "explore",
    "club_contribution",
    "soft_comparison",
] as const;
const SEASON_WEEKLY_ACTION_SOURCES = ["legacy_today", "season_v2_focus", "season_v2_club", "season_v2_comparison"] as const;

function buildRecordType(distanceMeters: number, poolLengthMeters: 25 | 50, source: "official" | "training") {
    const sourceCode = source === "official" ? "o" : "t";
    return `pb_${distanceMeters}_${poolLengthMeters}_${sourceCode}`;
}

function parseRecordType(recordType: string): {
    distanceMeters: number;
    poolLengthMeters: 25 | 50;
    source: "official" | "training";
} | null {
    const match = /^pb_(\d+)_(25|50)_([ot])$/.exec(String(recordType).trim().toLowerCase());
    if (!match) return null;
    const distanceMeters = Number(match[1]);
    const poolLengthMeters = Number(match[2]);
    const sourceCode = match[3];
    if (!Number.isFinite(distanceMeters) || ![25, 50].includes(poolLengthMeters)) return null;
    return {
        distanceMeters,
        poolLengthMeters: poolLengthMeters as 25 | 50,
        source: sourceCode === "o" ? "official" : "training",
    };
}

function startOfUtcWeek(date: Date): Date {
    const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const day = weekStart.getUTCDay(); // 0 Sunday
    const diffFromMonday = (day + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - diffFromMonday);
    return weekStart;
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
    getWeeklyFocus: protectedProcedure
        .input(
            z
                .object({
                    includePredictions: z.boolean().optional(),
                })
                .optional(),
        )
        .query(async ({ ctx, input }) => {
            const [seasonState, engagement] = await Promise.all([
                getCurrentSeasonState(ctx.user.id),
                getSeasonEngagementSnapshot(ctx.user.id),
            ]);
            const pendingPredictions = engagement.predictions.filter((prediction) => prediction.status === "pending").length;
            return resolveSeasonWeeklyFocus({
                dailyMissions: seasonState.missions.daily.map((mission) => ({
                    title: mission.title,
                    xpReward: Number(mission.xpReward ?? 0),
                    completed: Boolean(mission.completed),
                })),
                weeklyMissions: seasonState.missions.weekly.map((mission) => ({
                    title: mission.title,
                    xpReward: Number(mission.xpReward ?? 0),
                    completed: Boolean(mission.completed),
                })),
                actionXpRemaining: Number(engagement.actionXp.remaining ?? 0),
                pendingPredictions,
                predictionsEnabled: input?.includePredictions ?? true,
            });
        }),
    markWeeklyAction: protectedProcedure
        .input(
            z.object({
                actionType: z.enum(SEASON_WEEKLY_ACTION_TYPES),
                sourceCard: z.enum(SEASON_WEEKLY_ACTION_SOURCES).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { trackProductEvent } = await import("../product_analytics");
            const now = new Date();
            const weekStart = startOfUtcWeek(now).toISOString().slice(0, 10);
            const dayKey = now.toISOString().slice(0, 10);
            await trackProductEvent({
                userId: ctx.user.id,
                eventName: "season_weekly_action_marked",
                source: "season_page",
                metadata: {
                    actionType: input.actionType,
                    sourceCard: input.sourceCard ?? null,
                    weekStart,
                    dayKey,
                },
            });
            return {
                success: true as const,
                actionType: input.actionType,
                sourceCard: input.sourceCard ?? null,
                weekStart,
                dayKey,
            };
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
    setManual: protectedProcedure
        .input(z.object({
            strokeType: z.enum(RECORD_STROKES),
            distanceMeters: z.number().int().min(25).max(5000),
            poolLengthMeters: z.union([z.literal(25), z.literal(50)]),
            timeCs: z.number().int().min(500).max(3_600_000),
            source: z.enum(RECORD_SOURCES).default("official"),
            achievedAt: z.string().datetime().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            if (!isSupportedFinaEvent(input.strokeType, input.distanceMeters)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Combinazione stile/distanza non supportata.",
                });
            }
            const recordType = buildRecordType(input.distanceMeters, input.poolLengthMeters, input.source);
            const achievedAt = input.achievedAt ? new Date(input.achievedAt) : undefined;
            const recordId = await db.upsertPersonalRecord({
                userId: ctx.user.id,
                recordType,
                value: input.timeCs,
                strokeType: input.strokeType,
                activityId: null,
                achievedAt,
            });
            return {
                success: Boolean(recordId),
                recordId,
                recordType,
            };
        }),
    getByUser: protectedProcedure
        .input(z.object({
            userId: z.number().int().positive(),
            finaGender: z.enum(["male", "female"]).optional(),
        }))
        .query(async ({ ctx, input }) => {
            const isSelf = ctx.user.id === input.userId;
            if (!isSelf) {
                const profile = await getUserPublicProfile({
                    viewerUserId: ctx.user.id,
                    targetUserId: input.userId,
                });
                if (!profile) {
                    throw new TRPCError({ code: "NOT_FOUND", message: "Utente non trovato." });
                }
                if (!profile.profilePublic) {
                    throw new TRPCError({ code: "FORBIDDEN", message: "Questo profilo non è pubblico." });
                }
            }

            const rows = await db.getPersonalRecords(input.userId);
            const parsed = rows
                .map((row) => {
                    const descriptor = parseRecordType(String(row.recordType ?? ""));
                    if (!descriptor) return null;
                    const strokeType = (row.strokeType ?? "mixed") as (typeof RECORD_STROKES)[number];
                    const timeCs = Number(row.value);
                    const finaPoints =
                        input.finaGender && isSupportedFinaEvent(strokeType, descriptor.distanceMeters)
                            ? calculateFinaPoints({
                                  strokeType,
                                  distanceMeters: descriptor.distanceMeters,
                                  timeCs,
                                  gender: input.finaGender,
                                  poolLengthMeters: descriptor.poolLengthMeters,
                              })
                            : null;
                    return {
                        id: row.id,
                        userId: row.userId,
                        strokeType,
                        distanceMeters: descriptor.distanceMeters,
                        poolLengthMeters: descriptor.poolLengthMeters,
                        source: descriptor.source,
                        timeCs,
                        previousTimeCs: row.previousValue ? Number(row.previousValue) : null,
                        achievedAt: row.achievedAt,
                        activityId: row.activityId ?? null,
                        finaPoints,
                    };
                })
                .filter((value): value is NonNullable<typeof value> => Boolean(value))
                .sort((a, b) => {
                    if (a.strokeType !== b.strokeType) return String(a.strokeType).localeCompare(String(b.strokeType));
                    if (a.distanceMeters !== b.distanceMeters) return a.distanceMeters - b.distanceMeters;
                    if (a.poolLengthMeters !== b.poolLengthMeters) return a.poolLengthMeters - b.poolLengthMeters;
                    if (a.source !== b.source) return a.source.localeCompare(b.source);
                    return a.timeCs - b.timeCs;
                });

            return {
                userId: input.userId,
                records: parsed,
            };
        }),
    clubLeaderboard: protectedProcedure
        .input(z.object({
            clubId: z.number().int().positive(),
            strokeType: z.enum(RECORD_STROKES),
            distanceMeters: z.number().int().min(25).max(5000),
            poolLengthMeters: z.union([z.literal(25), z.literal(50)]),
            source: z.enum(RECORD_SOURCES).default("official"),
            masterCategory: z.string().min(1).max(32).optional(),
            limit: z.number().int().min(1).max(200).optional(),
        }))
        .query(async ({ ctx, input }) => {
            const { getClubById } = await import("../db_clubs");
            const club = await getClubById(ctx.user.id, input.clubId);
            if (!club) throw new TRPCError({ code: "NOT_FOUND", message: "Club non trovato." });
            if (!club.is_member) {
                throw new TRPCError({ code: "FORBIDDEN", message: "Devi essere membro del club." });
            }

            const dbClient = await getDb();
            if (!dbClient) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database non disponibile." });
            const recordType = buildRecordType(input.distanceMeters, input.poolLengthMeters, input.source);
            const limit = input.limit ?? 50;
            const masterCategoryFilter = input.masterCategory?.trim()
                ? sql`AND sp.master_category = ${input.masterCategory.trim()}`
                : sql``;

            const result = await dbClient.execute(sql`
                SELECT
                    pr.user_id,
                    pr.value AS time_cs,
                    pr.achieved_at,
                    u.name,
                    sp.username,
                    sp.avatar_url,
                    sp.master_category
                FROM personal_records pr
                INNER JOIN community_club_members ccm
                    ON ccm.user_id = pr.user_id
                    AND ccm.club_id = ${input.clubId}
                    AND ccm.status = 'active'
                INNER JOIN users u ON u.id = pr.user_id
                LEFT JOIN swimmer_profiles sp ON sp.user_id = pr.user_id
                WHERE pr.record_type = ${recordType}
                  AND pr.stroke_type = ${input.strokeType}
                  ${masterCategoryFilter}
                ORDER BY pr.value ASC, pr.achieved_at ASC
                LIMIT ${limit}
            `);

            let rows = (result.rows ?? []) as Array<{
                user_id: number;
                time_cs: number;
                achieved_at: string | Date;
                name: string | null;
                username: string | null;
                avatar_url: string | null;
                master_category: string | null;
            }>;

            if (rows.length === 0 && input.source === "training") {
                const fallbackResult = await dbClient.execute(sql`
                    WITH members AS (
                        SELECT m.user_id
                        FROM community_club_members m
                        LEFT JOIN swimmer_profiles sp ON sp.user_id = m.user_id
                        WHERE m.club_id = ${input.clubId}
                          AND m.status = 'active'
                          ${masterCategoryFilter}
                    ),
                    candidates AS (
                        SELECT
                            a.user_id,
                            CASE
                                WHEN lower(coalesce(l.stroke_type, '')) LIKE '%free%'
                                  OR lower(coalesce(l.stroke_type, '')) LIKE '%stile%'
                                  OR lower(coalesce(l.stroke_type, '')) LIKE '%crawl%' THEN 'freestyle'
                                WHEN lower(coalesce(l.stroke_type, '')) LIKE '%back%'
                                  OR lower(coalesce(l.stroke_type, '')) LIKE '%dorso%' THEN 'backstroke'
                                WHEN lower(coalesce(l.stroke_type, '')) LIKE '%breast%'
                                  OR lower(coalesce(l.stroke_type, '')) LIKE '%rana%' THEN 'breaststroke'
                                WHEN lower(coalesce(l.stroke_type, '')) LIKE '%butter%'
                                  OR lower(coalesce(l.stroke_type, '')) LIKE '%farf%' THEN 'butterfly'
                                WHEN lower(coalesce(l.stroke_type, '')) LIKE '%mix%' THEN 'mixed'
                                ELSE 'mixed'
                            END AS stroke_type,
                            round(l.distance_meters)::int AS distance_meters,
                            round(l.duration_seconds * 100)::int AS time_cs,
                            a.activity_date AS achieved_at,
                            CASE
                                WHEN round(coalesce(a.pool_length_meters, 25))::int = 50 THEN 50
                                ELSE 25
                            END AS pool_length_meters
                        FROM members m
                        INNER JOIN swimming_activities a ON a.user_id = m.user_id
                        INNER JOIN garmin_activity_laps l ON l.activity_id = a.id
                        WHERE coalesce(a.is_open_water, false) = false
                          AND l.distance_meters IS NOT NULL
                          AND l.duration_seconds IS NOT NULL
                          AND l.distance_meters > 0
                          AND l.duration_seconds > 0
                        UNION ALL
                        SELECT
                            a.user_id,
                            CASE
                                WHEN lower(coalesce(a.stroke_type::text, '')) LIKE '%free%'
                                  OR lower(coalesce(a.stroke_type::text, '')) LIKE '%stile%'
                                  OR lower(coalesce(a.stroke_type::text, '')) LIKE '%crawl%' THEN 'freestyle'
                                WHEN lower(coalesce(a.stroke_type::text, '')) LIKE '%back%'
                                  OR lower(coalesce(a.stroke_type::text, '')) LIKE '%dorso%' THEN 'backstroke'
                                WHEN lower(coalesce(a.stroke_type::text, '')) LIKE '%breast%'
                                  OR lower(coalesce(a.stroke_type::text, '')) LIKE '%rana%' THEN 'breaststroke'
                                WHEN lower(coalesce(a.stroke_type::text, '')) LIKE '%butter%'
                                  OR lower(coalesce(a.stroke_type::text, '')) LIKE '%farf%' THEN 'butterfly'
                                WHEN lower(coalesce(a.stroke_type::text, '')) LIKE '%mix%' THEN 'mixed'
                                ELSE 'mixed'
                            END AS stroke_type,
                            round(a.distance_meters)::int AS distance_meters,
                            round(a.duration_seconds * 100)::int AS time_cs,
                            a.activity_date AS achieved_at,
                            CASE
                                WHEN round(coalesce(a.pool_length_meters, 25))::int = 50 THEN 50
                                ELSE 25
                            END AS pool_length_meters
                        FROM members m
                        INNER JOIN swimming_activities a ON a.user_id = m.user_id
                        WHERE coalesce(a.is_open_water, false) = false
                          AND a.distance_meters IS NOT NULL
                          AND a.duration_seconds IS NOT NULL
                          AND a.distance_meters > 0
                          AND a.duration_seconds > 0
                    ),
                    filtered AS (
                        SELECT
                            c.user_id,
                            c.time_cs,
                            c.achieved_at
                        FROM candidates c
                        WHERE c.stroke_type = ${input.strokeType}
                          AND c.distance_meters = ${input.distanceMeters}
                          AND c.pool_length_meters = ${input.poolLengthMeters}
                    ),
                    best AS (
                        SELECT
                            f.user_id,
                            min(f.time_cs)::int AS best_time_cs
                        FROM filtered f
                        GROUP BY f.user_id
                    )
                    SELECT
                        b.user_id,
                        b.best_time_cs AS time_cs,
                        min(f.achieved_at) AS achieved_at,
                        u.name,
                        sp.username,
                        sp.avatar_url,
                        sp.master_category
                    FROM best b
                    INNER JOIN filtered f
                        ON f.user_id = b.user_id
                        AND f.time_cs = b.best_time_cs
                    INNER JOIN users u ON u.id = b.user_id
                    LEFT JOIN swimmer_profiles sp ON sp.user_id = b.user_id
                    GROUP BY b.user_id, b.best_time_cs, u.name, sp.username, sp.avatar_url, sp.master_category
                    ORDER BY b.best_time_cs ASC, min(f.achieved_at) ASC
                    LIMIT ${limit}
                `);

                rows = (fallbackResult.rows ?? []) as Array<{
                    user_id: number;
                    time_cs: number;
                    achieved_at: string | Date;
                    name: string | null;
                    username: string | null;
                    avatar_url: string | null;
                    master_category: string | null;
                }>;
            }

            return {
                clubId: input.clubId,
                strokeType: input.strokeType,
                distanceMeters: input.distanceMeters,
                poolLengthMeters: input.poolLengthMeters,
                source: input.source,
                leaderboard: rows.map((row, index) => ({
                    rank: index + 1,
                    userId: Number(row.user_id),
                    displayName: row.name ?? row.username ?? `User ${row.user_id}`,
                    username: row.username,
                    avatarUrl: row.avatar_url,
                    masterCategory: row.master_category,
                    timeCs: Number(row.time_cs),
                    achievedAt: row.achieved_at,
                })),
            };
        }),
    pendingCelebrations: protectedProcedure
        .input(
            z
                .object({
                    limit: z.number().int().min(1).max(20).optional(),
                })
                .optional()
        )
        .query(async ({ ctx, input }) => {
            const dbClient = await getDb();
            if (!dbClient) return { events: [] as any[] };

            try {
                const limit = input?.limit ?? 5;
                const result = await dbClient.execute(sql`
                    SELECT id, created_at, metadata
                    FROM product_engagement_events
                    WHERE user_id = ${ctx.user.id}
                      AND event_name = 'pb_detected'
                      AND source = 'garmin_sync'
                    ORDER BY id DESC
                    LIMIT ${limit}
                `);

                const toNumberOrNull = (value: unknown): number | null => {
                    const num = Number(value);
                    return Number.isFinite(num) ? num : null;
                };

                const rows = (result.rows ?? []) as Array<{
                    id: number | string;
                    created_at: string | Date;
                    metadata: unknown;
                }>;

                const events = rows
                    .map((row) => {
                        const metadata =
                            row.metadata && typeof row.metadata === "object"
                                ? (row.metadata as Record<string, unknown>)
                                : {};
                        const parsed = parseRecordType(String(metadata.recordType ?? ""));
                        const strokeTypeRaw = String(metadata.strokeType ?? "mixed").toLowerCase();
                        const strokeType = RECORD_STROKES.includes(strokeTypeRaw as (typeof RECORD_STROKES)[number])
                            ? (strokeTypeRaw as (typeof RECORD_STROKES)[number])
                            : "mixed";
                        const distanceMeters = toNumberOrNull(metadata.distanceMeters) ?? parsed?.distanceMeters ?? null;
                        const poolLengthMeters = toNumberOrNull(metadata.poolLengthMeters) ?? parsed?.poolLengthMeters ?? null;
                        const newTimeCs = toNumberOrNull(metadata.currentValue);
                        const previousTimeCs = toNumberOrNull(metadata.previousValue);
                        const improvementCs = toNumberOrNull(metadata.improvementCs);

                        if (!distanceMeters || !poolLengthMeters || !newTimeCs) return null;

                        return {
                            id: Number(row.id),
                            createdAt: row.created_at,
                            strokeType,
                            distanceMeters,
                            poolLengthMeters,
                            source: parsed?.source ?? "training",
                            newTimeCs,
                            previousTimeCs,
                            improvementCs: improvementCs ?? (previousTimeCs ? previousTimeCs - newTimeCs : null),
                        };
                    })
                    .filter((event): event is NonNullable<typeof event> => Boolean(event));

                return { events };
            } catch {
                return { events: [] as any[] };
            }
        }),
    trackCelebrationAction: protectedProcedure
        .input(
            z.object({
                action: z.enum(["open", "share_click", "share_success"]),
                celebrationEventId: z.number().int().positive().optional(),
                strokeType: z.enum(RECORD_STROKES).optional(),
                distanceMeters: z.number().int().min(25).max(5000).optional(),
                poolLengthMeters: z.union([z.literal(25), z.literal(50)]).optional(),
                source: z.enum(RECORD_SOURCES).optional(),
                newTimeCs: z.number().int().min(1).optional(),
                previousTimeCs: z.number().int().min(1).optional().nullable(),
                improvementCs: z.number().int().min(1).optional().nullable(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { trackProductEvent } = await import("../product_analytics");
            const eventName =
                input.action === "open"
                    ? "pb_celebration_open"
                    : input.action === "share_click"
                      ? "pb_share_click"
                      : "pb_share_success";

            await trackProductEvent({
                userId: ctx.user.id,
                eventName,
                source: "pb_celebration",
                entityType: "personal_record",
                entityId: input.celebrationEventId ?? null,
                metadata: {
                    strokeType: input.strokeType ?? null,
                    distanceMeters: input.distanceMeters ?? null,
                    poolLengthMeters: input.poolLengthMeters ?? null,
                    source: input.source ?? null,
                    newTimeCs: input.newTimeCs ?? null,
                    previousTimeCs: input.previousTimeCs ?? null,
                    improvementCs: input.improvementCs ?? null,
                },
            });

            return { success: true } as const;
        }),
    finaPoints: protectedProcedure
        .input(z.object({
            strokeType: z.enum(RECORD_STROKES),
            distanceMeters: z.number().int().min(25).max(5000),
            timeCs: z.number().int().min(500).max(3_600_000),
            gender: z.enum(["male", "female"]),
            poolLengthMeters: z.union([z.literal(25), z.literal(50)]).default(50),
            birthYear: z.number().int().min(1900).max(2100).optional(),
        }))
        .query(async ({ input }) => {
            if (!isSupportedFinaEvent(input.strokeType, input.distanceMeters)) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Evento non supportato per il calcolo FINA.",
                });
            }
            const points = calculateFinaPoints({
                strokeType: input.strokeType,
                distanceMeters: input.distanceMeters,
                timeCs: input.timeCs,
                gender: input.gender,
                poolLengthMeters: input.poolLengthMeters,
            });
            return {
                points,
                strokeType: input.strokeType,
                distanceMeters: input.distanceMeters,
                poolLengthMeters: input.poolLengthMeters,
                timeCs: input.timeCs,
                gender: input.gender,
                age: input.birthYear ? new Date().getFullYear() - input.birthYear : null,
            };
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
