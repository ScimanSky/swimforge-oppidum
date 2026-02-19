import {
    protectedProcedure, router, z, getDb, sql,
    TRPCError,
} from "./_shared";

export const challengesRouter = router({
    // Get active challenges for current user
    list: protectedProcedure.query(async ({ ctx }) => {
        const challengesDb = await import("../db_challenges");
        return await challengesDb.getActiveChallenges(ctx.user.id);
    }),

    // Get challenge by ID with participants and leaderboard
    getById: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(async ({ ctx, input }) => {
            const challengesDb = await import("../db_challenges_getById");
            const challenge = await challengesDb.getChallengeById(input.id);
            if (!challenge) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Challenge not found" });
            }
            return challenge;
        }),

    // Create a new challenge
    create: protectedProcedure
        .input(z.object({
            name: z.string().min(3).max(128),
            description: z.string().optional(),
            type: z.enum(["pool", "open_water", "both"]),
            objective: z.enum(["total_distance", "total_sessions", "consistency", "avg_pace", "total_time", "longest_session"]),
            duration: z.enum(["3_days", "1_week", "2_weeks", "1_month"]),
            startDate: z.string(), // ISO date string
            badgeImageUrl: z.string().optional(),
            badgeName: z.string().optional(),
            prizeDescription: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
            const challengesDb = await import("../db_challenges");
            const challengeId = await challengesDb.createChallenge({
                ...input,
                creatorId: ctx.user.id,
                startDate: new Date(input.startDate),
            });

            if (!challengeId) {
                throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create challenge" });
            }

            // Auto-join creator to challenge
            await challengesDb.joinChallenge(challengeId, ctx.user.id);

            return { id: challengeId };
        }),

    // Join a challenge
    join: protectedProcedure
        .input(z.object({ challengeId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const challengesDb = await import("../db_challenges");
            const success = await challengesDb.joinChallenge(input.challengeId, ctx.user.id);
            return { success };
        }),

    // Leave a challenge
    leave: protectedProcedure
        .input(z.object({ challengeId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const challengesDb = await import("../db_challenges");
            const success = await challengesDb.leaveChallenge(input.challengeId, ctx.user.id);
            return { success };
        }),

    // Refresh challenge progress (called after sync)
    refreshProgress: protectedProcedure
        .input(z.object({ challengeId: z.number() }))
        .mutation(async ({ ctx, input }) => {
            const challengesDb = await import("../db_challenges");
            await challengesDb.calculateChallengeProgress(input.challengeId);
            return { success: true };
        }),

    // Recalculate progress for all active challenges (admin only)
    recalculateAllProgress: protectedProcedure.mutation(async ({ ctx }) => {
        if (ctx.user.role !== "admin") {
            throw new TRPCError({ code: "FORBIDDEN" });
        }

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

        // Get all active challenges
        const result = await db.execute(sql`
      SELECT id FROM challenges WHERE status = 'active' AND end_date >= NOW()
    `);
        const challenges = result.rows as any[];

        // Recalculate progress for each challenge
        const challengesDb = await import("../db_challenges");
        for (const challenge of challenges) {
            await challengesDb.calculateChallengeProgress(challenge.id);
        }

        return { success: true, updated: challenges.length };
    }),
});
