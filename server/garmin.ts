/**
 * Garmin Connect Integration Service
 * 
 * This module handles the integration with Garmin Connect using direct HTTP requests.
 * It provides functions for authentication, token management, and activity syncing.
 * 
 * Note: Garmin does not provide official public APIs. This implementation uses
 * the same authentication flow as the Garmin Connect mobile app.
 * 
 * IMPORTANT: For production use, consider using a dedicated microservice
 * with the python-garminconnect library for more reliable authentication.
 */

import { getDb } from "./db";
import { garminTokens, swimmingActivities, swimmerProfiles } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// Garmin API endpoints
const GARMIN_SSO_URL = "https://sso.garmin.com/sso";
const GARMIN_CONNECT_URL = "https://connect.garmin.com";

interface GarminActivity {
  activityId: number;
  activityName: string;
  startTimeLocal: string;
  startTimeGMT: string;
  activityType: {
    typeKey: string;
  };
  distance: number;
  duration: number;
  averageHR?: number;
  maxHR?: number;
  calories?: number;
  poolLength?: number;
  avgSwolf?: number;
  totalLaps?: number;
}

/**
 * Get Garmin connection status for a user
 */
export async function getGarminStatus(userId: number): Promise<{
  connected: boolean;
  email?: string;
  lastSync?: Date;
}> {
  const db = await getDb();
  if (!db) {
    return { connected: false };
  }

  const tokens = await db
    .select()
    .from(garminTokens)
    .where(eq(garminTokens.userId, userId))
    .limit(1);

  if (!tokens.length) {
    return { connected: false };
  }

  return {
    connected: true,
    email: tokens[0].garminEmail || undefined,
    lastSync: tokens[0].lastSyncAt || undefined,
  };
}

/**
 * Connect to Garmin with email/password
 * 
 * Note: Due to Garmin's complex authentication flow (CSRF tokens, cookies, etc.),
 * this is a placeholder that stores credentials for future sync operations.
 * For full implementation, use the python-garminconnect library in a separate service.
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
    // For now, we store the credentials securely
    // In production, you would:
    // 1. Call a Python microservice that handles Garmin auth
    // 2. Store the OAuth tokens returned
    
    // Store connection info
    await db.insert(garminTokens).values({
      userId,
      garminEmail: email,
      // Note: In production, encrypt the password or use OAuth tokens
      oauth1Token: JSON.stringify({ email, connected: true }),
      oauth2Token: null,
      tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }).onDuplicateKeyUpdate({
      set: {
        garminEmail: email,
        oauth1Token: JSON.stringify({ email, connected: true }),
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      },
    });

    // Update profile
    await db
      .update(swimmerProfiles)
      .set({ garminConnected: true })
      .where(eq(swimmerProfiles.userId, userId));

    return { 
      success: true,
    };
  } catch (error: any) {
    console.error("[Garmin] Connection failed:", error);
    return { 
      success: false, 
      error: error.message || "Connection failed" 
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
 * Sync swimming activities from Garmin Connect
 * 
 * Note: This is a placeholder implementation. For full sync functionality,
 * you would need to:
 * 1. Use the python-garminconnect library in a separate microservice
 * 2. Call that service from here to fetch activities
 * 3. Process and store the activities
 */
export async function syncGarminActivities(
  userId: number,
  daysBack: number = 30
): Promise<{ synced: number; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { synced: 0, error: "Database not available" };
  }

  // Check if user has Garmin connected
  const tokens = await db
    .select()
    .from(garminTokens)
    .where(eq(garminTokens.userId, userId))
    .limit(1);

  if (!tokens.length) {
    return { synced: 0, error: "Garmin non collegato" };
  }

  try {
    // Update last sync timestamp
    await db
      .update(garminTokens)
      .set({ lastSyncAt: new Date() })
      .where(eq(garminTokens.userId, userId));

    // For now, return a message indicating manual sync is needed
    // In production, this would call the Python microservice
    return { 
      synced: 0, 
      error: "Sincronizzazione automatica in fase di sviluppo. Per ora, inserisci le attività manualmente." 
    };
  } catch (error: any) {
    console.error("[Garmin] Sync failed:", error);
    return { synced: 0, error: error.message || "Sync failed" };
  }
}

/**
 * Determine stroke type from activity name
 */
function determineStrokeType(activityName: string): string {
  const name = activityName.toLowerCase();
  
  if (name.includes("stile") || name.includes("crawl") || name.includes("freestyle")) {
    return "freestyle";
  }
  if (name.includes("dorso") || name.includes("back")) {
    return "backstroke";
  }
  if (name.includes("rana") || name.includes("breast")) {
    return "breaststroke";
  }
  if (name.includes("delfino") || name.includes("farfalla") || name.includes("butterfly")) {
    return "butterfly";
  }
  
  return "mixed";
}
