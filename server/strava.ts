/**
 * Strava Integration Service
 * Updated: 2026-01-26
 * 
 * This module handles the integration with Strava through a dedicated
 * Python microservice that uses the stravalib library.
 * 
 * Architecture:
 * - Frontend calls Node.js backend (this file)
 * - Node.js backend calls Python microservice for Strava operations
 * - Python microservice handles Strava OAuth and data fetching
 * 
 * OAuth Flow:
 * - Step 1: getAuthorizeUrl() - Generate Strava OAuth URL
 * - Step 2: exchangeToken() - Exchange authorization code for tokens
 * - Step 3: Auto-sync activities on login (every 6h)
 */

import { getDb } from "./db";
import { stravaTokens, swimmingActivities, swimmerProfiles, xpTransactions } from "../drizzle/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { updateUserProfileBadge } from "./db_profile_badges";
import { decryptIfNeeded, encryptForStorage } from "./lib/tokenCrypto";
import { invalidateUserCache } from "./lib/cache";
import { calculateActivityXp } from "./lib/utils";
import { logger } from "./middleware/logger";
import { config } from "./config";
import { fetchWithTimeout } from "./lib/fetchWithTimeout";

// Strava microservice configuration
const STRAVA_SERVICE_URL =
  process.env.STRAVA_SERVICE_URL ||
  (process.env.NODE_ENV === "production" ? "https://swimforge-strava-service.onrender.com" : "");
const STRAVA_SERVICE_SECRET = process.env.STRAVA_SERVICE_SECRET;
const log = logger.child({ component: "strava" });

interface StravaServiceActivity {
  activity_id: string;
  activity_name: string;
  start_time: string;
  distance_meters: number;
  duration_seconds: number;
  moving_time_seconds: number;
  sport_type: string;
  calories?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  raw_data?: unknown;
}

interface StravaServiceResponse {
  success: boolean;
  message?: string;
  count?: number;
  activities?: StravaServiceActivity[];
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  authorize_url?: string;
  athlete?: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
  };
  error?: string;
}

type DbClient = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function requireDb(): Promise<DbClient> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/**
 * Call the Strava microservice
 */
async function callStravaService(
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: Record<string, unknown>
): Promise<StravaServiceResponse> {
  if (!STRAVA_SERVICE_SECRET) {
    throw new Error("Strava service not configured (missing STRAVA_SERVICE_SECRET)");
  }
  if (!STRAVA_SERVICE_URL) {
    throw new Error("Strava service not configured (missing STRAVA_SERVICE_URL)");
  }

  const url = `${STRAVA_SERVICE_URL}${endpoint}`;
  
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Service-Secret": STRAVA_SERVICE_SECRET,
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      config.EXTERNAL_API_TIMEOUT_MS,
      `strava:service ${method} ${endpoint}`,
    );

    const data = (await response.json().catch(() => ({ error: "Unknown error" }))) as unknown;
    const record =
      data && typeof data === "object" ? (data as Record<string, unknown>) : {};

    if (!response.ok) {
      const message =
        (typeof record["error"] === "string" && record["error"]) ||
        (typeof record["detail"] === "string" && record["detail"]) ||
        `HTTP ${response.status}`;
      throw new Error(message);
    }

    return data as StravaServiceResponse;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("[Strava Service] Error calling endpoint", {
      event: "strava:service_error",
      endpoint,
      method,
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Get Strava connection status for a user
 */
/**
 * Returns current Strava connection status for a user.
 *
 * This reads stored OAuth tokens from the database and may refresh tokens if expired.
 *
 * @param userId - SwimForge user id.
 */
export async function getStravaStatus(userId: number): Promise<{
  connected: boolean;
  athleteId?: number;
  username?: string;
  displayName?: string;
  lastSync?: Date;
}> {
  const db = await requireDb();
  
  try {
    const [tokens] = await db
      .select()
      .from(stravaTokens)
      .where(eq(stravaTokens.userId, userId))
      .limit(1);

    if (!tokens) {
      return { connected: false };
    }

    // Check if token is still valid (not expired)
    const now = Math.floor(Date.now() / 1000);
    const isExpired = tokens.expiresAt && tokens.expiresAt < now;

    if (isExpired) {
      // Try to refresh token
      try {
        await refreshStravaToken(userId);
        const [refreshedTokens] = await db
          .select()
          .from(stravaTokens)
          .where(eq(stravaTokens.userId, userId))
          .limit(1);
        
        if (refreshedTokens) {
          return {
            connected: true,
            athleteId: refreshedTokens.athleteId || undefined,
            username: refreshedTokens.username || undefined,
            displayName: refreshedTokens.displayName || undefined,
            lastSync: refreshedTokens.lastSync || undefined,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn("[Strava] Token refresh failed", {
          event: "strava:refresh_failed",
          userId,
          message,
        });
        return { connected: false };
      }
    }

    return {
      connected: true,
      athleteId: tokens.athleteId || undefined,
      username: tokens.username || undefined,
      displayName: tokens.displayName || undefined,
      lastSync: tokens.lastSync || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[Strava] Error getting status", {
      event: "strava:status_error",
      userId,
      message,
    });
    return { connected: false };
  }
}

/**
 * Generate Strava OAuth authorization URL
 */
/**
 * Generates the Strava OAuth authorization URL via the Strava microservice.
 *
 * @param userId - SwimForge user id.
 * @returns Authorization URL to redirect the user to.
 */
export async function getStravaAuthorizeUrl(userId: number): Promise<string> {
  try {
    const response: StravaServiceResponse = await callStravaService(
      "/auth/authorize",
      "POST",
      { user_id: userId.toString() }
    );

    if (!response.authorize_url) {
      throw new Error("No authorize URL returned from service");
    }

    return response.authorize_url;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[Strava] Error getting authorize URL", {
      event: "strava:authorize_url_error",
      userId,
      message,
    });
    throw new Error(`Failed to generate Strava authorization URL: ${message}`);
  }
}

/**
 * Exchange authorization code for access token
 */
/**
 * Exchanges an OAuth code for Strava access/refresh tokens via microservice and stores them.
 *
 * @param userId - SwimForge user id.
 * @param code - OAuth authorization code from Strava.
 */
export async function exchangeStravaToken(
  userId: number,
  code: string
): Promise<{
  success: boolean;
  athleteId?: number;
  username?: string;
  error?: string;
}> {
  const db = await requireDb();
  
  try {
    // Call microservice to exchange code
    const response: StravaServiceResponse = await callStravaService(
      "/auth/token",
      "POST",
      { user_id: userId.toString(), code }
    );

    if (!response.success || !response.access_token || !response.refresh_token) {
      return {
        success: false,
        error: response.error || "Failed to exchange token"
      };
    }

    // Save tokens to database
    await db
      .insert(stravaTokens)
      .values({
        userId,
        accessToken: encryptForStorage(response.access_token),
        refreshToken: encryptForStorage(response.refresh_token),
        expiresAt: response.expires_at || null,
        athleteId: response.athlete?.id || null,
        username: response.athlete?.username || null,
        displayName: response.athlete
          ? `${response.athlete.firstname} ${response.athlete.lastname}`
          : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: stravaTokens.userId,
        set: {
          accessToken: encryptForStorage(response.access_token),
          refreshToken: encryptForStorage(response.refresh_token),
          expiresAt: response.expires_at || null,
          athleteId: response.athlete?.id || null,
          username: response.athlete?.username || null,
          displayName: response.athlete
            ? `${response.athlete.firstname} ${response.athlete.lastname}`
            : null,
          updatedAt: new Date(),
        },
      });

    // Update swimmer profile
    await db
      .update(swimmerProfiles)
      .set({ stravaConnected: true })
      .where(eq(swimmerProfiles.userId, userId));

    log.info("[Strava] Token exchange successful", {
      event: "strava:token_exchange_ok",
      userId,
      athleteId: response.athlete?.id ?? null,
    });

    return {
      success: true,
      athleteId: response.athlete?.id,
      username: response.athlete?.username,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[Strava] Error exchanging token", {
      event: "strava:token_exchange_error",
      userId,
      message,
    });
    return {
      success: false,
      error: message
    };
  }
}

/**
 * Refresh Strava access token
 */
/**
 * Refreshes an expired Strava access token using the stored refresh token.
 *
 * @param userId - SwimForge user id.
 * @returns `true` if refresh succeeded and tokens were updated.
 */
export async function refreshStravaToken(userId: number): Promise<boolean> {
  const db = await requireDb();
  
  try {
    // Get current tokens
    const [tokens] = await db
      .select()
      .from(stravaTokens)
      .where(eq(stravaTokens.userId, userId))
      .limit(1);

    if (!tokens || !tokens.refreshToken) {
      throw new Error("No refresh token found");
    }
    const refreshToken = decryptIfNeeded(tokens.refreshToken);

    // Call microservice to refresh
    const response: StravaServiceResponse = await callStravaService(
      "/auth/refresh",
      "POST",
      {
        user_id: userId.toString(),
        refresh_token: refreshToken
      }
    );

    if (!response.success || !response.access_token) {
      throw new Error(response.error || "Failed to refresh token");
    }

    // Update tokens in database
    await db
      .update(stravaTokens)
      .set({
        accessToken: encryptForStorage(response.access_token),
        refreshToken: encryptForStorage(response.refresh_token || refreshToken),
        expiresAt: response.expires_at || null,
        updatedAt: new Date(),
      })
      .where(eq(stravaTokens.userId, userId));

    log.info("[Strava] Token refresh successful", { event: "strava:refresh_ok", userId });
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[Strava] Error refreshing token", { event: "strava:refresh_error", userId, message });
    return false;
  }
}

/**
 * Sync swimming activities from Strava
 */
/**
 * Imports recent swimming activities for the given user from Strava via microservice.
 *
 * @param userId - SwimForge user id.
 * @param daysBack - How many days back to fetch (default 30).
 */
export async function syncStravaActivities(
  userId: number,
  daysBack: number = 30
): Promise<{
  success: boolean;
  count: number;
  message?: string;
}> {
  const db = await requireDb();
  
  try {
    // Get user profile
    const [profile] = await db
      .select()
      .from(swimmerProfiles)
      .where(eq(swimmerProfiles.userId, userId))
      .limit(1);

    if (!profile) {
      throw new Error("User profile not found");
    }

    // Get tokens
    const [tokens] = await db
      .select()
      .from(stravaTokens)
      .where(eq(stravaTokens.userId, userId))
      .limit(1);

    if (!tokens || !tokens.accessToken) {
      throw new Error("No Strava connection found");
    }
    let accessToken = decryptIfNeeded(tokens.accessToken);

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (tokens.expiresAt && tokens.expiresAt < now) {
      // Refresh token
      const refreshed = await refreshStravaToken(userId);
      if (!refreshed) {
        throw new Error("Failed to refresh expired token");
      }
      
      // Get updated tokens
      const [updatedTokens] = await db
        .select()
        .from(stravaTokens)
        .where(eq(stravaTokens.userId, userId))
        .limit(1);
      
      if (!updatedTokens) {
        throw new Error("Failed to get updated tokens");
      }
      
      accessToken = decryptIfNeeded(updatedTokens.accessToken);
    }

    // Call microservice to sync
    const response: StravaServiceResponse = await callStravaService(
      "/sync",
      "POST",
      {
        user_id: userId.toString(),
        access_token: accessToken,
        days_back: daysBack
      }
    );

    if (!response.success || !response.activities) {
      throw new Error(response.error || "Failed to sync activities");
    }

    // Import activities to database
    let importedCount = 0;
    let totalNewXp = 0;
    let totalNewDistance = 0;
    let totalNewDuration = 0;
    
    for (const activity of response.activities) {
      try {
        // Check if activity already exists (by Strava ID)
        const [existingStrava] = await db
          .select()
          .from(swimmingActivities)
          .where(
            and(
              eq(swimmingActivities.userId, userId),
              eq(swimmingActivities.stravaActivityId, activity.activity_id)
            )
          )
          .limit(1);

	        if (existingStrava) {
	          log.debug("[Strava] Activity already exists, skipping", {
	            event: "strava:activity_skip_exists",
	            userId,
	            stravaActivityId: activity.activity_id,
	          });
	          continue;
	        }

        // Check for cross-platform duplicates (Garmin)
        // Match by timestamp (±5 min), distance (±10%), and duration (±10%)
        const activityDate = new Date(activity.start_time);
        const timeWindowStart = new Date(activityDate.getTime() - 5 * 60 * 1000); // -5 min
        const timeWindowEnd = new Date(activityDate.getTime() + 5 * 60 * 1000); // +5 min
        const distanceMin = Math.floor(activity.distance_meters * 0.9);
        const distanceMax = Math.ceil(activity.distance_meters * 1.1);
        const durationMin = Math.floor(activity.duration_seconds * 0.9);
        const durationMax = Math.ceil(activity.duration_seconds * 1.1);

        const [existingCrossPlatform] = await db
          .select()
          .from(swimmingActivities)
          .where(
            and(
              eq(swimmingActivities.userId, userId),
              sql`${swimmingActivities.activityDate} >= ${timeWindowStart}`,
              sql`${swimmingActivities.activityDate} <= ${timeWindowEnd}`,
              sql`${swimmingActivities.distanceMeters} >= ${distanceMin}`,
              sql`${swimmingActivities.distanceMeters} <= ${distanceMax}`,
              sql`${swimmingActivities.durationSeconds} >= ${durationMin}`,
              sql`${swimmingActivities.durationSeconds} <= ${durationMax}`,
              eq(swimmingActivities.activitySource, "garmin")
            )
          )
          .limit(1);

	        if (existingCrossPlatform) {
	          log.debug("[Strava] Activity duplicate of Garmin, skipping", {
	            event: "strava:activity_skip_duplicate",
	            userId,
	            stravaActivityId: activity.activity_id,
	            garminActivityId: existingCrossPlatform.id,
	          });
	          continue;
	        }

        // Calculate XP (shared formula). Strava doesn't provide open water flag, so keep it false.
        const xpEarned = calculateActivityXp(activity.distance_meters, false);

	        log.info("[Strava] Importing activity", {
	          event: "strava:activity_import_start",
	          userId,
	          stravaActivityId: activity.activity_id,
	          distanceMeters: activity.distance_meters,
	          xpEarned,
	        });

        // Insert activity
        await db.insert(swimmingActivities).values({
          userId,
          activityDate: new Date(activity.start_time),
          distanceMeters: activity.distance_meters,
          durationSeconds: activity.duration_seconds,
          poolLengthMeters: 25, // Default, Strava doesn't provide this
          strokeType: "mixed", // Default, Strava doesn't provide this
          avgPacePer100m: activity.moving_time_seconds > 0
            ? (activity.moving_time_seconds / (activity.distance_meters / 100))
            : null,
          calories: activity.calories || null,
          avgHeartRate: activity.average_heartrate || null,
          maxHeartRate: activity.max_heartrate || null,
          rawData: activity.raw_data ?? activity,
          xpEarned,
          activitySource: "strava",
          stravaActivityId: activity.activity_id,
          activityName: activity.activity_name,
          createdAt: new Date(),
        });

	        log.debug("[Strava] Activity inserted", {
	          event: "strava:activity_insert_ok",
	          userId,
	          stravaActivityId: activity.activity_id,
	        });

        // Add XP transaction
        await db.insert(xpTransactions).values({
          userId,
          amount: xpEarned,
          reason: "activity",
          description: `Attività: ${activity.activity_name} - ${Math.round(activity.distance_meters)}m`,
        });

	        log.debug("[Strava] XP transaction created", {
	          event: "strava:xp_tx_ok",
	          userId,
	          stravaActivityId: activity.activity_id,
	          xpEarned,
	        });

        importedCount++;
        totalNewXp += xpEarned;
        totalNewDistance += activity.distance_meters;
        totalNewDuration += activity.duration_seconds;
	        log.info("[Strava] Activity imported", {
	          event: "strava:activity_import_ok",
	          userId,
	          stravaActivityId: activity.activity_id,
	          xpEarned,
	        });
	      } catch (error) {
	        const message = error instanceof Error ? error.message : String(error);
	        log.error("[Strava] Error importing activity", {
	          event: "strava:activity_import_error",
	          userId,
	          stravaActivityId: activity.activity_id,
	          message,
	        });
	      }
	    }

    // Update profile totals
    if (importedCount > 0) {
      const newTotalXp = (profile.totalXp || 0) + totalNewXp;
      const newTotalDistance = (profile.totalDistanceMeters || 0) + totalNewDistance;
      const newTotalTime = (profile.totalTimeSeconds || 0) + totalNewDuration;
      const newTotalSessions = (profile.totalSessions || 0) + importedCount;

      // Calculate new level
      const newLevel = calculateLevel(newTotalXp);

      await db
        .update(swimmerProfiles)
        .set({
          totalXp: newTotalXp,
          level: newLevel,
          totalDistanceMeters: newTotalDistance,
          totalTimeSeconds: newTotalTime,
          totalSessions: newTotalSessions,
        })
        .where(eq(swimmerProfiles.userId, userId));

      log.info("[Strava] Updated profile after sync", {
        event: "strava:profile_updated",
        userId,
        totalNewXp,
        newLevel,
        newTotalSessions,
      });

      // Check and award achievement badges using the shared engine.
      const { checkAndAwardBadges } = await import("./badge_engine");
      await checkAndAwardBadges(userId);

      // Auto-update challenge progress for active challenges
      await updateActiveChallengesProgress(userId);

      // Invalidate cached data for this user
      await invalidateUserCache(String(userId));

      try {
        const { trackProductEvent } = await import("./product_analytics");
        await trackProductEvent({
          userId,
          eventName: "activity_synced",
          source: "strava_sync",
          entityType: "sync_session",
          metadata: {
            provider: "strava",
            syncedCount: importedCount,
            daysBack,
            newXp: totalNewXp,
          },
        });
      } catch {
        // Best effort analytics
      }
    }

    // Update last sync time
    await db
      .update(stravaTokens)
      .set({ lastSync: new Date() })
      .where(eq(stravaTokens.userId, userId));

    log.info("[Strava] Sync complete", {
      event: "strava:sync_complete",
      userId,
      importedCount,
      reportedCount: response.count ?? null,
    });

    return {
      success: true,
      count: importedCount,
      message: `Sincronizzate ${importedCount} attività da Strava`
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[Strava] Error syncing activities", {
      event: "strava:sync_error",
      userId,
      message,
    });
    return {
      success: false,
      count: 0,
      message
    };
  }
}

/**
 * Update progress for all active challenges the user is participating in
 */
async function updateActiveChallengesProgress(userId: number): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    // Get all active challenges the user is participating in
    const result = await db.execute(sql`
      SELECT DISTINCT c.id
      FROM challenges c
      INNER JOIN challenge_participants cp ON c.id = cp.challenge_id
      WHERE cp.user_id = ${userId}
        AND c.status = 'active'
        AND c.end_date >= NOW()
    `);

    const challenges = (result.rows ?? []) as Array<{ id: number }>;

    // Update progress for each challenge
    for (const challenge of challenges) {
      const challengesDb = await import("./db_challenges");
      await challengesDb.calculateChallengeProgress(challenge.id);
    }

    log.info("[Strava] Updated active challenges progress", {
      event: "strava:challenges_progress_updated",
      userId,
      challengesCount: challenges.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[Strava] Error updating challenge progress", {
      event: "strava:challenges_progress_error",
      userId,
      message,
    });
  }
}

/**
 * Disconnect Strava account
 */
/**
 * Disconnects Strava for the user by deleting tokens and updating the profile flag.
 *
 * @param userId - SwimForge user id.
 */
export async function disconnectStrava(userId: number): Promise<boolean> {
  const db = await requireDb();
  
  try {
    // Delete tokens
    await db
      .delete(stravaTokens)
      .where(eq(stravaTokens.userId, userId));

    // Update swimmer profile
    await db
      .update(swimmerProfiles)
      .set({ stravaConnected: false })
      .where(eq(swimmerProfiles.userId, userId));

    log.info("[Strava] Disconnected", { event: "strava:disconnect_ok", userId });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("[Strava] Error disconnecting", { event: "strava:disconnect_error", userId, message });
    return false;
  }
}

/**
 * Auto-sync Strava activities on login (if last sync > 6 hours ago)
 */
/**
 * Runs an automatic Strava sync if the last sync is older than the configured interval.
 *
 * @param userId - SwimForge user id.
 * @param options - Pass `force: true` to bypass the interval check.
 */
export async function autoSyncStrava(
  userId: number,
  options: { force?: boolean } = {}
): Promise<void> {
  const db = await requireDb();
  
  try {
    const [tokens] = await db
      .select()
      .from(stravaTokens)
      .where(eq(stravaTokens.userId, userId))
      .limit(1);

    if (!tokens) {
      return; // Not connected to Strava
    }

    if (!options.force) {
      let syncIntervalHours = Number.parseFloat(
        process.env.STRAVA_AUTO_SYNC_INTERVAL_HOURS || "6"
      );
      if (!Number.isFinite(syncIntervalHours)) {
        syncIntervalHours = 6;
      }

      if (syncIntervalHours > 0 && tokens.lastSync) {
        const threshold = new Date(
          Date.now() - syncIntervalHours * 60 * 60 * 1000
        );
	        if (tokens.lastSync > threshold) {
	          log.info("[Strava] Auto-sync skipped (recent sync)", {
	            event: "strava:auto_sync_skipped",
	            userId,
	            lastSync: tokens.lastSync,
	          });
	          return;
	        }
	      }
	    }

	    // Sync activities (last 7 days)
	    log.info("[Strava] Auto-sync starting", { event: "strava:auto_sync_start", userId });
	    await syncStravaActivities(userId, 7);
	  } catch (error) {
	    const message = error instanceof Error ? error.message : String(error);
	    log.error("[Strava] Error in auto-sync", {
	      event: "strava:auto_sync_error",
	      userId,
	      message,
	    });
	  }
	}


/**
 * Calculate level from XP
 */
function calculateLevel(totalXp: number): number {
  // Level thresholds (cumulative XP needed)
  const levelThresholds = [
    0,      // Level 1
    500,    // Level 2
    1200,   // Level 3
    2100,   // Level 4
    3200,   // Level 5
    4500,   // Level 6
    6000,   // Level 7
    7700,   // Level 8
    9600,   // Level 9
    11700,  // Level 10
    14000,  // Level 11
    16500,  // Level 12
    19200,  // Level 13
    22100,  // Level 14
    25200,  // Level 15
    28500,  // Level 16
    32000,  // Level 17
    35700,  // Level 18
    39600,  // Level 19
    43700,  // Level 20
  ];

  for (let i = levelThresholds.length - 1; i >= 0; i--) {
    if (totalXp >= levelThresholds[i]) {
      return i + 1;
    }
  }
  return 1;
}
