// Shared imports, types, and utilities for all domain routers.
// Extracted from the monolithic routers.ts to support domain-based splitting.

export { COOKIE_NAME } from "@shared/const";
export { getSessionCookieOptions } from "../_core/cookies";
export { publicProcedure, protectedProcedure, router } from "../_core/trpc";
export { sdk } from "../_core/sdk";
export { z } from "zod";
export * as db from "../db";
export { getDb } from "../db";
export * as garmin from "../garmin";
export * as strava from "../strava";
export { sql, eq } from "drizzle-orm";
export { swimmerProfiles } from "../../drizzle/schema";
export type { clubAnnouncements, clubEvents, swimmingActivities } from "../../drizzle/schema";
export { initializeAllUserProfileBadges } from "../db_profile_badges";
export { TRPCError } from "@trpc/server";
export { verifySupabaseAccessToken } from "../_core/supabase";
export type { Request, Response } from "express";
export { loginLimiter, registrationLimiter } from "../middleware/security";
export {
    getOrSetCached,
    cacheKeys,
    CACHE_TTL,
    invalidateUserCache,
    invalidateLeaderboardCache,
} from "../lib/cache";
export {
    addComment,
    deleteOwnPost,
    getComments,
    getSocialFeed,
    hidePostForUser,
    listPostReports,
    reportPost,
    setActivityShare,
    toggleSplash,
    unhidePostForUser,
    updatePostReportStatus,
    upsertActivityPost,
} from "../db_social";
export { getUserPublicProfile, toggleFollow, getSuggestedUsers, searchUsers } from "../db_public_profiles";
export { getPendingActivityInsights, listActivityInsights, markActivityInsightSeen } from "../ai_activity_insights";
export { logger } from "../middleware/logger";
export { sanitizeActivityNotes } from "../lib/sanitize";
export { claimSeasonReward, getCurrentSeasonState, getSeasonLeaderboard } from "../season";
export {
    awardActionXp,
    claimCurrentClubQuestReward,
    createSeasonActivityPrediction,
    evaluateSeasonPredictionWithActivity,
    getActionXpStatus,
    getCurrentClubQuestStates,
    getSeasonEngagementSnapshot,
    listSeasonActivityPredictions,
} from "../season_engagement";

// ─── Type aliases ───────────────────────────────────────────────────
import type * as _db from "../db";
import type { clubEvents as _clubEvents, clubAnnouncements as _clubAnnouncements, swimmingActivities as _swimmingActivities } from "../../drizzle/schema";

export type BadgeDefinitionRow = Awaited<ReturnType<typeof _db.getAllBadgeDefinitions>>[number];
export type ClubEventInsert = typeof _clubEvents.$inferInsert;
export type ClubAnnouncementInsert = typeof _clubAnnouncements.$inferInsert;
export type SwimmingActivityInsert = typeof _swimmingActivities.$inferInsert;

// ─── Helper functions ───────────────────────────────────────────────
export const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

export const coerceBoolean = (value: unknown): boolean | undefined => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        if (value.toLowerCase() === "true") return true;
        if (value.toLowerCase() === "false") return false;
    }
    if (typeof value === "number") {
        if (value === 1) return true;
        if (value === 0) return false;
    }
    return undefined;
};

export const normalizeBooleanRecord = (value: unknown): Record<string, boolean> => {
    if (!isRecord(value)) return {};
    const out: Record<string, boolean> = {};
    for (const [key, raw] of Object.entries(value)) {
        const coerced = coerceBoolean(raw);
        if (coerced !== undefined) {
            out[key] = coerced;
        }
    }
    return out;
};

export function detectImageType(buffer: Buffer): { mimeType: "image/jpeg" | "image/png" | "image/webp"; extension: "jpg" | "png" | "webp" } | null {
    if (buffer.length < 12) return null;
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { mimeType: "image/jpeg", extension: "jpg" };
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return { mimeType: "image/png", extension: "png" };
    }
    // WEBP: "RIFF" .... "WEBP"
    if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    ) {
        return { mimeType: "image/webp", extension: "webp" };
    }
    return null;
}

export async function runAutoSync(userId: number, options: { force?: boolean } = {}) {
    const _garmin = await import("../garmin");
    const _strava = await import("../strava");
    await Promise.allSettled([
        _garmin.autoSyncGarmin(userId, options),
        _strava.autoSyncStrava(userId, options),
    ]);
    const { invalidateLeaderboardCache: _inv } = await import("../lib/cache");
    await _inv();
}

export async function applyRateLimit(
    limiter: (req: import("express").Request, res: import("express").Response, next: (err?: unknown) => void) => void,
    req: import("express").Request,
    res: import("express").Response
): Promise<void> {
    const { TRPCError: _E } = await import("@trpc/server");
    await new Promise<void>((resolve, reject) => {
        let settled = false;
        const done = (err?: unknown) => {
            if (settled) return;
            settled = true;
            if (err) return reject(err);
            if (res.headersSent) {
                return reject(
                    new _E({
                        code: "TOO_MANY_REQUESTS",
                        message: "Rate limit exceeded",
                    })
                );
            }
            resolve();
        };
        limiter(req, res, done);
        setImmediate(() => {
            if (!settled && res.headersSent) {
                settled = true;
                reject(
                    new _E({
                        code: "TOO_MANY_REQUESTS",
                        message: "Rate limit exceeded",
                    })
                );
            }
        });
    });
}
