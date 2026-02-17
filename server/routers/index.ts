// Composed appRouter — assembles all domain routers into the top-level tRPC router.
// This is the single entry-point that replaces the monolithic routers.ts.

import { router } from "../_core/trpc";
import { systemRouter } from "../_core/systemRouter";

// Domain routers
import { authRouter } from "./auth.router";
import { profileRouter } from "./profile.router";
import { activitiesRouter } from "./activities.router";
import { badgesRouter } from "./badges.router";
import {
    syncRouter,
    leaderboardRouter,
    seasonRouter,
    videoRouter,
    recordsRouter,
    xpRouter,
    levelsRouter,
    garminRouter,
    stravaRouter,
} from "./gameplay.router";
import { challengesRouter } from "./challenges.router";
import { communityRouter } from "./community.router";
import { consentRouter } from "./consent.router";
import {
    adminRouter,
    statisticsRouter,
    aiCoachRouter,
    activityInsightsRouter,
} from "./admin.router";

// Re-export helpers that are used outside the router (e.g. cron jobs, webhooks)
export { checkAndAwardBadges } from "./badges.router";
export { seedBadgesAndLevels } from "./admin.router";

export const appRouter = router({
    system: systemRouter,
    auth: authRouter,
    profile: profileRouter,
    activities: activitiesRouter,
    badges: badgesRouter,
    sync: syncRouter,
    leaderboard: leaderboardRouter,
    season: seasonRouter,
    video: videoRouter,
    records: recordsRouter,
    xp: xpRouter,
    levels: levelsRouter,
    garmin: garminRouter,
    strava: stravaRouter,
    challenges: challengesRouter,
    community: communityRouter,
    consent: consentRouter,
    admin: adminRouter,
    statistics: statisticsRouter,
    aiCoach: aiCoachRouter,
    activityInsights: activityInsightsRouter,
});

export type AppRouter = typeof appRouter;
