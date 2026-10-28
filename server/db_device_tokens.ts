import { and, eq, inArray } from "drizzle-orm";
import { deviceTokens, swimmerProfiles } from "../drizzle/schema";
import { getDb } from "./db";

export type DevicePlatform = "android" | "ios" | "web";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

/**
 * Registers a device token for the user. A token belongs to one device: if another
 * user registered it before (shared phone, re-login), it moves to this user.
 */
export async function upsertDeviceToken(
  userId: number,
  input: { token: string; platform: DevicePlatform; appVersion?: string | null },
): Promise<void> {
  const db = await requireDb();
  const now = new Date();
  await db
    .insert(deviceTokens)
    .values({
      userId,
      token: input.token,
      platform: input.platform,
      appVersion: input.appVersion ?? null,
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: {
        userId,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        lastSeenAt: now,
      },
    });
}

/** Removes the token only if it belongs to the user. */
export async function deleteDeviceToken(userId: number, token: string): Promise<void> {
  const db = await requireDb();
  await db.delete(deviceTokens).where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.token, token)));
}

export async function listUserDeviceTokens(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ token: deviceTokens.token })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId));
  return rows.map((row) => row.token);
}

/** Drops tokens that FCM reported as no longer valid. */
export async function deleteTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(deviceTokens).where(inArray(deviceTokens.token, tokens));
}

/** The raw `notification_settings` JSON of the user's profile (null when missing). */
export async function getUserNotificationSettings(userId: number): Promise<Record<string, unknown> | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select({ settings: swimmerProfiles.notificationSettings })
    .from(swimmerProfiles)
    .where(eq(swimmerProfiles.userId, userId))
    .limit(1);
  const settings = rows[0]?.settings;
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, unknown>)
    : null;
}

