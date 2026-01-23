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
 */

import { getDb } from "./db";
import { garminTokens, swimmingActivities, swimmerProfiles, xpTransactions, badgeDefinitions, userBadges } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return await response.json();
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
 * Connect to Garmin with email/password via microservice
 */
export async function connectGarmin(
  userId: number,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
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
    }).onDuplicateKeyUpdate({
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
      const newSessionCount = (profile.totalSessions || 0) + syncedCount;

      // Calculate new level
      const newLevel = calculateLevel(newTotalXp);

      await db
        .update(swimmerProfiles)
        .set({
          totalXp: newTotalXp,
          level: newLevel,
          totalDistanceMeters: newTotalDistance,
          totalTimeSeconds: newTotalTime,
          totalSessions: newSessionCount,
        })
        .where(eq(swimmerProfiles.id, profile.id));

      // Check and award badges
      await checkAndAwardBadges(userId, {
        totalDistance: newTotalDistance,
        totalTime: newTotalTime,
        sessionsCount: newSessionCount,
        level: newLevel,
        hasOpenWater: result.activities.some(a => a.is_open_water),
      });
    }

    // Update last sync timestamp
    await db
      .update(garminTokens)
      .set({ lastSyncAt: new Date() })
      .where(eq(garminTokens.userId, userId));

    return { 
      synced: syncedCount, 
      newXp: totalNewXp,
    };
  } catch (error: any) {
    console.error("[Garmin] Sync failed:", error);
    
    // Check if it's an auth error
    if (error.message?.includes("401") || error.message?.includes("expired")) {
      // Clear local connection
      await db.delete(garminTokens).where(eq(garminTokens.userId, userId));
      await db
        .update(swimmerProfiles)
        .set({ garminConnected: false })
        .where(eq(swimmerProfiles.userId, userId));
      
      return { synced: 0, newXp: 0, error: "Sessione Garmin scaduta. Ricollegati." };
    }
    
    return { synced: 0, newXp: 0, error: error.message || "Sync failed" };
  }
}

/**
 * Calculate level from total XP
 */
function calculateLevel(totalXp: number): number {
  // Level thresholds (exponential growth)
  const thresholds = [
    0,      // Level 1: 0 XP
    500,    // Level 2: 500 XP
    1200,   // Level 3: 1,200 XP
    2100,   // Level 4: 2,100 XP
    3200,   // Level 5: 3,200 XP
    4500,   // Level 6: 4,500 XP
    6000,   // Level 7: 6,000 XP
    7700,   // Level 8: 7,700 XP
    9600,   // Level 9: 9,600 XP
    11700,  // Level 10: 11,700 XP
    14000,  // Level 11: 14,000 XP
    16500,  // Level 12: 16,500 XP
    19200,  // Level 13: 19,200 XP
    22100,  // Level 14: 22,100 XP
    25200,  // Level 15: 25,200 XP
    28500,  // Level 16: 28,500 XP
    32000,  // Level 17: 32,000 XP
    35700,  // Level 18: 35,700 XP
    39600,  // Level 19: 39,600 XP
    43700,  // Level 20: 43,700 XP (Poseidone)
  ];

  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (totalXp >= thresholds[i]) {
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
    totalTime: number;
    sessionsCount: number;
    level: number;
    hasOpenWater: boolean;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Get all badges
  const allBadges = await db.select().from(badgeDefinitions);
  
  // Get user's existing badges
  const existingBadges = await db
    .select()
    .from(userBadges)
    .where(eq(userBadges.userId, userId));
  
  const existingBadgeIds = new Set(existingBadges.map(b => b.badgeId));

  // Check each badge
  for (const badge of allBadges) {
    if (existingBadgeIds.has(badge.id)) continue;

    let earned = false;
    const requirement = badge.requirementValue || 0;

    switch (badge.category) {
      case "distance":
        earned = stats.totalDistance >= requirement;
        break;
      case "consistency":
        earned = stats.sessionsCount >= requirement;
        break;
      case "milestone":
        if (badge.code?.includes("level")) {
          const levelReq = parseInt(badge.code.replace("level_", "")) || 0;
          earned = stats.level >= levelReq;
        } else if (badge.code?.includes("hours")) {
          const hoursReq = parseInt(badge.code.replace("hours_", "")) || 0;
          earned = stats.totalTime >= hoursReq * 3600;
        }
        break;
      case "open_water":
        if (badge.code === "first_open_water") {
          earned = stats.hasOpenWater;
        }
        break;
    }

    if (earned) {
      await db.insert(userBadges).values({
        userId,
        badgeId: badge.id,
        earnedAt: new Date(),
      });

      // Award XP for badge
      if (badge.xpReward > 0) {
        await db.insert(xpTransactions).values({
          userId,
          amount: badge.xpReward,
          reason: "badge",
          referenceId: badge.id,
          description: `Badge sbloccato: ${badge.name}`,
        });
      }
    }
  }
}

/**
 * Get swimming activities for a user
 */
export async function getSwimmingActivities(
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
