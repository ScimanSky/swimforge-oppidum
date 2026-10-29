/**
 * Swim metrics of a user: reads 180 days of swims and their laps, the CSS test in the profile
 * preferences and the swim dates for the streak, then computes everything (cached 1 hour).
 */
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import type { SwimMetrics } from "@shared/swimMetrics";
import { dayKey } from "@shared/swimMetrics";
import { garminActivityLaps, swimmerProfiles, swimmingActivities } from "../../drizzle/schema";
import { getDb } from "../db";
import { cacheKeys, deleteCached, getOrSetCached } from "../lib/cache";
import { computeSwimMetrics, HISTORY_DAYS, type CssTest, type SwimMetricsInput } from "./compute";
import { toMetricLap, type MetricActivity, type MetricLap } from "./laps";

export { computeSwimMetrics, type CssTest } from "./compute";

const DAY_MS = 86_400_000;
export const SWIM_METRICS_TTL_SECONDS = 3600;
/** The weekly streak looks back at most this far. */
const STREAK_LOOKBACK_DAYS = 730;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Profile preferences as an object (the column is JSON, sometimes stored as a string). */
export function preferencesObject(preferences: unknown): Record<string, unknown> {
  if (typeof preferences === "string") {
    try {
      const parsed: unknown = JSON.parse(preferences);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(preferences) ? preferences : {};
}

/** `preferences.cssTest` when it is well formed (T400 slower than T200, date YYYY-MM-DD). */
export function parseCssTest(preferences: unknown): CssTest | null {
  const raw = preferencesObject(preferences).cssTest;
  if (!isRecord(raw)) return null;
  const { t200Seconds, t400Seconds, date } = raw;
  if (typeof t200Seconds !== "number" || typeof t400Seconds !== "number" || typeof date !== "string") return null;
  if (!(t200Seconds > 0) || !(t400Seconds > t200Seconds) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { t200Seconds, t400Seconds, date };
}

async function loadInput(userId: number, now: Date): Promise<SwimMetricsInput> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // One day of margin: the compute keeps the 180 Rome days.
  const since = new Date(now.getTime() - (HISTORY_DAYS + 1) * DAY_MS);
  const rows = await db
    .select({
      id: swimmingActivities.id,
      activityDate: swimmingActivities.activityDate,
      distanceMeters: swimmingActivities.distanceMeters,
      durationSeconds: swimmingActivities.durationSeconds,
      poolLengthMeters: swimmingActivities.poolLengthMeters,
      isOpenWater: swimmingActivities.isOpenWater,
    })
    .from(swimmingActivities)
    .where(and(eq(swimmingActivities.userId, userId), gte(swimmingActivities.activityDate, since)))
    .orderBy(asc(swimmingActivities.activityDate));

  const ids = rows.map((row) => row.id);
  const lapRows = ids.length
    ? await db
        .select({
          activityId: garminActivityLaps.activityId,
          lapIndex: garminActivityLaps.lapIndex,
          distanceMeters: garminActivityLaps.distanceMeters,
          durationSeconds: garminActivityLaps.durationSeconds,
          movingDurationSeconds: garminActivityLaps.movingDurationSeconds,
          totalNumberOfStrokes: garminActivityLaps.totalNumberOfStrokes,
          averageSwolf: garminActivityLaps.averageSwolf,
          strokeType: garminActivityLaps.strokeType,
        })
        .from(garminActivityLaps)
        .where(inArray(garminActivityLaps.activityId, ids))
        .orderBy(asc(garminActivityLaps.activityId), asc(garminActivityLaps.lapIndex))
    : [];

  const [profile] = await db
    .select({ preferences: swimmerProfiles.preferences })
    .from(swimmerProfiles)
    .where(eq(swimmerProfiles.userId, userId))
    .limit(1);

  const streakRows = await db
    .select({ activityDate: swimmingActivities.activityDate })
    .from(swimmingActivities)
    .where(
      and(
        eq(swimmingActivities.userId, userId),
        gte(swimmingActivities.activityDate, new Date(now.getTime() - STREAK_LOOKBACK_DAYS * DAY_MS)),
      ),
    );

  const lapsByActivity = new Map<number, MetricLap[]>();
  for (const row of lapRows) {
    const list = lapsByActivity.get(row.activityId) ?? [];
    list.push(toMetricLap(row));
    lapsByActivity.set(row.activityId, list);
  }

  const activities: MetricActivity[] = rows.map((row) => {
    const date = new Date(row.activityDate);
    return {
      id: row.id,
      date,
      day: dayKey(date),
      distanceMeters: Number(row.distanceMeters) || 0,
      durationSeconds: Number(row.durationSeconds) || 0,
      poolLengthMeters: row.poolLengthMeters ?? null,
      isOpenWater: Boolean(row.isOpenWater),
      laps: lapsByActivity.get(row.id) ?? [],
    };
  });

  return {
    activities,
    cssTest: parseCssTest(profile?.preferences),
    streakDates: streakRows.map((row) => new Date(row.activityDate)),
  };
}

/** The six metrics of a user (only ever called for the logged-in user). */
export async function getSwimMetrics(userId: number, now: Date = new Date()): Promise<SwimMetrics> {
  return getOrSetCached(
    cacheKeys.swimMetrics(String(userId)),
    async () => computeSwimMetrics(await loadInput(userId, now), now),
    SWIM_METRICS_TTL_SECONDS,
  );
}

/** Drop the cached metrics (new laps, CSS test saved or removed). */
export async function invalidateSwimMetrics(userId: number): Promise<void> {
  await deleteCached(cacheKeys.swimMetrics(String(userId)));
}
