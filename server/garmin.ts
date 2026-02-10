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
import { checkAndAwardBadges as checkAchievementBadges } from "./badge_engine";
import { calculateActivityXp as calculateActivityXpCore } from "./lib/utils";
import { logger } from "./middleware/logger";
import { classifyAsyncError } from "./lib/withErrorHandling";
import { config } from "./config";
import { fetchWithTimeout } from "./lib/fetchWithTimeout";

// Garmin microservice configuration
const GARMIN_SERVICE_URL = process.env.GARMIN_SERVICE_URL || "http://localhost:8000";
const GARMIN_SERVICE_SECRET = process.env.GARMIN_SERVICE_SECRET;

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
  if (!GARMIN_SERVICE_SECRET) {
    throw new Error("Garmin service not configured (missing GARMIN_SERVICE_SECRET)");
  }

  const url = `${GARMIN_SERVICE_URL}${endpoint}`;
  const timeoutMs = config.GARMIN_SERVICE_TIMEOUT_MS;
  
  try {
    const response = await fetchWithTimeout(
      url,
      {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": GARMIN_SERVICE_SECRET,
      },
      body: body ? JSON.stringify(body) : undefined,
      },
      timeoutMs,
      `garmin:service ${method} ${endpoint}`,
    );

    const data = await response.json().catch(() => ({ detail: "Unknown error" }));

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}`);
    }

    return data;
  } catch (error: unknown) {
    const { kind, message } = classifyAsyncError(error);
    const level = kind === "unknown" ? "error" : "warn";
    logger.log(level, `[Garmin Service] Error calling ${endpoint} (${kind}): ${message}`, {
      event: "garmin:service_error",
      endpoint,
      method,
      kind,
      message,
    });
    if (kind === "timeout") {
      throw new Error(`Garmin service timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

async function callGarminServiceWithUser(
  endpoint: string,
  userId: number,
  method: "GET" | "POST" = "GET",
  body?: object
): Promise<any> {
  if (!GARMIN_SERVICE_SECRET) {
    throw new Error("Garmin service not configured (missing GARMIN_SERVICE_SECRET)");
  }

  const url = `${GARMIN_SERVICE_URL}${endpoint}`;
  const timeoutMs = config.GARMIN_SERVICE_TIMEOUT_MS;

  try {
    const response = await fetchWithTimeout(
      url,
      {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": GARMIN_SERVICE_SECRET,
        "user-id": userId.toString(),
      },
      body: body ? JSON.stringify(body) : undefined,
      },
      timeoutMs,
      `garmin:service user=${userId} ${method} ${endpoint}`,
    );

    const data = await response.json().catch(() => ({ detail: "Unknown error" }));

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}`);
    }

    return data;
  } catch (error: unknown) {
    const { kind, message } = classifyAsyncError(error);
    const level = kind === "unknown" ? "error" : "warn";
    logger.log(level, `[Garmin Service] Error calling ${endpoint} (${kind}): ${message}`, {
      event: "garmin:service_error",
      endpoint,
      method,
      userId,
      kind,
      message,
    });
    if (kind === "timeout") {
      throw new Error(`Garmin service timeout after ${timeoutMs}ms`);
    }
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
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[Garmin] Failed to restore session for user ${userId}: ${message}`, {
      event: "garmin:restore_failed",
      userId,
      message,
    });
    return false;
  }
}

export async function getGarminActivityFullDetails(
  userId: number,
  garminActivityId: string
): Promise<unknown | null> {
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
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[Garmin] Could not fetch full details for activity ${garminActivityId}: ${message}`, {
      event: "garmin:activity_full_details_failed",
      userId,
      garminActivityId,
      message,
    });
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const toInt = (value: unknown) => {
  const num = toNumber(value);
  return num !== null ? Math.round(num) : null;
};

const pickFirst = (obj: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
};

const pickFirstFromSources = (sources: Array<Record<string, unknown>>, keys: string[]) => {
  for (const source of sources) {
    if (!source) continue;
    const value = pickFirst(source, keys);
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
};

const normalizeStrokeType = (value: unknown) => {
  if (!value) return null;
  const raw = String(value).toLowerCase();
  if (raw.includes("free") || raw.includes("stile") || raw.includes("crawl")) return "freestyle";
  if (raw.includes("back") || raw.includes("dorso")) return "backstroke";
  if (raw.includes("breast") || raw.includes("rana")) return "breaststroke";
  if (raw.includes("butter") || raw.includes("farf")) return "butterfly";
  if (raw.includes("mix")) return "mixed";
  return "mixed";
};

const toTimestamp = (value: unknown) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeStrokeDistanceCm = (value: unknown) => {
  const num = toNumber(value);
  if (!num) return null;
  return num < 10 ? Math.round(num * 100) : Math.round(num);
};

const normalizeTrainingEffect = (value: unknown) => {
  const num = toNumber(value);
  if (num === null) return null;
  return num <= 10 ? Math.round(num * 10) : Math.round(num);
};

const normalizeRecoveryHours = (value: unknown) => {
  const num = toNumber(value);
  if (num === null) return null;
  return num > 48 ? Math.round(num / 60) : Math.round(num);
};

const normalizeHrZones = (zones: unknown) => {
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
      const zoneRec = asRecord(zone);
      const zoneNum = toInt(
        zoneRec?.["zoneNumber"] ?? zoneRec?.["zone"] ?? zoneRec?.["zoneIndex"]
      );
      const seconds = toNumber(
        pickFirst(zoneRec, ["secsInZone", "seconds", "timeInSeconds", "value"])
      ) ?? 0;
      if (zoneNum && zoneNum >= 1 && zoneNum <= 5) {
        map[`hrZone${zoneNum}Seconds`] = Math.round(seconds);
      }
    });
  } else if (typeof zones === "object") {
    const zonesRec = asRecord(zones);
    if (!zonesRec) return null;
    const zoneValues = [
      zonesRec["zone1TimeInSeconds"] ?? zonesRec["zone1"] ?? zonesRec["zone1Seconds"],
      zonesRec["zone2TimeInSeconds"] ?? zonesRec["zone2"] ?? zonesRec["zone2Seconds"],
      zonesRec["zone3TimeInSeconds"] ?? zonesRec["zone3"] ?? zonesRec["zone3Seconds"],
      zonesRec["zone4TimeInSeconds"] ?? zonesRec["zone4"] ?? zonesRec["zone4Seconds"],
      zonesRec["zone5TimeInSeconds"] ?? zonesRec["zone5"] ?? zonesRec["zone5Seconds"],
    ];
    zoneValues.forEach((value, index) => {
      map[`hrZone${index + 1}Seconds`] = Math.round(toNumber(value) ?? 0);
    });
  }

  return map;
};

export function extractGarminAdvancedFields(fullDetails: unknown) {
  const full = asRecord(fullDetails);
  const activity = asRecord(full?.["activity"] ?? null);
  const summary = asRecord(activity?.["summaryDTO"] ?? full?.["summaryDTO"] ?? null);
  const details = asRecord(full?.["details"] ?? null);

  const sources = [details, summary, activity, full].filter((v): v is Record<string, unknown> => Boolean(v));

  const strokeType = normalizeStrokeType(
    pickFirstFromSources(sources, ["strokeType", "swimStrokeType", "avgStrokeType"])
  );
  const hrZones = normalizeHrZones(full?.["hr_zones"]);

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
  fullDetails: unknown
) {
  if (!db) return;
  const full = asRecord(fullDetails);
  const splitsVal = full?.["splits"];
  const splitsObj = asRecord(splitsVal);
  const lapDtosVal = splitsObj?.["lapDTOs"];
  const lapDtos: unknown[] = Array.isArray(lapDtosVal)
    ? lapDtosVal
    : Array.isArray(splitsVal)
    ? splitsVal
    : [];

  if (lapDtos.length === 0) {
    return;
  }

  // Reset existing laps/lengths for this activity
  await db.delete(garminActivityLengths).where(eq(garminActivityLengths.activityId, activityId));
  await db.delete(garminActivityLaps).where(eq(garminActivityLaps.activityId, activityId));

  const lapRecords = lapDtos.map((lap, index: number) => {
    const lapRec = asRecord(lap);
    const lengthDtosVal = lapRec?.["lengthDTOs"];
    const lengthDTOs: unknown[] = Array.isArray(lengthDtosVal) ? lengthDtosVal : [];
    const strokeCounts: Record<string, number> = {};
    lengthDTOs.forEach((length) => {
      const lengthRec = asRecord(length);
      const strokeKey = normalizeStrokeType(
        lengthRec?.["swimStroke"] ?? lengthRec?.["strokeType"] ?? lengthRec?.["stroke"]
      );
      if (!strokeKey) return;
      strokeCounts[strokeKey] = (strokeCounts[strokeKey] ?? 0) + 1;
    });
    const dominantStroke =
      Object.entries(strokeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      activityId,
      lapIndex: toInt(lapRec?.["lapIndex"]) ?? index + 1,
      distanceMeters: toInt(lapRec?.["distance"]),
      durationSeconds: toNumber(lapRec?.["duration"]),
      movingDurationSeconds: toNumber(lapRec?.["movingDuration"]),
      elapsedDurationSeconds: toNumber(lapRec?.["elapsedDuration"]),
      averageSpeedMps: toNumber(lapRec?.["averageSpeed"]),
      maxSpeedMps: toNumber(lapRec?.["maxSpeed"]),
      averageMovingSpeedMps: toNumber(lapRec?.["averageMovingSpeed"]),
      averageSwolf: toInt(lapRec?.["averageSWOLF"] ?? lapRec?.["averageSwolf"]),
      averageStrokes: toNumber(lapRec?.["averageStrokes"] ?? lapRec?.["avgStrokes"]),
      totalNumberOfStrokes: toInt(lapRec?.["totalNumberOfStrokes"]),
      averageSwimCadence: toInt(lapRec?.["averageSwimCadence"]),
      calories: toInt(lapRec?.["calories"]),
      avgHeartRate: toInt(lapRec?.["averageHR"] ?? lapRec?.["avgHeartRate"]),
      maxHeartRate: toInt(lapRec?.["maxHR"] ?? lapRec?.["maxHeartRate"]),
      numberOfActiveLengths: toInt(lapRec?.["numberOfActiveLengths"]),
      strokeType: dominantStroke,
      startTimeGmt: toTimestamp(lapRec?.["startTimeGMT"]),
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

  lapDtos.forEach((lap, index: number) => {
    const lapRec = asRecord(lap);
    const lapIndex = toInt(lapRec?.["lapIndex"]) ?? index + 1;
    const lapId = lapIdByIndex.get(lapIndex);
    if (!lapId) return;

    const lengthDtosVal = lapRec?.["lengthDTOs"];
    const lengthDTOs: unknown[] = Array.isArray(lengthDtosVal) ? lengthDtosVal : [];
    lengthDTOs.forEach((length, lengthIndex: number) => {
      const lengthRec = asRecord(length);
      const strokeKey = normalizeStrokeType(
        lengthRec?.["swimStroke"] ?? lengthRec?.["strokeType"] ?? lengthRec?.["stroke"]
      );
      lengthRecords.push({
        activityId,
        lapId,
        lengthIndex: toInt(lengthRec?.["lengthIndex"]) ?? lengthIndex + 1,
        distanceMeters: toInt(lengthRec?.["distance"]),
        durationSeconds: toNumber(lengthRec?.["duration"]),
        averageSpeedMps: toNumber(lengthRec?.["averageSpeed"]),
        maxSpeedMps: toNumber(lengthRec?.["maxSpeed"]),
        averageSwolf: toInt(lengthRec?.["averageSWOLF"] ?? lengthRec?.["averageSwolf"]),
        totalNumberOfStrokes: toInt(lengthRec?.["totalNumberOfStrokes"]),
        avgHeartRate: toInt(lengthRec?.["averageHR"] ?? lengthRec?.["avgHeartRate"]),
        maxHeartRate: toInt(lengthRec?.["maxHR"] ?? lengthRec?.["maxHeartRate"]),
        strokeType: strokeKey,
        startTimeGmt: toTimestamp(lengthRec?.["startTimeGMT"]),
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[Garmin] Falling back to local status for user ${userId}: ${message}`, {
      event: "garmin:status_fallback",
      userId,
      message,
    });
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Garmin] Connection failed: ${message}`, {
      event: "garmin:connect_failed",
      userId,
      message,
    });
    return { 
      success: false, 
      error: message || "Connection failed. Check your credentials." 
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Garmin] MFA completion failed: ${message}`, {
      event: "garmin:mfa_failed",
      userId,
      message,
    });
    return { 
      success: false, 
      error: message || "MFA verification failed" 
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
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Garmin] Disconnect failed: ${message}`, {
      event: "garmin:disconnect_failed",
      userId,
      message,
    });
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
      logger.info(`[Auto-Sync] Triggering Garmin sync for user ${userId}`, {
        event: "garmin:auto_sync_trigger",
        userId,
      });
      await syncGarminActivities(userId);
    } else {
      logger.info(`[Auto-Sync] Skipping Garmin sync for user ${userId}`, {
        event: "garmin:auto_sync_skip",
        userId,
        hoursAgo: Math.round((now.getTime() - new Date(lastSync).getTime()) / (60 * 60 * 1000)),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[Auto-Sync] Garmin failed for user ${userId}: ${message}`, {
      event: "garmin:auto_sync_failed",
      userId,
      message,
    });
  }
}

/**
 * Calculate XP for a swimming activity
 */
function calculateActivityXp(activity: GarminServiceActivity): number {
  return calculateActivityXpCore(activity.distance_meters, activity.is_open_water);
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

      const setIfDefined = (key: string, value: unknown) => {
        if (value === null || value === undefined) return;
        updates[key] = value;
      };

      const setIfDefinedInt = (key: string, value: unknown) => {
        if (value === null || value === undefined) return;
        const num = toNumber(value);
        if (num === null) return;
        updates[key] = Math.round(num);
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

    // Bulk fetch all existing Garmin activity IDs for this user to avoid N+1 queries
    const existingActivities = await db
      .select({
        garminActivityId: swimmingActivities.garminActivityId,
        id: swimmingActivities.id,
        strokeType: swimmingActivities.strokeType,
        rawData: swimmingActivities.rawData,
        avgSwolf: swimmingActivities.avgSwolf,
        avgStrokeDistance: swimmingActivities.avgStrokeDistance,
        avgStrokes: swimmingActivities.avgStrokes,
        avgStrokeCadence: swimmingActivities.avgStrokeCadence,
        trainingEffect: swimmingActivities.trainingEffect,
        anaerobicTrainingEffect: swimmingActivities.anaerobicTrainingEffect,
        avgHeartRate: swimmingActivities.avgHeartRate,
        hrZone1Seconds: swimmingActivities.hrZone1Seconds,
      })
      .from(swimmingActivities)
      .where(eq(swimmingActivities.userId, userId));

    const existingGarminMap = new Map(
      existingActivities
        .filter(a => a.garminActivityId)
        .map(a => [a.garminActivityId!, a])
    );

    // Process each activity
    for (const activity of result.activities) {
      // Check if activity already exists (by Garmin ID) using our pre-fetched map
      const existing = existingGarminMap.get(activity.activity_id);

      if (existing) {
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
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`[Garmin] Failed to persist laps for activity ${activity.activity_id}: ${message}`, {
              event: "garmin:laps_persist_failed",
              userId,
              garminActivityId: activity.activity_id,
              message,
            });
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
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`[Garmin] Failed to enrich existing activity ${activity.activity_id}: ${message}`, {
              event: "garmin:activity_enrich_failed",
              userId,
              garminActivityId: activity.activity_id,
              message,
            });
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
        logger.info(`[Garmin] Activity ${activity.activity_id} is a duplicate of Strava activity ${existingCrossPlatform.id}, skipping`, {
          event: "garmin:duplicate_strava_skip",
          userId,
          garminActivityId: activity.activity_id,
          stravaActivityId: existingCrossPlatform.id,
        });
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
          const message = error instanceof Error ? error.message : String(error);
          logger.warn(`[Garmin] Failed to enrich activity ${activity.activity_id}: ${message}`, {
            event: "garmin:activity_enrich_failed",
            userId,
            garminActivityId: activity.activity_id,
            message,
          });
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
      // Use accurate aggregates from DB instead of incremental sums
      const { getActivityAggregates } = await import("./db");
      const aggregates = await getActivityAggregates(userId);
      
      const newTotalXp = (profile.totalXp || 0) + totalNewXp;
      const newLevel = calculateLevel(newTotalXp);

      await db
        .update(swimmerProfiles)
        .set({
          totalXp: newTotalXp,
          level: newLevel,
          totalDistanceMeters: aggregates.totalDistance,
          totalTimeSeconds: aggregates.totalTime,
          totalSessions: aggregates.totalSessions,
          totalOpenWaterSessions: aggregates.totalOpenWaterSessions,
          totalOpenWaterMeters: aggregates.totalOpenWaterMeters,
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
        totalDistance: aggregates.totalDistance,
        totalSessions: aggregates.totalSessions,
        totalXp: newTotalXp,
        level: newLevel,
        totalTime: aggregates.totalTime,
        longestSessionDistance,
      });

      // Update profile badge based on new XP
      await updateUserProfileBadge(userId, newTotalXp);

      // Check and award achievement badges
      try {
        const newBadges = await checkAchievementBadges(userId);
        if (newBadges.length > 0) {
          logger.info(`[Badge Engine] Awarded ${newBadges.length} new badges: ${newBadges.join(", ")}`, {
            event: "badge_engine:awarded",
            userId,
            count: newBadges.length,
            badges: newBadges,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[Badge Engine] Failed for user ${userId}: ${message}`, {
          event: "badge_engine:failed",
          userId,
          message,
        });
      }

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

    logger.info(`[Garmin Sync] Updated last_garmin_sync_at for user ${userId}`, {
      event: "garmin:sync_updated_last_sync",
      userId,
    });

    // Auto-migrate HR zones for activities that don't have them
    if (syncedCount > 0) {
      logger.info(`[Garmin Sync] Starting automatic HR zones migration for ${syncedCount} new activities`, {
        event: "garmin:sync_hr_migration_start",
        userId,
        syncedCount,
      });
      try {
        const migrationResult = await migrateHrZones(userId);
        logger.info(`[Garmin Sync] HR zones migration result: ${migrationResult.message}`, {
          event: "garmin:sync_hr_migration_done",
          userId,
          message: migrationResult.message,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[Garmin Sync] HR zones migration failed: ${message}`, {
          event: "garmin:sync_hr_migration_failed",
          userId,
          message,
        });
      }
    }

    return { synced: syncedCount, newXp: totalNewXp };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Garmin] Sync failed: ${message}`, {
      event: "garmin:sync_failed",
      userId,
      message,
    });
    return { synced: 0, newXp: 0, error: message || "Sync failed" };
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

  // Single query for max distance and min pace
  const [stats] = await db
    .select({
      longestSession: sql<number>`coalesce(max(${swimmingActivities.distanceMeters}), 0)`,
      fastestPace100m: sql<number>`coalesce(min(${swimmingActivities.avgPacePer100m}), 0)`,
    })
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId));

  // Weekly distance aggregation
  const weeklyResult = await db.execute(sql`
    SELECT coalesce(max(weekly_distance), 0) as most_distance_week
    FROM (
      SELECT sum(distance_meters) as weekly_distance
      FROM swimming_activities
      WHERE user_id = ${userId}
      GROUP BY date_trunc('week', activity_date)
    ) weekly
  `);

  const mostDistanceWeek = Number((weeklyResult.rows[0] as any)?.most_distance_week ?? 0);

  return {
    longestSession: Number(stats?.longestSession ?? 0),
    fastestPace100m: Number(stats?.fastestPace100m ?? 0),
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

    logger.info(`[Garmin] Updated progress for ${challenges.length} active challenges for user ${userId}`, {
      event: "garmin:challenge_progress_updated",
      userId,
      count: challenges.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[Garmin] Error updating challenge progress: ${message}`, {
      event: "garmin:challenge_progress_update_failed",
      userId,
      message,
    });
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
    if (!GARMIN_SERVICE_SECRET) {
      return {
        success: false,
        message: "Garmin service not configured",
        updated: 0,
        failed: 0,
        total: 0,
      };
    }

    logger.info(`[Garmin] Starting HR zones migration for user ${userId}`, {
      event: "garmin:hr_migration_start",
      userId,
    });

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

    logger.info(`[Garmin] Found ${activitiesWithoutHR.length} activities without HR zones`, {
      event: "garmin:hr_migration_candidates",
      userId,
      count: activitiesWithoutHR.length,
    });

    let updated = 0;
    let failed = 0;

    // Fetch HR zones data for each activity
    for (const activity of activitiesWithoutHR) {
      try {
        // Call Garmin Service to get HR zones data
        const response = await fetchWithTimeout(
          `${GARMIN_SERVICE_URL}/activity/${activity.garminActivityId}/hr-zones`,
          {
            headers: {
              "user-id": userId.toString(),
              "X-API-Key": GARMIN_SERVICE_SECRET,
            },
          },
          config.GARMIN_SERVICE_TIMEOUT_MS,
          `garmin:hr_zones activity=${activity.garminActivityId}`,
        );

        if (!response.ok) {
          logger.warn(
            `[Garmin] Failed to fetch HR zones for activity ${activity.garminActivityId}: ${response.status}`,
            {
              event: "garmin:hr_migration_fetch_failed",
              userId,
              garminActivityId: activity.garminActivityId,
              status: response.status,
            }
          );
          failed++;
          continue;
        }

        const hrZones = await response.json();

        // Fetch activity details (including SWOLF)
        let swolfScore = activity.avgSwolf; // Keep existing value if fetch fails
        try {
          const detailsResponse = await fetchWithTimeout(
            `${GARMIN_SERVICE_URL}/activity/${activity.garminActivityId}/details`,
            {
              headers: {
                "user-id": userId.toString(),
                "X-API-Key": GARMIN_SERVICE_SECRET,
              },
            },
            config.GARMIN_SERVICE_TIMEOUT_MS,
            `garmin:details activity=${activity.garminActivityId}`,
          );
          
          if (detailsResponse.ok) {
            const details = await detailsResponse.json();
            if (details.swolf_score !== null && details.swolf_score !== undefined) {
              swolfScore = details.swolf_score;
            }
          }
        } catch (detailsError) {
          const message = detailsError instanceof Error ? detailsError.message : String(detailsError);
          logger.warn(`[Garmin] Could not fetch details for activity ${activity.garminActivityId}: ${message}`, {
            event: "garmin:hr_migration_details_failed",
            userId,
            garminActivityId: activity.garminActivityId,
            message,
          });
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
        logger.info(`[Garmin] Updated HR zones for activity ${activity.garminActivityId}`, {
          event: "garmin:hr_migration_activity_updated",
          userId,
          garminActivityId: activity.garminActivityId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[Garmin] Error processing activity ${activity.garminActivityId}: ${message}`, {
          event: "garmin:hr_migration_activity_failed",
          userId,
          garminActivityId: activity.garminActivityId,
          message,
        });
        failed++;
      }
    }

    logger.info(`[Garmin] HR zones migration complete: ${updated} updated, ${failed} failed`, {
      event: "garmin:hr_migration_complete",
      userId,
      updated,
      failed,
    });

    return {
      success: true,
      message: `Migration complete: ${updated} activities updated, ${failed} failed`,
      updated,
      failed,
      total: activitiesWithoutHR.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[Garmin] Error during HR zones migration: ${message}`, {
      event: "garmin:hr_migration_crash",
      userId,
      message,
    });
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
      updated: 0,
      failed: 0,
      total: 0,
    };
  }
}
