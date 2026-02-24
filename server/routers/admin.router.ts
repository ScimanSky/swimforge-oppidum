import {
    protectedProcedure, router, z, db,
    TRPCError,
    listPostReports, updatePostReportStatus,
    getPendingActivityInsights, listActivityInsights, markActivityInsightSeen,
} from "./_shared";

// Seed function for badges and levels
export async function seedBadgesAndLevels() {
    // Seed level thresholds
    const levels = [
        { level: 1, xp: 0, title: "Novizio", color: "#9ca3af" },
        { level: 2, xp: 500, title: "Apprendista", color: "#9ca3af" },
        { level: 3, xp: 1200, title: "Nuotatore", color: "#22c55e" },
        { level: 4, xp: 2000, title: "Nuotatore Esperto", color: "#22c55e" },
        { level: 5, xp: 3000, title: "Atleta", color: "#3b82f6" },
        { level: 6, xp: 4200, title: "Atleta Avanzato", color: "#3b82f6" },
        { level: 7, xp: 5600, title: "Veterano", color: "#8b5cf6" },
        { level: 8, xp: 7200, title: "Veterano Elite", color: "#8b5cf6" },
        { level: 9, xp: 9000, title: "Maestro", color: "#f59e0b" },
        { level: 10, xp: 11000, title: "Gran Maestro", color: "#f59e0b" },
        { level: 11, xp: 13500, title: "Campione", color: "#ef4444" },
        { level: 12, xp: 16500, title: "Campione Elite", color: "#ef4444" },
        { level: 13, xp: 20000, title: "Leggenda", color: "#ec4899" },
        { level: 14, xp: 24000, title: "Leggenda Vivente", color: "#ec4899" },
        { level: 15, xp: 28500, title: "Mito", color: "#06b6d4" },
        { level: 16, xp: 33500, title: "Mito Immortale", color: "#06b6d4" },
        { level: 17, xp: 39000, title: "Titano", color: "#eab308" },
        { level: 18, xp: 45000, title: "Titano Supremo", color: "#eab308" },
        { level: 19, xp: 52000, title: "Divinità Acquatica", color: "#a855f7" },
        { level: 20, xp: 60000, title: "Poseidone", color: "#1e40af" },
    ];

    for (const l of levels) {
        await db.createLevelThreshold(l.level, l.xp, l.title, l.color);
    }

    // Check if badges already exist
    const existingCount = await db.getBadgeDefinitionsCount();
    if (existingCount > 0) return;

    // Seed badge definitions
    const badges = [
        // Distance badges
        { code: "dist_1km", name: "Primo Chilometro", description: "Hai nuotato il tuo primo chilometro totale", category: "distance", iconName: "trophy", requirementType: "total_distance", requirementValue: 1000, xpReward: 50, rarity: "common", sortOrder: 1 },
        { code: "dist_10km", name: "Maratoneta in Erba", description: "Hai raggiunto 10 km totali", category: "distance", iconName: "medal", requirementType: "total_distance", requirementValue: 10000, xpReward: 100, rarity: "common", sortOrder: 2 },
        { code: "dist_42km", name: "Maratona Acquatica", description: "Hai nuotato una maratona (42.195 km)", category: "distance", iconName: "award", requirementType: "total_distance", requirementValue: 42195, xpReward: 250, rarity: "uncommon", sortOrder: 3 },
        { code: "dist_100km", name: "Centurione", description: "Hai superato i 100 km totali", category: "distance", iconName: "star", requirementType: "total_distance", requirementValue: 100000, xpReward: 500, rarity: "rare", sortOrder: 4 },
        { code: "dist_250km", name: "Traversata Epica", description: "Hai nuotato 250 km totali", category: "distance", iconName: "crown", requirementType: "total_distance", requirementValue: 250000, xpReward: 1000, rarity: "epic", sortOrder: 5 },
        { code: "dist_500km", name: "Mezzo Millennio", description: "Hai raggiunto 500 km totali", category: "distance", iconName: "gem", requirementType: "total_distance", requirementValue: 500000, xpReward: 2000, rarity: "epic", sortOrder: 6 },
        { code: "dist_1000km", name: "Il Milionario", description: "Un milione di metri nuotati!", category: "distance", iconName: "diamond", requirementType: "total_distance", requirementValue: 1000000, xpReward: 5000, rarity: "legendary", sortOrder: 7 },

        // Session distance badges
        { code: "session_3km", name: "Sessione Solida", description: "Hai nuotato 3 km in una singola sessione", category: "session", iconName: "flame", requirementType: "single_session_distance", requirementValue: 3000, xpReward: 75, rarity: "common", sortOrder: 10 },
        { code: "session_4km", name: "Resistenza", description: "Hai nuotato 4 km in una singola sessione", category: "session", iconName: "zap", requirementType: "single_session_distance", requirementValue: 4000, xpReward: 150, rarity: "uncommon", sortOrder: 11 },
        { code: "session_5km", name: "Ultra Nuotatore", description: "Hai nuotato 5 km in una singola sessione", category: "session", iconName: "rocket", requirementType: "single_session_distance", requirementValue: 5000, xpReward: 300, rarity: "rare", sortOrder: 12 },
        { code: "session_6km", name: "Macchina Instancabile", description: "6 km in una sessione? Sei una macchina!", category: "session", iconName: "battery", requirementType: "single_session_distance", requirementValue: 6000, xpReward: 500, rarity: "epic", sortOrder: 13 },

        // Consistency badges
        { code: "sessions_10", name: "Inizio Promettente", description: "Hai completato 10 sessioni di allenamento", category: "consistency", iconName: "calendar", requirementType: "sessions_count", requirementValue: 10, xpReward: 100, rarity: "common", sortOrder: 20 },
        { code: "sessions_25", name: "Abitudine Sana", description: "25 sessioni completate", category: "consistency", iconName: "calendar-check", requirementType: "sessions_count", requirementValue: 25, xpReward: 200, rarity: "common", sortOrder: 21 },
        { code: "sessions_50", name: "Mezzo Centinaio", description: "50 sessioni di puro impegno", category: "consistency", iconName: "target", requirementType: "sessions_count", requirementValue: 50, xpReward: 400, rarity: "uncommon", sortOrder: 22 },
        { code: "sessions_100", name: "Centenario", description: "100 sessioni! La costanza paga", category: "consistency", iconName: "award", requirementType: "sessions_count", requirementValue: 100, xpReward: 750, rarity: "rare", sortOrder: 23 },
        { code: "sessions_200", name: "Devoto alla Vasca", description: "200 sessioni di dedizione totale", category: "consistency", iconName: "heart", requirementType: "sessions_count", requirementValue: 200, xpReward: 1500, rarity: "epic", sortOrder: 24 },
        { code: "sessions_365", name: "Un Anno in Vasca", description: "365 sessioni - praticamente ogni giorno!", category: "consistency", iconName: "sun", requirementType: "sessions_count", requirementValue: 365, xpReward: 3000, rarity: "legendary", sortOrder: 25 },

        // Open water badges
        { code: "ow_first", name: "Battesimo del Mare", description: "Prima nuotata in acque libere", category: "open_water", iconName: "waves", requirementType: "open_water_sessions", requirementValue: 1, xpReward: 200, rarity: "uncommon", sortOrder: 40 },
        { code: "ow_5", name: "Navigatore", description: "5 sessioni in acque libere", category: "open_water", iconName: "compass", requirementType: "open_water_sessions", requirementValue: 5, xpReward: 300, rarity: "uncommon", sortOrder: 41 },
        { code: "ow_10", name: "Lupo di Mare", description: "10 sessioni in acque libere", category: "open_water", iconName: "ship", requirementType: "open_water_sessions", requirementValue: 10, xpReward: 750, rarity: "rare", sortOrder: 42 },
        { code: "ow_5km", name: "Esploratore Marino", description: "5 km totali in mare aperto", category: "open_water", iconName: "anchor", requirementType: "open_water_total", requirementValue: 5000, xpReward: 500, rarity: "rare", sortOrder: 43 },
        { code: "ow_25km", name: "Attraversatore", description: "25 km totali in mare", category: "open_water", iconName: "globe", requirementType: "open_water_total", requirementValue: 25000, xpReward: 1500, rarity: "epic", sortOrder: 44 },

        // Special Oppidum badges
        { code: "oppidum_member", name: "Membro Oppidum", description: "Benvenuto nella famiglia Oppidum!", category: "special", iconName: "users", requirementType: "special", requirementValue: 0, xpReward: 100, rarity: "common", sortOrder: 50, colorPrimary: "#1e3a5f", colorSecondary: "#3b82f6" },
        { code: "polpo_oro", name: "Polpo d'Oro", description: "Badge esclusivo per i fondatori di SwimForge", category: "special", iconName: "octagon", requirementType: "special", requirementValue: 0, xpReward: 1000, rarity: "legendary", sortOrder: 53, colorPrimary: "#eab308", colorSecondary: "#fde047" },

        // Milestone badges
        { code: "time_10h", name: "Prime 10 Ore", description: "10 ore totali in acqua", category: "milestone", iconName: "clock", requirementType: "total_time", requirementValue: 36000, xpReward: 200, rarity: "common", sortOrder: 60 },
        { code: "time_50h", name: "50 Ore di Dedizione", description: "Mezzo centinaio di ore nuotate", category: "milestone", iconName: "hourglass", requirementType: "total_time", requirementValue: 180000, xpReward: 500, rarity: "uncommon", sortOrder: 61 },
        { code: "time_100h", name: "Centenario del Tempo", description: "100 ore in vasca!", category: "milestone", iconName: "timer", requirementType: "total_time", requirementValue: 360000, xpReward: 1000, rarity: "rare", sortOrder: 62 },
        { code: "level_5", name: "Livello 5 Raggiunto", description: "Sei diventato un Atleta!", category: "milestone", iconName: "arrow-up", requirementType: "level_reached", requirementValue: 5, xpReward: 250, rarity: "common", sortOrder: 63 },
        { code: "level_10", name: "Livello 10 Raggiunto", description: "Sei un Gran Maestro!", category: "milestone", iconName: "arrow-up-circle", requirementType: "level_reached", requirementValue: 10, xpReward: 500, rarity: "rare", sortOrder: 64 },
        { code: "level_15", name: "Livello 15 Raggiunto", description: "Sei un Mito!", category: "milestone", iconName: "chevrons-up", requirementType: "level_reached", requirementValue: 15, xpReward: 1000, rarity: "epic", sortOrder: 65 },
        { code: "level_20", name: "Poseidone", description: "Hai raggiunto il livello massimo!", category: "milestone", iconName: "crown", requirementType: "level_reached", requirementValue: 20, xpReward: 2500, rarity: "legendary", sortOrder: 66 },
    ];

    for (const badge of badges) {
        await db.createBadgeDefinition({
            code: badge.code,
            name: badge.name,
            description: badge.description,
            category: badge.category as any,
            iconName: badge.iconName,
            requirementType: badge.requirementType,
            requirementValue: badge.requirementValue,
            xpReward: badge.xpReward,
            rarity: badge.rarity as any,
            sortOrder: badge.sortOrder,
            colorPrimary: (badge as any).colorPrimary || "#1e3a5f",
            colorSecondary: (badge as any).colorSecondary || "#3b82f6",
        });
    }
}

// Admin: Seed badges and levels
export const adminRouter = router({
    seedData: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") {
            throw new TRPCError({ code: "FORBIDDEN" });
        }

        await seedBadgesAndLevels();
        return { success: true };
    }),

    // Manually trigger challenge completion (for testing)
    completeChallenges: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") {
            throw new TRPCError({ code: "FORBIDDEN" });
        }

        const cronChallenges = await import("../cron_challenges");
        const result = await cronChallenges.completeChallenges();
        return result;
    }),

    // Fix badge URLs (temporary endpoint)
    fixBadgeUrls: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") {
            throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { fixBadgeUrls } = await import("../fix_badge_urls");
        return await fixBadgeUrls();
    }),

    listPostReports: protectedProcedure
        .input(z.object({
            status: z.enum(["all", "open", "in_review", "resolved", "rejected"]).optional(),
            limit: z.number().min(1).max(100).optional(),
            offset: z.number().min(0).optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
            if (ctx.user.role !== "admin") {
                throw new TRPCError({ code: "FORBIDDEN" });
            }
            return listPostReports({
                status: input?.status ?? "open",
                limit: input?.limit ?? 50,
                offset: input?.offset ?? 0,
            });
        }),

    updatePostReportStatus: protectedProcedure
        .input(z.object({
            reportId: z.number(),
            status: z.enum(["open", "in_review", "resolved", "rejected"]),
            adminNote: z.string().max(1000).optional().nullable(),
        }))
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.role !== "admin") {
                throw new TRPCError({ code: "FORBIDDEN" });
            }
            return updatePostReportStatus({
                reportId: input.reportId,
                status: input.status,
                adminUserId: ctx.user.id,
                adminNote: input.adminNote ?? null,
            });
        }),

    storyCleanupStats: protectedProcedure
        .query(async ({ ctx }) => {
            if (ctx.user.role !== "admin") {
                throw new TRPCError({ code: "FORBIDDEN" });
            }
            const { getStoryCleanupStats } = await import("../db_stories");
            return getStoryCleanupStats();
        }),

    runStoryCleanup: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(2000).optional() }).optional())
        .mutation(async ({ ctx, input }) => {
            if (ctx.user.role !== "admin") {
                throw new TRPCError({ code: "FORBIDDEN" });
            }
            const { cleanupExpiredStories } = await import("../db_stories");
            const result = await cleanupExpiredStories(input?.limit ?? 300);
            return {
                ...result,
                ranAt: new Date().toISOString(),
            };
        }),
});

// Statistics
export const statisticsRouter = router({
    // Get progress timeline data
    getTimeline: protectedProcedure
        .input(z.object({
            days: z.number().default(30),
        }))
        .query(async ({ ctx, input }) => {
            const { getProgressTimeline } = await import("../db_statistics");
            return await getProgressTimeline(ctx.user.id, input.days);
        }),

    // Get performance analysis
    getPerformance: protectedProcedure
        .input(z.object({
            days: z.number().default(30),
        }))
        .query(async ({ ctx, input }) => {
            const { getPerformanceAnalysis } = await import("../db_statistics");
            return await getPerformanceAnalysis(ctx.user.id, input.days);
        }),

    // Get advanced metrics
    getAdvanced: protectedProcedure
        .input(z.object({
            days: z.number().default(30),
        }))
        .query(async ({ ctx, input }) => {
            const { getAdvancedMetrics } = await import("../db_statistics");
            return await getAdvancedMetrics(ctx.user.id, input.days);
        }),
});

// AI Coach
export const aiCoachRouter = router({
    // Get existing workouts (read-only, no generation)
    getWorkouts: protectedProcedure
        .query(async ({ ctx }) => {
            const { getExistingWorkouts } = await import("../ai_coach");
            return await getExistingWorkouts(ctx.user.id);
        }),

    // Generate both pool + dryland workouts (7-day cooldown)
    generateWorkouts: protectedProcedure
        .mutation(async ({ ctx }) => {
            const { generateBothWorkouts } = await import("../ai_coach");
            try {
                return await generateBothWorkouts(ctx.user.id);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Generazione workout non riuscita";
                if (
                    message.includes("almeno 3 attività di nuoto sincronizzate") ||
                    message.includes("cooldown")
                ) {
                    throw new TRPCError({ code: "PRECONDITION_FAILED", message });
                }
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
            }
        }),

    // Conversational coach chat
    chat: protectedProcedure
        .input(
            z.object({
                messages: z
                    .array(
                        z.object({
                            role: z.enum(["user", "assistant"]),
                            content: z.string().trim().min(1).max(2000),
                        })
                    )
                    .min(1)
                    .max(20),
                goal: z.string().trim().max(120).optional().nullable(),
                constraints: z.string().trim().max(240).optional().nullable(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { generateCoachChatReply } = await import("../ai_coach_chat");
            return await generateCoachChatReply(ctx.user.id, input.messages, {
                goal: input.goal ?? null,
                constraints: input.constraints ?? null,
            });
        }),
});

// Activity Insights
export const activityInsightsRouter = router({
    pending: protectedProcedure
        .input(z.object({ limit: z.number().min(1).max(5).optional() }).optional())
        .query(async ({ ctx, input }) => {
            const limit = input?.limit ?? 3;
            return getPendingActivityInsights(ctx.user.id, limit);
        }),
    markSeen: protectedProcedure
        .input(z.object({ activityId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            await markActivityInsightSeen(ctx.user.id, input.activityId);
            return { success: true };
        }),
    list: protectedProcedure
        .input(z.object({
            limit: z.number().min(1).max(50).optional(),
            offset: z.number().min(0).optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
            const limit = input?.limit ?? 20;
            const offset = input?.offset ?? 0;
            return listActivityInsights(ctx.user.id, limit, offset);
        }),
});
