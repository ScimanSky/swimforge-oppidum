/**
 * Swim metrics of a user: reads 180 days of swims and their laps, 300 days of laps near the CSS
 * distances, the CSS test in the profile preferences and the swims per week for the streak (five
 * queries in parallel), then computes everything (cached 1 hour).
 */
import { and, asc, between, eq, gte, sql } from "drizzle-orm";
import type { SwimMetrics } from "@shared/swimMetrics";
import { addDaysToKey, dayKey } from "@shared/swimMetrics";
import { garminActivityLaps, swimmerProfiles, swimmingActivities } from "../../drizzle/schema";
import { getDb } from "../db";
import { clearAIInsightsCache } from "../ai_insights";
import { cacheKeys, deleteCached, getOrSetCached } from "../lib/cache";
import { computeSwimMetrics, HISTORY_DAYS, type CssTest, type SwimMetricsInput } from "./compute";
import type { CssLap } from "./css";
import { efficiencySummary, sessionEfficiency, type EfficiencySummary } from "./efficiency";
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

/** Days of freestyle laps read for the CSS estimates: the 90-day windows of 7 month ends. */
export const CSS_LAPS_DAYS = 300;
/** Lap distances the light CSS query keeps: 200 yd − 3% (177 m) to 1500 m + 3%. */
const CSS_LAP_MIN_METERS = 177;
const CSS_LAP_MAX_METERS = 1545;

/** Monday «YYYY-MM-DD» of the Rome week of a swim (activity_date is a UTC timestamp). */
const romeWeekStart = sql<string>`to_char(date_trunc('week', (${swimmingActivities.activityDate} AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome'), 'YYYY-MM-DD')`;

async function loadInput(userId: number, now: Date): Promise<SwimMetricsInput> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // One day of margin on each window: the compute keeps whole Rome days.
  const since = new Date(now.getTime() - (HISTORY_DAYS + 1) * DAY_MS);
  const cssSince = new Date(now.getTime() - (CSS_LAPS_DAYS + 1) * DAY_MS);
  const streakSince = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * DAY_MS);
  const recentSwims = and(eq(swimmingActivities.userId, userId), gte(swimmingActivities.activityDate, since));

  // Five independent queries, in parallel.
  const [rows, lapRows, profileRows, cssLapRows, streakRows] = await Promise.all([
    db
      .select({
        id: swimmingActivities.id,
        activityDate: swimmingActivities.activityDate,
        distanceMeters: swimmingActivities.distanceMeters,
        durationSeconds: swimmingActivities.durationSeconds,
        poolLengthMeters: swimmingActivities.poolLengthMeters,
        isOpenWater: swimmingActivities.isOpenWater,
      })
      .from(swimmingActivities)
      .where(recentSwims)
      .orderBy(asc(swimmingActivities.activityDate)),
    db
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
      .innerJoin(swimmingActivities, eq(garminActivityLaps.activityId, swimmingActivities.id))
      .where(recentSwims)
      .orderBy(asc(garminActivityLaps.activityId), asc(garminActivityLaps.lapIndex)),
    db
      .select({ preferences: swimmerProfiles.preferences })
      .from(swimmerProfiles)
      .where(eq(swimmerProfiles.userId, userId))
      .limit(1),
    // Light: only pool laps near a CSS distance, over 300 days (the stroke is checked in code).
    db
      .select({
        activityDate: swimmingActivities.activityDate,
        poolLengthMeters: swimmingActivities.poolLengthMeters,
        isOpenWater: swimmingActivities.isOpenWater,
        distanceMeters: garminActivityLaps.distanceMeters,
        durationSeconds: garminActivityLaps.durationSeconds,
        movingDurationSeconds: garminActivityLaps.movingDurationSeconds,
        strokeType: garminActivityLaps.strokeType,
      })
      .from(garminActivityLaps)
      .innerJoin(swimmingActivities, eq(garminActivityLaps.activityId, swimmingActivities.id))
      .where(
        and(
          eq(swimmingActivities.userId, userId),
          gte(swimmingActivities.activityDate, cssSince),
          eq(swimmingActivities.isOpenWater, false),
          between(garminActivityLaps.distanceMeters, CSS_LAP_MIN_METERS, CSS_LAP_MAX_METERS),
        ),
      ),
    // The streak: swims per Rome week over two years, counted by the database.
    db
      .select({ weekStart: romeWeekStart, swims: sql<number>`count(*)::int` })
      .from(swimmingActivities)
      .where(and(eq(swimmingActivities.userId, userId), gte(swimmingActivities.activityDate, streakSince)))
      .groupBy(sql`1`),
  ]);

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

  const cssLaps: CssLap[] = cssLapRows.flatMap((row) => {
    const lap = toMetricLap({ ...row, activityId: 0, lapIndex: 0, totalNumberOfStrokes: null, averageSwolf: null });
    if (!(lap.distanceMeters > 0) || !(lap.seconds > 0)) return [];
    return [{
      day: dayKey(new Date(row.activityDate)),
      poolLengthMeters: row.poolLengthMeters ?? null,
      isOpenWater: Boolean(row.isOpenWater),
      distanceMeters: lap.distanceMeters,
      seconds: lap.seconds,
      stroke: lap.stroke,
    }];
  });

  return {
    activities,
    cssTest: parseCssTest(profileRows[0]?.preferences),
    streakWeekCounts: new Map(streakRows.map((row) => [String(row.weekStart), Number(row.swims) || 0])),
    cssLaps,
    cssLapsFrom: addDaysToKey(dayKey(now), -(CSS_LAPS_DAYS - 1)),
  };
}

/** Days of swims the Stroke Index summary needs: the 28 days and the 90-day baseline before them. */
export const STROKE_INDEX_WINDOW_DAYS = 118;

/**
 * The Stroke Index summary of the efficiency card, computed fresh from the database (no cache):
 * the «Efficienza Suprema» badge is checked during a sync, before the caches are dropped.
 */
export async function loadStrokeIndexProgress(userId: number, now: Date = new Date()): Promise<EfficiencySummary> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const since = new Date(now.getTime() - (STROKE_INDEX_WINDOW_DAYS + 1) * DAY_MS);
  const poolSwims = and(
    eq(swimmingActivities.userId, userId),
    gte(swimmingActivities.activityDate, since),
    eq(swimmingActivities.isOpenWater, false),
  );
  const [rows, lapRows] = await Promise.all([
    db
      .select({
        id: swimmingActivities.id,
        activityDate: swimmingActivities.activityDate,
        poolLengthMeters: swimmingActivities.poolLengthMeters,
      })
      .from(swimmingActivities)
      .where(poolSwims),
    db
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
      .innerJoin(swimmingActivities, eq(garminActivityLaps.activityId, swimmingActivities.id))
      .where(poolSwims),
  ]);
  const lapsByActivity = new Map<number, MetricLap[]>();
  for (const row of lapRows) {
    const list = lapsByActivity.get(row.activityId) ?? [];
    list.push(toMetricLap(row));
    lapsByActivity.set(row.activityId, list);
  }
  const sessions = rows
    .map((row) => ({ date: new Date(row.activityDate), row }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(({ date, row }) => ({
      date: dayKey(date),
      poolLengthMeters: row.poolLengthMeters ?? null,
      isOpenWater: false,
      ...sessionEfficiency(lapsByActivity.get(row.id) ?? []),
    }));
  return efficiencySummary(sessions, now);
}

/** The six metrics of a user (only ever called for the logged-in user), cached per Rome day. */
export async function getSwimMetrics(userId: number, now: Date = new Date()): Promise<SwimMetrics> {
  return getOrSetCached(
    cacheKeys.swimMetrics(String(userId), dayKey(now)),
    async () => computeSwimMetrics(await loadInput(userId, now), now),
    SWIM_METRICS_TTL_SECONDS,
  );
}

/**
 * Drop today's cached metrics and the Coach page insights written from them (new swims or laps,
 * CSS test saved or removed).
 */
export async function invalidateSwimMetrics(userId: number, now: Date = new Date()): Promise<void> {
  await Promise.all([
    deleteCached(cacheKeys.swimMetrics(String(userId), dayKey(now))),
    clearAIInsightsCache(userId),
  ]);
}
