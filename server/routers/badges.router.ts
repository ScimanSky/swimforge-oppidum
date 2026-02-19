import {
    publicProcedure, protectedProcedure, router, z, db, getDb,
    TRPCError,
    getOrSetCached, cacheKeys, CACHE_TTL,
    invalidateLeaderboardCache,
    initializeAllUserProfileBadges,
} from "./_shared";
import type { BadgeDefinitionRow } from "./_shared";

// Helper function to check and award badges
export async function checkAndAwardBadges(userId: number): Promise<BadgeDefinitionRow[]> {
    const profile = await db.getSwimmerProfile(userId);
    if (!profile) return [];

    const allBadges = await db.getAllBadgeDefinitions();
    const newlyAwardedBadges: BadgeDefinitionRow[] = [];
    let updatedTotalXp = profile.totalXp;

    for (const badge of allBadges) {
        const hasBadge = await db.hasUserBadge(userId, badge.id);
        if (hasBadge) continue;

        let shouldAward = false;

        switch (badge.requirementType) {
            case "total_distance_km":
                shouldAward = (profile.totalDistanceMeters / 1000) >= badge.requirementValue;
                break;
            case "single_session_distance_km":
                // This would need to check the latest activity (handled in activity creation)
                break;
            case "total_sessions":
                shouldAward = profile.totalSessions >= badge.requirementValue;
                break;
            case "total_time_hours":
                shouldAward = (profile.totalTimeSeconds / 3600) >= badge.requirementValue;
                break;
            case "total_open_water_sessions":
                shouldAward = profile.totalOpenWaterSessions >= badge.requirementValue;
                break;
            case "total_open_water_distance_km":
                shouldAward = (profile.totalOpenWaterMeters / 1000) >= badge.requirementValue;
                break;
            case "level":
                shouldAward = profile.level >= badge.requirementValue;
                break;
            case "manual":
                // Manual badges (oppidum_member, golden_octopus) are awarded manually
                break;
        }

        if (shouldAward) {
            await db.awardBadge({ userId, badgeId: badge.id });
            await db.createXpTransaction({
                userId,
                amount: badge.xpReward,
                reason: "badge",
                referenceId: badge.id,
                description: `Badge sbloccato: ${badge.name}`,
            });

            updatedTotalXp += badge.xpReward;

            // Add to newly awarded badges
            newlyAwardedBadges.push(badge);
        }
    }

    if (newlyAwardedBadges.length > 0) {
        await db.updateSwimmerProfile(userId, {
            totalXp: updatedTotalXp,
        });
        await invalidateLeaderboardCache();
    }

    return newlyAwardedBadges;
}

export const badgesRouter = router({
    definitions: publicProcedure.query(async () => {
        return await getOrSetCached(
            cacheKeys.badgeDefinitions(),
            () => db.getAllBadgeDefinitions(),
            CACHE_TTL.BADGES
        );
    }),

    userBadges: protectedProcedure.query(async ({ ctx }) => {
        return await getOrSetCached(
            cacheKeys.badges(String(ctx.user.id)),
            () => db.getUserBadges(ctx.user.id),
            CACHE_TTL.BADGES
        );
    }),

    progress: protectedProcedure.query(async ({ ctx }) => {
        const profile = await db.getSwimmerProfile(ctx.user.id);
        const allBadges = await db.getAllBadgeDefinitions();
        const userBadges = await db.getUserBadges(ctx.user.id);
        const earnedBadgeIds = new Set(userBadges.map(ub => ub.badge.id));

        // Get longest session distance for single_session_distance_km badges
        const longestSessionMeters = await db.getMaxSessionDistance(ctx.user.id);

        return allBadges.map(badge => {
            const earned = earnedBadgeIds.has(badge.id);
            let progress = 0;
            const bestSessionKm = longestSessionMeters / 1000;

            if (!earned && profile) {
                switch (badge.requirementType) {
                    case "total_distance_km":
                        progress = Math.min(100, (profile.totalDistanceMeters / 1000 / badge.requirementValue) * 100);
                        break;
                    case "single_session_distance_km":
                        progress = Math.min(100, (bestSessionKm / badge.requirementValue) * 100);
                        break;
                    case "total_sessions":
                        progress = Math.min(100, (profile.totalSessions / badge.requirementValue) * 100);
                        break;
                    case "total_time_hours":
                        progress = Math.min(100, (profile.totalTimeSeconds / 3600 / badge.requirementValue) * 100);
                        break;
                    case "total_open_water_sessions":
                        progress = Math.min(100, (profile.totalOpenWaterSessions / badge.requirementValue) * 100);
                        break;
                    case "total_open_water_distance_km":
                        progress = Math.min(100, (profile.totalOpenWaterMeters / 1000 / badge.requirementValue) * 100);
                        break;
                    case "level":
                        progress = Math.min(100, (profile.level / badge.requirementValue) * 100);
                        break;
                    case "manual":
                        // Manual badges (oppidum_member, golden_octopus) don't have auto progress
                        progress = 0;
                        break;
                }
            }

            return {
                ...badge,
                earned,
                progress: earned ? 100 : Math.floor(progress),
                earnedAt: userBadges.find(ub => ub.badge.id === badge.id)?.userBadge.earnedAt,
                bestSessionKm: badge.requirementType === "single_session_distance_km" ? bestSessionKm : undefined,
            };
        });
    }),

    // Recalculate and award badges based on current stats
    recalculate: protectedProcedure.mutation(async ({ ctx }) => {
        const profile = await db.getSwimmerProfile(ctx.user.id);
        if (!profile) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Profile not found" });
        }

        // Get longest session distance
        const longestSessionDistance = await db.getMaxSessionDistance(ctx.user.id);

        const allBadges = await db.getAllBadgeDefinitions();
        const userBadges = await db.getUserBadges(ctx.user.id);
        const earnedBadgeIds = new Set(userBadges.map(ub => ub.badge.id));

        let newBadgesCount = 0;
        let updatedTotalXp = profile.totalXp;

        for (const badge of allBadges) {
            if (earnedBadgeIds.has(badge.id)) continue;

            let shouldAward = false;

            switch (badge.requirementType) {
                case "total_distance_km":
                    shouldAward = (profile.totalDistanceMeters / 1000) >= badge.requirementValue;
                    break;
                case "single_session_distance_km":
                    shouldAward = (longestSessionDistance / 1000) >= badge.requirementValue;
                    break;
                case "total_sessions":
                    shouldAward = profile.totalSessions >= badge.requirementValue;
                    break;
                case "total_time_hours":
                    shouldAward = (profile.totalTimeSeconds / 3600) >= badge.requirementValue;
                    break;
                case "total_open_water_sessions":
                    shouldAward = profile.totalOpenWaterSessions >= badge.requirementValue;
                    break;
                case "total_open_water_distance_km":
                    shouldAward = (profile.totalOpenWaterMeters / 1000) >= badge.requirementValue;
                    break;
                case "level":
                    shouldAward = profile.level >= badge.requirementValue;
                    break;
                case "manual":
                    // Manual badges are not auto-awarded
                    break;
            }

            if (shouldAward) {
                await db.awardBadge({ userId: ctx.user.id, badgeId: badge.id });
                await db.createXpTransaction({
                    userId: ctx.user.id,
                    amount: badge.xpReward,
                    reason: "badge",
                    referenceId: badge.id,
                    description: `Badge sbloccato: ${badge.name}`,
                });

                updatedTotalXp += badge.xpReward;

                newBadgesCount++;
            }
        }

        if (newBadgesCount > 0) {
            await db.updateSwimmerProfile(ctx.user.id, {
                totalXp: updatedTotalXp,
            });
        }

        return { success: true, newBadges: newBadgesCount };
    }),

    // Initialize profile badges for all users
    initializeProfileBadges: protectedProcedure.mutation(async () => {
        const result = await initializeAllUserProfileBadges();
        return { success: true, updated: result.updated };
    }),

    // Check for newly unlocked badges and return them
    checkNewBadges: protectedProcedure.query(async ({ ctx }) => {
        const newBadges = await checkAndAwardBadges(ctx.user.id);
        return newBadges;
    }),

    // Get all achievement badge definitions
    getAchievementBadgeDefinitions: protectedProcedure.query(async () => {
        const database = await getDb();
        if (!database) return [];

        const { achievementBadgeDefinitions } = await import("../../drizzle/schema");
        return await database.select().from(achievementBadgeDefinitions);
    }),

    // Get user's earned achievement badges
    getUserAchievementBadges: protectedProcedure.query(async ({ ctx }) => {
        const database = await getDb();
        if (!database) return [];

        const { userAchievementBadges, achievementBadgeDefinitions } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        const badges = await database
            .select()
            .from(userAchievementBadges)
            .where(eq(userAchievementBadges.userId, ctx.user.id));

        // Join with badge definitions
        const badgeIds = badges.map(b => b.badgeId);
        const definitions = await database
            .select()
            .from(achievementBadgeDefinitions);

        return badges.map(badge => {
            const definition = definitions.find(d => d.id === badge.badgeId);
            return {
                ...badge,
                badge: definition,
            };
        });
    }),
});
