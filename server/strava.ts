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
import { stravaTokens, swimmingActivities, swimmerProfiles, xpTransactions, badgeDefinitions, userBadges } from "../drizzle/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { updateUserProfileBadge } from "./db_profile_badges";

// Strava microservice configuration
const STRAVA_SERVICE_URL = process.env.STRAVA_SERVICE_URL || "https://swimforge-strava-service.onrender.com";
const STRAVA_SERVICE_SECRET = process.env.STRAVA_SERVICE_SECRET || "swimforge-strava-secret-key-2026";

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
}

interface StravaServiceResponse {
  success: boolean;
  message?: string;
  count?: number;
  activities?: StravaServiceActivity[];
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  athlete?: {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
  };
  error?: string;
}

/**
 * Call the Strava microservice
 */
async function callStravaService(
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: object
): Promise<any> {
  const url = `${STRAVA_SERVICE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Service-Secret": STRAVA_SERVICE_SECRET,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({ error: "Unknown error" }));

    if (!response.ok) {
      throw new Error(data.error || data.detail || `HTTP ${response.status}`);
    }

    return data;
  } catch (error: any) {
    console.error(`[Strava Service] Error calling ${endpoint}:`, error.message);
    throw error;
  }
}

/**
 * Get Strava connection status for a user
 */
export async function getStravaStatus(userId: number): Promise<{
  connected: boolean;
  athleteId?: number;
  username?: string;
  displayName?: string;
  lastSync?: Date;
}> {
  const db = await getDb();
  
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
        console.error("[Strava] Token refresh failed:", error);
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
    console.error("[Strava] Error getting status:", error);
    return { connected: false };
  }
}

/**
 * Generate Strava OAuth authorization URL
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
  } catch (error: any) {
    console.error("[Strava] Error getting authorize URL:", error);
    throw new Error(`Failed to generate Strava authorization URL: ${error.message}`);
  }
}

/**
 * Exchange authorization code for access token
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
  const db = await getDb();
  
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
        accessToken: response.access_token,
        refreshToken: response.refresh_token,
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
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
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

    console.log(`[Strava] Token exchange successful for user ${userId}, athlete ${response.athlete?.id}`);

    return {
      success: true,
      athleteId: response.athlete?.id,
      username: response.athlete?.username,
    };
  } catch (error: any) {
    console.error("[Strava] Error exchanging token:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Refresh Strava access token
 */
export async function refreshStravaToken(userId: number): Promise<boolean> {
  const db = await getDb();
  
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

    // Call microservice to refresh
    const response: StravaServiceResponse = await callStravaService(
      "/auth/refresh",
      "POST",
      {
        user_id: userId.toString(),
        refresh_token: tokens.refreshToken
      }
    );

    if (!response.success || !response.access_token) {
      throw new Error(response.error || "Failed to refresh token");
    }

    // Update tokens in database
    await db
      .update(stravaTokens)
      .set({
        accessToken: response.access_token,
        refreshToken: response.refresh_token || tokens.refreshToken,
        expiresAt: response.expires_at || null,
        updatedAt: new Date(),
      })
      .where(eq(stravaTokens.userId, userId));

    console.log(`[Strava] Token refresh successful for user ${userId}`);
    return true;
  } catch (error: any) {
    console.error("[Strava] Error refreshing token:", error);
    return false;
  }
}

/**
 * Sync swimming activities from Strava
 */
export async function syncStravaActivities(
  userId: number,
  daysBack: number = 30
): Promise<{
  success: boolean;
  count: number;
  message?: string;
}> {
  const db = await getDb();
  
  try {
    // Get tokens
    const [tokens] = await db
      .select()
      .from(stravaTokens)
      .where(eq(stravaTokens.userId, userId))
      .limit(1);

    if (!tokens || !tokens.accessToken) {
      throw new Error("No Strava connection found");
    }

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
      
      tokens.accessToken = updatedTokens.accessToken;
    }

    // Call microservice to sync
    const response: StravaServiceResponse = await callStravaService(
      "/sync",
      "POST",
      {
        user_id: userId.toString(),
        access_token: tokens.accessToken,
        days_back: daysBack
      }
    );

    if (!response.success || !response.activities) {
      throw new Error(response.error || "Failed to sync activities");
    }

    // Import activities to database
    let importedCount = 0;
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
          console.log(`[Strava] Activity ${activity.activity_id} already exists, skipping`);
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
          console.log(`[Strava] Activity ${activity.activity_id} is a duplicate of Garmin activity ${existingCrossPlatform.id}, skipping`);
          continue;
        }

        // Calculate XP (same formula as Garmin)
        const distanceKm = activity.distance_meters / 1000;
        const durationMinutes = activity.duration_seconds / 60;
        const xpEarned = Math.round((distanceKm * 100) + (durationMinutes * 5));

        // Insert activity
        await db.insert(swimmingActivities).values({
          userId,
          activityDate: new Date(activity.start_time),
          distanceMeters: activity.distance_meters,
          durationSeconds: activity.duration_seconds,
          poolLength: 25, // Default, Strava doesn't provide this
          strokeType: "mixed", // Default, Strava doesn't provide this
          avgPacePer100m: activity.moving_time_seconds > 0
            ? (activity.moving_time_seconds / (activity.distance_meters / 100))
            : null,
          calories: activity.calories || null,
          avgHeartRate: activity.average_heartrate || null,
          maxHeartRate: activity.max_heartrate || null,
          xpEarned,
          activitySource: "strava",
          stravaActivityId: activity.activity_id,
          activityName: activity.activity_name,
          createdAt: new Date(),
        });

        // Add XP transaction
        await db.insert(xpTransactions).values({
          userId,
          amount: xpEarned,
          source: "swimming_activity",
          description: `Attività nuoto: ${activity.activity_name}`,
          createdAt: new Date(),
        });

        importedCount++;
        console.log(`[Strava] Imported activity ${activity.activity_id} (+${xpEarned} XP)`);
      } catch (error) {
        console.error(`[Strava] Error importing activity ${activity.activity_id}:`, error);
      }
    }

    // Update last sync time
    await db
      .update(stravaTokens)
      .set({ lastSync: new Date() })
      .where(eq(stravaTokens.userId, userId));

    // Check and award badges
    await checkAndAwardBadges(userId);

    console.log(`[Strava] Sync complete for user ${userId}: ${importedCount}/${response.count} activities imported`);

    return {
      success: true,
      count: importedCount,
      message: `Sincronizzate ${importedCount} attività da Strava`
    };
  } catch (error: any) {
    console.error("[Strava] Error syncing activities:", error);
    return {
      success: false,
      count: 0,
      message: error.message
    };
  }
}

/**
 * Disconnect Strava account
 */
export async function disconnectStrava(userId: number): Promise<boolean> {
  const db = await getDb();
  
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

    console.log(`[Strava] Disconnected for user ${userId}`);
    return true;
  } catch (error) {
    console.error("[Strava] Error disconnecting:", error);
    return false;
  }
}

/**
 * Check and award badges based on activities
 */
async function checkAndAwardBadges(userId: number): Promise<void> {
  const db = await getDb();
  
  try {
    // Get all badge definitions
    const badges = await db.select().from(badgeDefinitions);

    for (const badge of badges) {
      // Check if user already has this badge
      const [existing] = await db
        .select()
        .from(userBadges)
        .where(
          and(
            eq(userBadges.userId, userId),
            eq(userBadges.badgeId, badge.id)
          )
        )
        .limit(1);

      if (existing) continue;

      // Check badge criteria
      let earned = false;

      if (badge.criteriaType === "total_distance") {
        const [result] = await db
          .select({ total: sql<number>`COALESCE(SUM(${swimmingActivities.distanceMeters}), 0)` })
          .from(swimmingActivities)
          .where(eq(swimmingActivities.userId, userId));
        
        if (result && result.total >= (badge.criteriaValue || 0)) {
          earned = true;
        }
      } else if (badge.criteriaType === "activity_count") {
        const [result] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(swimmingActivities)
          .where(eq(swimmingActivities.userId, userId));
        
        if (result && result.count >= (badge.criteriaValue || 0)) {
          earned = true;
        }
      } else if (badge.criteriaType === "consecutive_days") {
        // Check consecutive days logic (simplified)
        const activities = await db
          .select({ activityDate: swimmingActivities.activityDate })
          .from(swimmingActivities)
          .where(eq(swimmingActivities.userId, userId))
          .orderBy(desc(swimmingActivities.activityDate));

        let consecutive = 0;
        let lastDate: Date | null = null;

        for (const activity of activities) {
          if (!lastDate) {
            consecutive = 1;
            lastDate = activity.activityDate;
          } else {
            const diffDays = Math.floor(
              (lastDate.getTime() - activity.activityDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            if (diffDays === 1) {
              consecutive++;
              lastDate = activity.activityDate;
            } else {
              break;
            }
          }
        }

        if (consecutive >= (badge.criteriaValue || 0)) {
          earned = true;
        }
      }

      // Award badge if earned
      if (earned) {
        await db.insert(userBadges).values({
          userId,
          badgeId: badge.id,
          earnedAt: new Date(),
        });

        // Update profile badge if higher tier
        await updateUserProfileBadge(userId, badge.id);

        console.log(`[Strava] Awarded badge ${badge.name} to user ${userId}`);
      }
    }
  } catch (error) {
    console.error("[Strava] Error checking badges:", error);
  }
}

/**
 * Auto-sync Strava activities on login (if last sync > 6 hours ago)
 */
export async function autoSyncStrava(userId: number): Promise<void> {
  const db = await getDb();
  
  try {
    const [tokens] = await db
      .select()
      .from(stravaTokens)
      .where(eq(stravaTokens.userId, userId))
      .limit(1);

    if (!tokens) {
      return; // Not connected to Strava
    }

    // Check if last sync was more than 6 hours ago
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    if (tokens.lastSync && tokens.lastSync > sixHoursAgo) {
      console.log(`[Strava] Auto-sync skipped for user ${userId} (last sync: ${tokens.lastSync})`);
      return;
    }

    // Sync activities (last 7 days)
    console.log(`[Strava] Auto-sync starting for user ${userId}`);
    await syncStravaActivities(userId, 7);
  } catch (error) {
    console.error("[Strava] Error in auto-sync:", error);
  }
}
