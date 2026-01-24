/**
 * Garmin Connect Integration Service
 * 
 * This module handles the integration with Garmin Connect through a dedicated
 * Python microservice that uses the python-garminconnect library.
 * 
 * Architecture:
 * - Frontend calls Node.js backend (this file)
 * - Node.js backend calls Python microservice for Garmin operations
 * - Python microservice handles Garmin authentication and data fetching
 * 
 * MFA Support:
 * - Step 1: connectGarmin() - Returns mfaRequired=true if MFA is needed
 * - Step 2: completeMfa() - Complete authentication with MFA code
 */

import { getDb } from "./db";
import { garminTokens, swimmingActivities, swimmerProfiles, xpTransactions, badgeDefinitions, userBadges } from "../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

// Garmin microservice configuration
const GARMIN_SERVICE_URL = process.env.GARMIN_SERVICE_URL || "http://localhost:8000";
const GARMIN_SERVICE_SECRET = process.env.GARMIN_SERVICE_SECRET || "swimforge-garmin-secret-key";

interface GarminServiceActivity {
  activity_id: string;
  activity_name: string;
  start_time: string;
  distance_meters: number;
  duration_seconds: number;
  pool_length?: number;
  stroke_type: string;
  avg_pace_per_100m?: number;
  calories?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  swolf_score?: number;
  laps_count?: number;
  is_open_water: boolean;
}

interface GarminServiceResponse {
  success: boolean;
  message?: string;
  count?: number;
  activities?: GarminServiceActivity[];
  synced_count?: number;
  mfa_required?: boolean;
}

/**
 * Call the Garmin microservice
 */
async function callGarminService(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: object
): Promise<any> {
  const url = `${GARMIN_SERVICE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": GARMIN_SERVICE_SECRET,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({ detail: "Unknown error" }));

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}`);
    }

    return data;
  } catch (error: any) {
    console.error(`[Garmin Service] Error calling ${endpoint}:`, error.message);
    throw error;
  }
}

/**
 * Get Garmin connection status for a user
 */
export async function getGarminStatus(userId: number): Promise<{
  connected: boolean;
  email?: string;
  lastSync?: Date;
  displayName?: string;
}> {
  const db = await getDb();
  if (!db) {
    return { connected: false };
  }

  // Check local database first
  const tokens = await db
    .select()
    .from(garminTokens)
    .where(eq(garminTokens.userId, userId))
    .limit(1);

  if (!tokens.length) {
    return { connected: false };
  }

  // Try to get status from microservice
  try {
    const status = await callGarminService(`/auth/status/${userId}`);
    return {
      connected: status.connected,
      email: status.email || tokens[0].garminEmail || undefined,
      lastSync: tokens[0].lastSyncAt || undefined,
      displayName: status.display_name,
    };
  } catch {
    // Fallback to local data if microservice is unavailable
    return {
      connected: true,
      email: tokens[0].garminEmail || undefined,
      lastSync: tokens[0].lastSyncAt || undefined,
    };
  }
}

/**
 * Check if there's a pending MFA session for a user
 */
export async function getMfaStatus(userId: number): Promise<{
  pending: boolean;
  remainingSeconds: number;
}> {
  try {
    const result = await callGarminService(`/auth/mfa-status/${userId}`);
    return {
      pending: result.pending || false,
      remainingSeconds: result.remaining_seconds || 0,
    };
  } catch {
    return { pending: false, remainingSeconds: 0 };
  }
}

/**
 * Connect to Garmin with email/password via microservice
 * Returns mfaRequired=true if MFA is needed (call completeMfa next)
 */
export async function connectGarmin(
  userId: number,
  email: string,
  password: string
): Promise<{ success: boolean; mfaRequired?: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // Call microservice to authenticate
    const result = await callGarminService("/auth/login", "POST", {
      user_id: String(userId),
      email,
      password,
    });

    // Check if MFA is required
    if (result.mfa_required) {
      return { 
        success: false, 
        mfaRequired: true,
        error: result.message || "È richiesta l'autenticazione a due fattori (MFA)"
      };
    }

    if (!result.success) {
      return { success: false, error: result.message || "Authentication failed" };
    }

    // Store connection info in local database
    await db.insert(garminTokens).values({
      userId,
      garminEmail: email,
      oauth1Token: JSON.stringify({ 
        connected: true, 
        service_user_id: String(userId),
        connected_at: new Date().toISOString()
      }),
      oauth2Token: null,
      tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }).onConflictDoUpdate({
      target: garminTokens.userId,
      set: {
        garminEmail: email,
        oauth1Token: JSON.stringify({ 
          connected: true, 
          service_user_id: String(userId),
          connected_at: new Date().toISOString()
        }),
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    });

    // Update profile
    await db
      .update(swimmerProfiles)
      .set({ garminConnected: true })
      .where(eq(swimmerProfiles.userId, userId));

    return { success: true };
  } catch (error: any) {
    console.error("[Garmin] Connection failed:", error);
    return { 
      success: false, 
      error: error.message || "Connection failed. Check your credentials." 
    };
  }
}

/**
 * Complete MFA authentication with the code received via email
 */
export async function completeMfa(
  userId: number,
  mfaCode: string,
  email: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }

  try {
    // Call microservice to complete MFA
    const result = await callGarminService("/auth/mfa", "POST", {
      user_id: String(userId),
      mfa_code: mfaCode,
    });

    if (!result.success) {
      return { success: false, error: result.message || "MFA verification failed" };
    }

    // Store connection info in local database
    await db.insert(garminTokens).values({
      userId,
      garminEmail: email,
      oauth1Token: JSON.stringify({ 
        connected: true, 
        service_user_id: String(userId),
        connected_at: new Date().toISOString(),
        mfa_completed: true
      }),
      oauth2Token: null,
      tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }).onConflictDoUpdate({
      target: garminTokens.userId,
      set: {
        garminEmail: email,
        oauth1Token: JSON.stringify({ 
          connected: true, 
          service_user_id: String(userId),
          connected_at: new Date().toISOString(),
          mfa_completed: true
        }),
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    });

    // Update profile
    await db
      .update(swimmerProfiles)
      .set({ garminConnected: true })
      .where(eq(swimmerProfiles.userId, userId));

    return { success: true };
  } catch (error: any) {
    console.error("[Garmin] MFA completion failed:", error);
    return { 
      success: false, 
      error: error.message || "MFA verification failed" 
    };
  }
}

/**
 * Disconnect Garmin account
 */
export async function disconnectGarmin(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  try {
    // Call microservice to logout
    try {
      await callGarminService(`/auth/logout?user_id=${userId}`, "POST");
    } catch {
      // Continue even if microservice fails
    }

    // Remove from local database
    await db.delete(garminTokens).where(eq(garminTokens.userId, userId));
    await db
      .update(swimmerProfiles)
      .set({ garminConnected: false })
      .where(eq(swimmerProfiles.userId, userId));
    
    return true;
  } catch (error) {
    console.error("[Garmin] Disconnect failed:", error);
    return false;
  }
}

/**
 * Calculate XP for a swimming activity
 */
function calculateActivityXp(activity: GarminServiceActivity): number {
  let xp = 0;
  
  // Base XP: 1 XP per 100 meters
  xp += Math.floor(activity.distance_meters / 100);
  
  // Bonus for session completion
  xp += 50;
  
  // Bonus for longer sessions (over 3km)
  if (activity.distance_meters >= 3000) {
    xp += 25;
  }
  
  // Bonus for very long sessions (over 4km)
  if (activity.distance_meters >= 4000) {
    xp += 25;
  }
  
  // Bonus for open water swimming
  if (activity.is_open_water) {
    xp += 50;
  }
  
  return xp;
}

/**
 * Sync swimming activities from Garmin Connect via microservice
 */
export async function syncGarminActivities(
  userId: number,
  daysBack: number = 30
): Promise<{ synced: number; newXp: number; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { synced: 0, newXp: 0, error: "Database not available" };
  }

  // Check if user has Garmin connected
  const tokens = await db
    .select()
    .from(garminTokens)
    .where(eq(garminTokens.userId, userId))
    .limit(1);

  if (!tokens.length) {
    return { synced: 0, newXp: 0, error: "Garmin non collegato" };
  }

  try {
    // Call microservice to sync activities
    const result: GarminServiceResponse = await callGarminService("/sync", "POST", {
      user_id: String(userId),
      days_back: daysBack,
    });

    if (!result.success || !result.activities) {
      return { synced: 0, newXp: 0, error: result.message || "Sync failed" };
    }

    let syncedCount = 0;
    let totalNewXp = 0;

    // Get user's profile
    const profiles = await db
      .select()
      .from(swimmerProfiles)
      .where(eq(swimmerProfiles.userId, userId))
      .limit(1);

    const profile = profiles[0];
    if (!profile) {
      return { synced: 0, newXp: 0, error: "Profile not found" };
    }

    // Process each activity
    for (const activity of result.activities) {
      // Check if activity already exists
      const existing = await db
        .select()
        .from(swimmingActivities)
        .where(
          and(
            eq(swimmingActivities.userId, userId),
            eq(swimmingActivities.garminActivityId, activity.activity_id)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        continue; // Skip already synced activities
      }

      // Parse activity date
      const activityDate = new Date(activity.start_time);

      // Calculate XP for this activity
      const activityXp = calculateActivityXp(activity);

      // Insert new activity
      await db.insert(swimmingActivities).values({
        userId,
        garminActivityId: activity.activity_id,
        activityDate,
        distanceMeters: activity.distance_meters,
        durationSeconds: activity.duration_seconds,
        poolLengthMeters: activity.pool_length || 25,
        strokeType: activity.stroke_type as "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed",
        avgPacePer100m: activity.avg_pace_per_100m,
        calories: activity.calories,
        avgHeartRate: activity.avg_heart_rate,
        maxHeartRate: activity.max_heart_rate,
        swolfScore: activity.swolf_score,
        lapsCount: activity.laps_count,
        isOpenWater: activity.is_open_water,
        xpEarned: activityXp,
      });

      totalNewXp += activityXp;

      // Record XP transaction
      await db.insert(xpTransactions).values({
        userId,
        amount: activityXp,
        reason: "activity",
        description: `Attività: ${activity.activity_name} - ${Math.round(activity.distance_meters)}m`,
      });

      syncedCount++;
    }

    // Update profile totals
    if (syncedCount > 0) {
      const newTotalXp = (profile.totalXp || 0) + totalNewXp;
      const newTotalDistance = (profile.totalDistanceMeters || 0) + 
        result.activities.reduce((sum, a) => sum + a.distance_meters, 0);
      const newTotalTime = (profile.totalTimeSeconds || 0) + 
        result.activities.reduce((sum, a) => sum + a.duration_seconds, 0);
      const newTotalSessions = (profile.totalSessions || 0) + syncedCount;

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

      // Calculate open water stats
      const newTotalOpenWaterSessions = (profile.totalOpenWaterSessions || 0) + 
        result.activities.filter(a => a.is_open_water).length;
      const newTotalOpenWaterDistance = (profile.totalOpenWaterMeters || 0) + 
        result.activities.filter(a => a.is_open_water).reduce((sum, a) => sum + a.distance_meters, 0);

      // Update profile with open water stats
      await db
        .update(swimmerProfiles)
        .set({
          totalOpenWaterSessions: newTotalOpenWaterSessions,
          totalOpenWaterMeters: newTotalOpenWaterDistance,
        })
        .where(eq(swimmerProfiles.userId, userId));

      // Get longest session distance for badge checking
      const longestActivity = await db
        .select()
        .from(swimmingActivities)
        .where(eq(swimmingActivities.userId, userId))
        .orderBy(desc(swimmingActivities.distanceMeters))
        .limit(1);
      const longestSessionDistance = longestActivity[0]?.distanceMeters || 0;

      // Check and award badges
      await checkAndAwardBadges(userId, {
        totalDistance: newTotalDistance,
        totalSessions: newTotalSessions,
        totalXp: newTotalXp,
        level: newLevel,
        totalTime: newTotalTime,
        totalOpenWaterSessions: newTotalOpenWaterSessions,
        totalOpenWaterDistance: newTotalOpenWaterDistance,
        longestSessionDistance: longestSessionDistance,
      });

      // Auto-update challenge progress for active challenges
      await updateActiveChallengesProgress(userId);
    }

    // Update last sync time
    await db
      .update(garminTokens)
      .set({ lastSyncAt: new Date() })
      .where(eq(garminTokens.userId, userId));

    return { synced: syncedCount, newXp: totalNewXp };
  } catch (error: any) {
    console.error("[Garmin] Sync failed:", error);
    return { synced: 0, newXp: 0, error: error.message || "Sync failed" };
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

/**
 * Check and award badges based on achievements
 */
async function checkAndAwardBadges(
  userId: number,
  stats: {
    totalDistance: number;
    totalSessions: number;
    totalXp: number;
    level: number;
    totalTime?: number;
    totalOpenWaterSessions?: number;
    totalOpenWaterDistance?: number;
    longestSessionDistance?: number;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get all badge definitions
  const badges = await db.select().from(badgeDefinitions).where(eq(badgeDefinitions.isActive, true));

  // Get user's existing badges
  const existingBadges = await db
    .select()
    .from(userBadges)
    .where(eq(userBadges.userId, userId));

  const existingBadgeIds = new Set(existingBadges.map(b => b.badgeId));

  // Get longest session distance for single_session_distance_km badges
  if (!stats.longestSessionDistance) {
    const activities = await db
      .select()
      .from(swimmingActivities)
      .where(eq(swimmingActivities.userId, userId))
      .orderBy(desc(swimmingActivities.distanceMeters))
      .limit(1);
    stats.longestSessionDistance = activities[0]?.distanceMeters || 0;
  }

  // Check each badge
  for (const badge of badges) {
    if (existingBadgeIds.has(badge.id)) continue;

    let earned = false;

    // Parse requirement
    const reqType = badge.requirementType;
    const reqValue = badge.requirementValue;
    
    // Check based on requirement type
    switch (reqType) {
      case "total_distance_km":
        if (stats.totalDistance >= reqValue * 1000) {
          earned = true;
        }
        break;
      case "single_session_distance_km":
        if (stats.longestSessionDistance && stats.longestSessionDistance >= reqValue * 1000) {
          earned = true;
        }
        break;
      case "total_sessions":
        if (stats.totalSessions >= reqValue) {
          earned = true;
        }
        break;
      case "total_time_hours":
        if (stats.totalTime && stats.totalTime >= reqValue * 3600) {
          earned = true;
        }
        break;
      case "total_open_water_sessions":
        if (stats.totalOpenWaterSessions && stats.totalOpenWaterSessions >= reqValue) {
          earned = true;
        }
        break;
      case "total_open_water_distance_km":
        if (stats.totalOpenWaterDistance && stats.totalOpenWaterDistance >= reqValue * 1000) {
          earned = true;
        }
        break;
      case "level":
        if (stats.level >= reqValue) {
          earned = true;
        }
        break;
      case "total_xp":
        if (stats.totalXp >= reqValue) {
          earned = true;
        }
        break;
      case "manual":
        // Manual badges are not auto-awarded
        break;
    }

    if (earned) {
      await db.insert(userBadges).values({
        userId,
        badgeId: badge.id,
      });
    }
  }
}

/**
 * Get user's swimming activities
 */
export async function getUserActivities(
  userId: number,
  limit: number = 50
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const activities = await db
    .select()
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId))
    .orderBy(desc(swimmingActivities.activityDate))
    .limit(limit);

  return activities;
}

/**
 * Get user's personal records
 */
export async function getPersonalRecords(userId: number): Promise<{
  longestSession: number;
  fastestPace100m: number;
  mostDistanceWeek: number;
}> {
  const db = await getDb();
  if (!db) {
    return { longestSession: 0, fastestPace100m: 0, mostDistanceWeek: 0 };
  }

  const activities = await db
    .select()
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId));

  let longestSession = 0;
  let fastestPace100m = Infinity;

  for (const activity of activities) {
    if (activity.distanceMeters > longestSession) {
      longestSession = activity.distanceMeters;
    }
    if (activity.avgPacePer100m && activity.avgPacePer100m < fastestPace100m) {
      fastestPace100m = activity.avgPacePer100m;
    }
  }

  // Calculate most distance in a week
  const weekDistances: { [key: string]: number } = {};
  for (const activity of activities) {
    const date = new Date(activity.activityDate);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().split("T")[0];
    weekDistances[weekKey] = (weekDistances[weekKey] || 0) + activity.distanceMeters;
  }
  const mostDistanceWeek = Math.max(0, ...Object.values(weekDistances));

  return {
    longestSession,
    fastestPace100m: fastestPace100m === Infinity ? 0 : fastestPace100m,
    mostDistanceWeek,
  };
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

    const challenges = result.rows as any[];

    // Update progress for each challenge
    for (const challenge of challenges) {
      const challengesDb = await import("./db_challenges");
      await challengesDb.calculateChallengeProgress(challenge.id);
    }

    console.log(`[Garmin] Updated progress for ${challenges.length} active challenges for user ${userId}`);
  } catch (error) {
    console.error("[Garmin] Error updating challenge progress:", error);
  }
}
