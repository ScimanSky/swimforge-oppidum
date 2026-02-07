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
import {
  garminTokens,
  swimmingActivities,
  swimmerProfiles,
  xpTransactions,
  badgeDefinitions,
  userBadges,
  garminActivityLaps,
  garminActivityLengths,
} from "../drizzle/schema";
import { eq, and, desc, sql, isNull } from "drizzle-orm";
import { updateUserProfileBadge } from "./db_profile_badges";
import { decryptIfNeeded, encryptForStorage } from "./lib/tokenCrypto";
import { invalidateUserCache } from "./lib/cache";

// Garmin microservice configuration
const GARMIN_SERVICE_URL = process.env.GARMIN_SERVICE_URL || "http://localhost:8000";
const GARMIN_SERVICE_SECRET = process.env.GARMIN_SERVICE_SECRET;
if (!GARMIN_SERVICE_SECRET) {
  throw new Error("GARMIN_SERVICE_SECRET is required");
}

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
  avg_stroke_distance?: number;  // cm per bracciata
  avg_strokes?: number;  // bracciate per vasca
  avg_stroke_cadence?: number;  // bracciate per minuto
  training_effect?: number;  // 0-50 (moltiplicato per 10)
  anaerobic_training_effect?: number;  // 0-50
  vo2_max_value?: number;  // ml/kg/min
  recovery_time_hours?: number;  // ore
  resting_heart_rate?: number;  // bpm
  avg_stress?: number;  // 0-100
  is_open_water: boolean;
  hr_zone_1_seconds?: number;
  hr_zone_2_seconds?: number;
  hr_zone_3_seconds?: number;
  hr_zone_4_seconds?: number;
  hr_zone_5_seconds?: number;
  raw_data?: unknown;
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

async function callGarminServiceWithUser(
  endpoint: string,
  userId: number,
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
        "user-id": userId.toString(),
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

async function ensureGarminSessionFromDb(userId: number): Promise<boolean> {
  try {
    const status = await callGarminService(`/auth/status/${userId}`);
    if (status?.connected) return true;
  } catch {
    // ignore and try restore
  }

  const db = await getDb();
  if (!db) return false;

  const tokens = await db
    .select()
    .from(garminTokens)
    .where(eq(garminTokens.userId, userId))
    .limit(1);

  const stored = tokens[0]?.oauth1Token;
  if (!stored) return false;

  const decrypted = decryptIfNeeded(stored);
  if (!decrypted.startsWith("garth:")) {
    return false;
  }
  const tokenData = decrypted.slice("garth:".length);
  if (!tokenData) return false;

  try {
    const result = await callGarminService("/auth/restore", "POST", {
      user_id: String(userId),
      token_data: tokenData,
    });
    return Boolean(result?.success);
  } catch (error) {
    console.warn(`[Garmin] Failed to restore session for user ${userId}:`, error);
    return false;
  }
}

export async function getGarminActivityFullDetails(
  userId: number,
  garminActivityId: string
): Promise<any | null> {
  try {
    const restored = await ensureGarminSessionFromDb(userId);
    if (!restored) {
      return null;
    }
    return await callGarminServiceWithUser(
      `/activity/${garminActivityId}/full`,
      userId
    );
  } catch (error) {
    console.warn(
      `[Garmin] Could not fetch full details for activity ${garminActivityId}:`,
      error
    );
    return null;
  }
}

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toInt = (value: any) => {
  const num = toNumber(value);
  return num !== null ? Math.round(num) : null;
};

const pickFirst = (obj: any, keys: string[]) => {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
};

const pickFirstFromSources = (sources: any[], keys: string[]) => {
  for (const source of sources) {
    if (!source) continue;
    const value = pickFirst(source, keys);
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
};

const normalizeStrokeType = (value: any) => {
  if (!value) return null;
  const raw = String(value).toLowerCase();
  if (raw.includes("free") || raw.includes("stile") || raw.includes("crawl")) return "freestyle";
  if (raw.includes("back") || raw.includes("dorso")) return "backstroke";
  if (raw.includes("breast") || raw.includes("rana")) return "breaststroke";
  if (raw.includes("butter") || raw.includes("farf")) return "butterfly";
  if (raw.includes("mix")) return "mixed";
  return "mixed";
};

const toTimestamp = (value: any) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeStrokeDistanceCm = (value: any) => {
  const num = toNumber(value);
  if (!num) return null;
  return num < 10 ? Math.round(num * 100) : Math.round(num);
};

const normalizeTrainingEffect = (value: any) => {
  const num = toNumber(value);
  if (num === null) return null;
  return num <= 10 ? Math.round(num * 10) : Math.round(num);
};

const normalizeRecoveryHours = (value: any) => {
  const num = toNumber(value);
  if (num === null) return null;
  return num > 48 ? Math.round(num / 60) : Math.round(num);
};

const normalizeHrZones = (zones: any) => {
  if (!zones) return null;
  const map: Record<string, number> = {
    hrZone1Seconds: 0,
    hrZone2Seconds: 0,
    hrZone3Seconds: 0,
    hrZone4Seconds: 0,
    hrZone5Seconds: 0,
  };

  if (Array.isArray(zones)) {
    zones.forEach((zone) => {
      const zoneNum = zone?.zoneNumber ?? zone?.zone ?? zone?.zoneIndex;
      const seconds = toNumber(
        pickFirst(zone, ["secsInZone", "seconds", "timeInSeconds", "value"])
      ) ?? 0;
      if (zoneNum && zoneNum >= 1 && zoneNum <= 5) {
        map[`hrZone${zoneNum}Seconds`] = Math.round(seconds);
      }
    });
  } else if (typeof zones === "object") {
    const zoneValues = [
      zones.zone1TimeInSeconds ?? zones.zone1 ?? zones.zone1Seconds,
      zones.zone2TimeInSeconds ?? zones.zone2 ?? zones.zone2Seconds,
      zones.zone3TimeInSeconds ?? zones.zone3 ?? zones.zone3Seconds,
      zones.zone4TimeInSeconds ?? zones.zone4 ?? zones.zone4Seconds,
      zones.zone5TimeInSeconds ?? zones.zone5 ?? zones.zone5Seconds,
    ];
    zoneValues.forEach((value, index) => {
      map[`hrZone${index + 1}Seconds`] = Math.round(toNumber(value) ?? 0);
    });
  }

  return map;
};

export function extractGarminAdvancedFields(fullDetails: any) {
  const activity = fullDetails?.activity ?? null;
  const summary = activity?.summaryDTO ?? fullDetails?.summaryDTO ?? null;
  const details = fullDetails?.details ?? null;

  const sources = [details, summary, activity, fullDetails].filter(Boolean);

  const strokeType = normalizeStrokeType(
    pickFirstFromSources(sources, ["strokeType", "swimStrokeType", "avgStrokeType"])
  );
  const hrZones = normalizeHrZones(fullDetails?.hr_zones);

  return {
    avgSwolf: toNumber(
      pickFirstFromSources(sources, ["averageSwolf", "avgSwolf", "averageSWOLF"])
    ),
    avgStrokeDistance: normalizeStrokeDistanceCm(
      pickFirstFromSources(sources, ["avgStrokeDistance", "averageStrokeDistance"])
    ),
    avgStrokes: toNumber(
      pickFirstFromSources(sources, ["avgStrokes", "averageStrokes"])
    ),
    avgStrokeCadence: toNumber(
      pickFirstFromSources(sources, [
        "avgStrokeCadenceRpm",
        "avgStrokeCadence",
        "averageSwimCadence",
      ])
    ),
    trainingEffect: normalizeTrainingEffect(
      pickFirstFromSources(sources, ["aerobicTrainingEffect", "trainingEffect"])
    ),
    anaerobicTrainingEffect: normalizeTrainingEffect(
      pickFirstFromSources(sources, ["anaerobicTrainingEffect"])
    ),
    vo2MaxValue: toNumber(
      pickFirstFromSources(sources, ["vO2MaxValue", "vo2MaxValue"])
    ),
    recoveryTimeHours: normalizeRecoveryHours(
      pickFirstFromSources(sources, ["recoveryTime", "recoveryTimeMinutes"])
    ),
    avgStress: toNumber(
      pickFirstFromSources(sources, ["averageStress", "avgStress"])
    ),
    avgHeartRate: toNumber(
      pickFirstFromSources(sources, ["averageHR", "avgHeartRate"])
    ),
    maxHeartRate: toNumber(
      pickFirstFromSources(sources, ["maxHR", "maxHeartRate"])
    ),
    restingHeartRate: toNumber(
      pickFirstFromSources(sources, ["restingHeartRate"])
    ),
    lapsCount: toNumber(
      pickFirstFromSources(sources, [
        "lapCount",
        "totalLaps",
        "numLaps",
        "numberOfActiveLengths",
      ])
    ),
    poolLengthMeters: toNumber(
      pickFirstFromSources(sources, ["poolLength", "poolLengthMeters"])
    ),
    strokeType,
    hrZones,
  };
}

export async function persistGarminLapDetails(
  db: Awaited<ReturnType<typeof getDb>>,
  activityId: number,
  fullDetails: any
) {
  if (!db) return;
  const lapDtos = Array.isArray(fullDetails?.splits?.lapDTOs)
    ? fullDetails.splits.lapDTOs
    : Array.isArray(fullDetails?.splits)
    ? fullDetails.splits
    : [];

  if (lapDtos.length === 0) {
    return;
  }

  // Reset existing laps/lengths for this activity
  await db.delete(garminActivityLengths).where(eq(garminActivityLengths.activityId, activityId));
  await db.delete(garminActivityLaps).where(eq(garminActivityLaps.activityId, activityId));

  const lapRecords = lapDtos.map((lap: any, index: number) => {
    const lengthDTOs = Array.isArray(lap?.lengthDTOs) ? lap.lengthDTOs : [];
    const strokeCounts: Record<string, number> = {};
    lengthDTOs.forEach((length: any) => {
      const strokeKey = normalizeStrokeType(
        length?.swimStroke ?? length?.strokeType ?? length?.stroke
      );
      if (!strokeKey) return;
      strokeCounts[strokeKey] = (strokeCounts[strokeKey] ?? 0) + 1;
    });
    const dominantStroke =
      Object.entries(strokeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      activityId,
      lapIndex: toInt(lap?.lapIndex) ?? index + 1,
      distanceMeters: toInt(lap?.distance),
      durationSeconds: toNumber(lap?.duration),
      movingDurationSeconds: toNumber(lap?.movingDuration),
      elapsedDurationSeconds: toNumber(lap?.elapsedDuration),
      averageSpeedMps: toNumber(lap?.averageSpeed),
      maxSpeedMps: toNumber(lap?.maxSpeed),
      averageMovingSpeedMps: toNumber(lap?.averageMovingSpeed),
      averageSwolf: toInt(lap?.averageSWOLF ?? lap?.averageSwolf),
      averageStrokes: toNumber(lap?.averageStrokes ?? lap?.avgStrokes),
      totalNumberOfStrokes: toInt(lap?.totalNumberOfStrokes),
      averageSwimCadence: toInt(lap?.averageSwimCadence),
      calories: toInt(lap?.calories),
      avgHeartRate: toInt(lap?.averageHR ?? lap?.avgHeartRate),
      maxHeartRate: toInt(lap?.maxHR ?? lap?.maxHeartRate),
      numberOfActiveLengths: toInt(lap?.numberOfActiveLengths),
      strokeType: dominantStroke,
      startTimeGmt: toTimestamp(lap?.startTimeGMT),
    };
  });

  const insertedLaps = await db
    .insert(garminActivityLaps)
    .values(lapRecords)
    .returning({ id: garminActivityLaps.id, lapIndex: garminActivityLaps.lapIndex });

  const lapIdByIndex = new Map<number, number>();
  insertedLaps.forEach((lap) => {
    if (lap.lapIndex !== null && lap.lapIndex !== undefined) {
      lapIdByIndex.set(lap.lapIndex, lap.id);
    }
  });

  const lengthRecords: Array<{
    activityId: number;
    lapId: number;
    lengthIndex: number;
    distanceMeters?: number | null;
    durationSeconds?: number | null;
    averageSpeedMps?: number | null;
    maxSpeedMps?: number | null;
    averageSwolf?: number | null;
    totalNumberOfStrokes?: number | null;
    avgHeartRate?: number | null;
    maxHeartRate?: number | null;
    strokeType?: string | null;
    startTimeGmt?: Date | null;
  }> = [];

  lapDtos.forEach((lap: any, index: number) => {
    const lapIndex = toInt(lap?.lapIndex) ?? index + 1;
    const lapId = lapIdByIndex.get(lapIndex);
    if (!lapId) return;

    const lengthDTOs = Array.isArray(lap?.lengthDTOs) ? lap.lengthDTOs : [];
    lengthDTOs.forEach((length: any, lengthIndex: number) => {
      const strokeKey = normalizeStrokeType(
        length?.swimStroke ?? length?.strokeType ?? length?.stroke
      );
      lengthRecords.push({
        activityId,
        lapId,
        lengthIndex: toInt(length?.lengthIndex) ?? lengthIndex + 1,
        distanceMeters: toInt(length?.distance),
        durationSeconds: toNumber(length?.duration),
        averageSpeedMps: toNumber(length?.averageSpeed),
        maxSpeedMps: toNumber(length?.maxSpeed),
        averageSwolf: toInt(length?.averageSWOLF ?? length?.averageSwolf),
        totalNumberOfStrokes: toInt(length?.totalNumberOfStrokes),
        avgHeartRate: toInt(length?.averageHR ?? length?.avgHeartRate),
        maxHeartRate: toInt(length?.maxHR ?? length?.maxHeartRate),
        strokeType: strokeKey,
        startTimeGmt: toTimestamp(length?.startTimeGMT),
      });
    });
  });

  if (lengthRecords.length > 0) {
    await db.insert(garminActivityLengths).values(lengthRecords);
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

    const tokenPayload = result.token_data ? `garth:${result.token_data}` : null;

    // Store connection info in local database
    await db.insert(garminTokens).values({
      userId,
      garminEmail: email,
      oauth1Token: tokenPayload
        ? encryptForStorage(tokenPayload)
        : encryptForStorage(JSON.stringify({ 
            connected: true, 
            service_user_id: String(userId),
            connected_at: new Date().toISOString()
          })),
      oauth2Token: null,
      tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }).onConflictDoUpdate({
      target: garminTokens.userId,
      set: {
        garminEmail: email,
        oauth1Token: tokenPayload
          ? encryptForStorage(tokenPayload)
          : encryptForStorage(JSON.stringify({ 
              connected: true, 
              service_user_id: String(userId),
              connected_at: new Date().toISOString()
            })),
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

    const tokenPayload = result.token_data ? `garth:${result.token_data}` : null;

    // Store connection info in local database
    await db.insert(garminTokens).values({
      userId,
      garminEmail: email,
      oauth1Token: tokenPayload
        ? encryptForStorage(tokenPayload)
        : encryptForStorage(JSON.stringify({ 
            connected: true, 
            service_user_id: String(userId),
            connected_at: new Date().toISOString(),
            mfa_completed: true
          })),
      oauth2Token: null,
      tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }).onConflictDoUpdate({
      target: garminTokens.userId,
      set: {
        garminEmail: email,
        oauth1Token: tokenPayload
          ? encryptForStorage(tokenPayload)
          : encryptForStorage(JSON.stringify({ 
              connected: true, 
              service_user_id: String(userId),
              connected_at: new Date().toISOString(),
              mfa_completed: true
            })),
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
 * Auto-sync Garmin activities on login (if last sync > interval hours)
 */
export async function autoSyncGarmin(
  userId: number,
  options: { force?: boolean } = {}
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const [profile] = await db
      .select()
      .from(swimmerProfiles)
      .where(eq(swimmerProfiles.userId, userId))
      .limit(1);

    if (!profile || !profile.garminConnected) return;

    const now = new Date();
    const lastSync = profile.lastGarminSyncAt;
    let syncIntervalHours = Number.parseFloat(
      process.env.GARMIN_AUTO_SYNC_INTERVAL_HOURS || "6"
    );
    if (!Number.isFinite(syncIntervalHours)) {
      syncIntervalHours = 6;
    }

    const shouldSync =
      options.force ||
      syncIntervalHours <= 0 ||
      !lastSync ||
      now.getTime() - new Date(lastSync).getTime() >
        syncIntervalHours * 60 * 60 * 1000;

    if (shouldSync) {
      console.log(`[Auto-Sync] Triggering Garmin sync for user ${userId}`);
      await syncGarminActivities(userId);
    } else {
      console.log(
        `[Auto-Sync] Skipping Garmin sync for user ${userId}, last synced ${Math.round(
          (now.getTime() - new Date(lastSync).getTime()) / (60 * 60 * 1000)
        )}h ago`
      );
    }
  } catch (error) {
    console.error(`[Auto-Sync] Garmin failed for user ${userId}:`, error);
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
    const restored = await ensureGarminSessionFromDb(userId);
    if (!restored) {
      return {
        synced: 0,
        newXp: 0,
        error: "Sessione Garmin non attiva. Ricollega Garmin Connect.",
      };
    }
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

    const enrichActivityDetails = async (params: {
      activityId: number;
      garminActivityId: string;
      currentStrokeType?: string | null;
      baseRawData?: Record<string, any> | null;
    }) => {
      const fullDetails = await getGarminActivityFullDetails(
        userId,
        params.garminActivityId
      );
      if (!fullDetails) return;

      const advanced = extractGarminAdvancedFields(fullDetails);
      const updates: Record<string, any> = {
        rawData: {
          ...(params.baseRawData ?? {}),
          garmin_details: fullDetails,
        },
      };

      const setIfDefined = (key: string, value: any) => {
        if (value === null || value === undefined) return;
        updates[key] = value;
      };

      const setIfDefinedInt = (key: string, value: any) => {
        if (value === null || value === undefined) return;
        updates[key] = Math.round(value);
      };

      setIfDefinedInt("avgSwolf", advanced.avgSwolf);
      setIfDefined("avgStrokeDistance", advanced.avgStrokeDistance);
      setIfDefinedInt("avgStrokes", advanced.avgStrokes);
      setIfDefinedInt("avgStrokeCadence", advanced.avgStrokeCadence);
      setIfDefinedInt("trainingEffect", advanced.trainingEffect);
      setIfDefinedInt("anaerobicTrainingEffect", advanced.anaerobicTrainingEffect);
      setIfDefinedInt("vo2MaxValue", advanced.vo2MaxValue);
      setIfDefinedInt("recoveryTimeHours", advanced.recoveryTimeHours);
      setIfDefinedInt("avgStress", advanced.avgStress);
      setIfDefinedInt("avgHeartRate", advanced.avgHeartRate);
      setIfDefinedInt("maxHeartRate", advanced.maxHeartRate);
      setIfDefinedInt("restingHeartRate", advanced.restingHeartRate);
      setIfDefinedInt("lapsCount", advanced.lapsCount);
      setIfDefinedInt("poolLengthMeters", advanced.poolLengthMeters);

      if (
        advanced.strokeType &&
        (!params.currentStrokeType || params.currentStrokeType === "mixed")
      ) {
        updates.strokeType = advanced.strokeType;
      }

      if (advanced.hrZones) {
        const hrValues = Object.values(advanced.hrZones);
        const hasZones = hrValues.some((value) => Number(value) > 0);
        if (hasZones) {
          setIfDefinedInt("hrZone1Seconds", advanced.hrZones.hrZone1Seconds);
          setIfDefinedInt("hrZone2Seconds", advanced.hrZones.hrZone2Seconds);
          setIfDefinedInt("hrZone3Seconds", advanced.hrZones.hrZone3Seconds);
          setIfDefinedInt("hrZone4Seconds", advanced.hrZones.hrZone4Seconds);
          setIfDefinedInt("hrZone5Seconds", advanced.hrZones.hrZone5Seconds);
        }
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(swimmingActivities)
          .set(updates)
          .where(eq(swimmingActivities.id, params.activityId));
      }

      await persistGarminLapDetails(db, params.activityId, fullDetails);
    };

    // Process each activity
    for (const activity of result.activities) {
      // Check if activity already exists (by Garmin ID)
      const existingGarmin = await db
        .select()
        .from(swimmingActivities)
        .where(
          and(
            eq(swimmingActivities.userId, userId),
            eq(swimmingActivities.garminActivityId, activity.activity_id)
          )
        )
        .limit(1);

      if (existingGarmin.length > 0) {
        const existing = existingGarmin[0];
        const existingRaw = (existing.rawData ?? {}) as Record<string, any>;
        const existingDetails = existingRaw.garmin_details;
        const hasSummary =
          Boolean(existingDetails?.activity?.summaryDTO ?? existingDetails?.summaryDTO);
        const hasAdvanced =
          Boolean(
            existing.avgSwolf ||
              existing.avgStrokeDistance ||
              existing.avgStrokes ||
              existing.avgStrokeCadence ||
              existing.trainingEffect ||
              existing.anaerobicTrainingEffect ||
              existing.avgHeartRate ||
              existing.hrZone1Seconds
          );

        const [existingLap] = await db
          .select({ id: garminActivityLaps.id })
          .from(garminActivityLaps)
          .where(eq(garminActivityLaps.activityId, existing.id))
          .limit(1);

        if (!existingLap && existingDetails) {
          try {
            await persistGarminLapDetails(db, existing.id, existingDetails);
          } catch (error) {
            console.warn(
              `[Garmin] Failed to persist laps for activity ${activity.activity_id}:`,
              error
            );
          }
        }

        if (!hasSummary || !hasAdvanced) {
          try {
            await enrichActivityDetails({
              activityId: existing.id,
              garminActivityId: activity.activity_id,
              currentStrokeType: existing.strokeType,
              baseRawData: existingRaw,
            });
          } catch (error) {
            console.warn(
              `[Garmin] Failed to enrich existing activity ${activity.activity_id}:`,
              error
            );
          }
        }

        continue; // Skip already synced activities
      }

      // Check for cross-platform duplicates (Strava)
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
            eq(swimmingActivities.activitySource, "strava")
          )
        )
        .limit(1);

      if (existingCrossPlatform) {
        console.log(`[Garmin] Activity ${activity.activity_id} is a duplicate of Strava activity ${existingCrossPlatform.id}, skipping`);
        continue;
      }

      // Calculate XP for this activity
      const activityXp = calculateActivityXp(activity);

      // Insert new activity
      const [inserted] = await db.insert(swimmingActivities).values({
        userId,
        garminActivityId: activity.activity_id,
        activitySource: "garmin",
        activityDate,
        distanceMeters: Math.round(activity.distance_meters),
        durationSeconds: Math.round(activity.duration_seconds),
        poolLengthMeters: Math.round(activity.pool_length || 25),
        strokeType: activity.stroke_type as "freestyle" | "backstroke" | "breaststroke" | "butterfly" | "mixed",
        avgPacePer100m: activity.avg_pace_per_100m ? Math.round(activity.avg_pace_per_100m) : undefined,
        calories: activity.calories ? Math.round(activity.calories) : undefined,
        avgHeartRate: activity.avg_heart_rate ? Math.round(activity.avg_heart_rate) : undefined,
        maxHeartRate: activity.max_heart_rate ? Math.round(activity.max_heart_rate) : undefined,
        avgSwolf: activity.swolf_score ? Math.round(activity.swolf_score) : undefined,
        lapsCount: activity.laps_count ? Math.round(activity.laps_count) : undefined,
        avgStrokeDistance: activity.avg_stroke_distance ? Math.round(activity.avg_stroke_distance * 100) / 100 : undefined,
        avgStrokes: activity.avg_strokes ? Math.round(activity.avg_strokes) : undefined,
        avgStrokeCadence: activity.avg_stroke_cadence ? Math.round(activity.avg_stroke_cadence) : undefined,
        trainingEffect: activity.training_effect ? Math.round(activity.training_effect * 10) / 10 : undefined,
        anaerobicTrainingEffect: activity.anaerobic_training_effect ? Math.round(activity.anaerobic_training_effect * 10) / 10 : undefined,
        vo2MaxValue: activity.vo2_max_value ? Math.round(activity.vo2_max_value) : undefined,
        recoveryTimeHours: activity.recovery_time_hours ? Math.round(activity.recovery_time_hours) : undefined,
        restingHeartRate: activity.resting_heart_rate ? Math.round(activity.resting_heart_rate) : undefined,
        avgStress: activity.avg_stress ? Math.round(activity.avg_stress) : undefined,
        isOpenWater: activity.is_open_water,
        hrZone1Seconds: activity.hr_zone_1_seconds ? Math.round(activity.hr_zone_1_seconds) : undefined,
        hrZone2Seconds: activity.hr_zone_2_seconds ? Math.round(activity.hr_zone_2_seconds) : undefined,
        hrZone3Seconds: activity.hr_zone_3_seconds ? Math.round(activity.hr_zone_3_seconds) : undefined,
        hrZone4Seconds: activity.hr_zone_4_seconds ? Math.round(activity.hr_zone_4_seconds) : undefined,
        hrZone5Seconds: activity.hr_zone_5_seconds ? Math.round(activity.hr_zone_5_seconds) : undefined,
        rawData: activity.raw_data ?? undefined,
        xpEarned: activityXp,
      }).returning({ id: swimmingActivities.id });

      if (inserted?.id) {
        try {
          await enrichActivityDetails({
            activityId: inserted.id,
            garminActivityId: activity.activity_id,
            currentStrokeType: activity.stroke_type,
            baseRawData: (activity.raw_data ?? {}) as Record<string, any>,
          });
        } catch (error) {
          console.warn(
            `[Garmin] Failed to enrich activity ${activity.activity_id}:`,
            error
          );
        }
      }

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
        longestSessionDistance,
      });

      // Update profile badge based on new XP
      await updateUserProfileBadge(userId, newTotalXp);

      // Check and award achievement badges
      const { checkAndAwardBadges: checkAchievementBadges } = await import("./badge_engine");
      (async () => {
        try {
          const newBadges = await checkAchievementBadges(userId);
          if (newBadges.length > 0) {
            console.log(`[Badge Engine] Awarded ${newBadges.length} new badges: ${newBadges.join(", ")}`);
          }
        } catch (error) {
          console.error(`[Badge Engine] Failed for user ${userId}:`, error);
        }
      })();

      // Auto-update challenge progress for active challenges
      await updateActiveChallengesProgress(userId);

      // Invalidate cached data for this user
      await invalidateUserCache(String(userId));
    }

    // Update last sync time
    await db
      .update(garminTokens)
      .set({ lastSyncAt: new Date() })
      .where(eq(garminTokens.userId, userId));

    // Update last_garmin_sync_at for auto-sync tracking
    await db
      .update(swimmerProfiles)
      .set({ lastGarminSyncAt: new Date() })
      .where(eq(swimmerProfiles.userId, userId));

    console.log(`[Garmin Sync] Updated last_garmin_sync_at for user ${userId}`);

    // Auto-migrate HR zones for activities that don't have them
    if (syncedCount > 0) {
      console.log(`[Garmin Sync] Starting automatic HR zones migration for ${syncedCount} new activities`);
      try {
        const migrationResult = await migrateHrZones(userId);
        console.log(`[Garmin Sync] HR zones migration result: ${migrationResult.message}`);
      } catch (error) {
        console.error(`[Garmin Sync] HR zones migration failed:`, error);
      }
    }

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

/**
 * Migrate HR zones data for existing activities
 * Fetches HR zones data from Garmin for activities that don't have it yet
 */
export async function migrateHrZones(userId: number): Promise<{
  success: boolean;
  message: string;
  updated: number;
  failed: number;
  total: number;
}> {
  const db = await getDb();
  if (!db) {
    return {
      success: false,
      message: "Database not available",
      updated: 0,
      failed: 0,
      total: 0,
    };
  }

  try {
    console.log(`[Garmin] Starting HR zones migration for user ${userId}`);

    // Get all activities without HR zones data
    const activitiesWithoutHR = await db
      .select()
      .from(swimmingActivities)
      .where(
        and(
          eq(swimmingActivities.userId, userId),
          isNull(swimmingActivities.hrZone1Seconds)
        )
      );

    if (activitiesWithoutHR.length === 0) {
      return {
        success: true,
        message: "All activities already have HR zones data",
        updated: 0,
        failed: 0,
        total: 0,
      };
    }

    console.log(`[Garmin] Found ${activitiesWithoutHR.length} activities without HR zones`);

    let updated = 0;
    let failed = 0;

    // Fetch HR zones data for each activity
    for (const activity of activitiesWithoutHR) {
      try {
        // Call Garmin Service to get HR zones data
        const response = await fetch(
          `${GARMIN_SERVICE_URL}/activity/${activity.garminActivityId}/hr-zones`,
          {
            headers: {
              "user-id": userId.toString(),
              "X-API-Key": GARMIN_SERVICE_SECRET,
            },
          }
        );

        if (!response.ok) {
          console.error(
            `[Garmin] Failed to fetch HR zones for activity ${activity.garminActivityId}: ${response.status}`
          );
          failed++;
          continue;
        }

        const hrZones = await response.json();

        // Fetch activity details (including SWOLF)
        let swolfScore = activity.avgSwolf; // Keep existing value if fetch fails
        try {
          const detailsResponse = await fetch(
            `${GARMIN_SERVICE_URL}/activity/${activity.garminActivityId}/details`,
            {
              headers: {
                "user-id": userId.toString(),
                "X-API-Key": GARMIN_SERVICE_SECRET,
              },
            }
          );
          
          if (detailsResponse.ok) {
            const details = await detailsResponse.json();
            if (details.swolf_score !== null && details.swolf_score !== undefined) {
              swolfScore = details.swolf_score;
            }
          }
        } catch (detailsError) {
          console.warn(
            `[Garmin] Could not fetch details for activity ${activity.garminActivityId}:`,
            detailsError
          );
        }

        // Update activity with HR zones data and SWOLF (round to integers)
        await db
          .update(swimmingActivities)
          .set({
            hrZone1Seconds: Math.round(hrZones.zone1 || 0),
            hrZone2Seconds: Math.round(hrZones.zone2 || 0),
            hrZone3Seconds: Math.round(hrZones.zone3 || 0),
            hrZone4Seconds: Math.round(hrZones.zone4 || 0),
            hrZone5Seconds: Math.round(hrZones.zone5 || 0),
            avgSwolf: swolfScore,
          })
          .where(eq(swimmingActivities.id, activity.id));

        updated++;
        console.log(`[Garmin] Updated HR zones for activity ${activity.garminActivityId}`);
      } catch (error) {
        console.error(
          `[Garmin] Error processing activity ${activity.garminActivityId}:`,
          error
        );
        failed++;
      }
    }

    console.log(`[Garmin] HR zones migration complete: ${updated} updated, ${failed} failed`);

    return {
      success: true,
      message: `Migration complete: ${updated} activities updated, ${failed} failed`,
      updated,
      failed,
      total: activitiesWithoutHR.length,
    };
  } catch (error) {
    console.error("[Garmin] Error during HR zones migration:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
      updated: 0,
      failed: 0,
      total: 0,
    };
  }
}
