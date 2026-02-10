/**
 * Badge Engine - Automatic Achievement Badge System
 * 
 * This module evaluates user activities and awards achievement badges
 * based on flexible criteria defined in the database.
 */

import { getDb } from "./db";
import { achievementBadgeDefinitions, userAchievementBadges, swimmingActivities, swimmerProfiles } from "../drizzle/schema";
import { eq, and, gte, gt, sql } from "drizzle-orm";
import { calculateSEI, calculateSER, calculateTCI } from "./advanced_metrics";
import { logger } from "./middleware/logger";

interface BadgeCriteria {
  metric: string;
  operator: string;
  value: number;
  min_activities_per_week?: number;
  consecutive_weeks?: number;
}

type ActivityForBadges = {
  id: number;
  activityDate: unknown;
  distanceMeters: number | null;
  durationSeconds: number | null;
  avgSwolf: number | null;
  avgPacePer100m: number | null;
  maxHeartRate: number | null;
  avgHeartRate: number | null;
  calories: number | null;
};

/**
 * Main function to check and award badges for a user
 * Called after activity sync completes
 */
export async function checkAndAwardBadges(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    const log = logger.child({ component: "badge_engine" });

    // Get all badge definitions
    const allBadges = await db.select().from(achievementBadgeDefinitions);

    // Get badges user already has
    const userOwnedBadges = await db
      .select()
      .from(userAchievementBadges)
      .where(eq(userAchievementBadges.userId, userId));

    const ownedBadgeIds = new Set(userOwnedBadges.map(b => b.badgeId));

    // Get user's activities
    const userActivities = await db
      .select()
      .from(swimmingActivities)
      .where(eq(swimmingActivities.userId, userId));

    // Get user's profile
    const profiles = await db
      .select()
      .from(swimmerProfiles)
      .where(eq(swimmerProfiles.userId, userId))
      .limit(1);

    const profile = profiles[0];
    if (!profile) return [];

    const newlyAwardedBadges: string[] = [];

    // Work only on badges the user doesn't already own.
    const pendingBadges = allBadges.filter(b => !ownedBadgeIds.has(b.id));

    // Pre-evaluate badges that don't require scanning all activities.
    const metricPeakBadges: typeof pendingBadges = [];
    const singleActivityBadges: typeof pendingBadges = [];
    const consistencyBadges: typeof pendingBadges = [];

    for (const badge of pendingBadges) {
      switch (badge.criteriaType) {
        case "aggregate_total": {
          const criteria = badge.criteriaJson as BadgeCriteria;
          if (evaluateAggregateTotalCriteria(criteria, profile)) {
            await db.insert(userAchievementBadges).values({ userId, badgeId: badge.id });
            newlyAwardedBadges.push(badge.name);
            log.info("Badge awarded", { userId, badgeId: badge.id, badgeName: badge.name, criteriaType: badge.criteriaType });
          }
          break;
        }
        case "metric_peak":
          metricPeakBadges.push(badge);
          break;
        case "single_activity":
          singleActivityBadges.push(badge);
          break;
        case "consistency":
          consistencyBadges.push(badge);
          break;
        default:
          log.warn("Unknown badge criteria type", { userId, badgeId: badge.id, criteriaType: badge.criteriaType });
          break;
      }
    }

    // metric_peak evaluation uses its own bounded query (already limited).
    for (const badge of metricPeakBadges) {
      const criteria = badge.criteriaJson as BadgeCriteria;
      const met = await evaluateMetricPeakCriteria(criteria, userId);
      if (!met) continue;

      await db.insert(userAchievementBadges).values({ userId, badgeId: badge.id });
      newlyAwardedBadges.push(badge.name);
      log.info("Badge awarded", { userId, badgeId: badge.id, badgeName: badge.name, criteriaType: badge.criteriaType });
    }

    // For large datasets, scan activities in batches with a cursor on id (avoid loading everything in memory).
    if (singleActivityBadges.length > 0 || consistencyBadges.length > 0) {
      const BATCH_SIZE = 100;
      let lastId = 0;

      const metSingleBadges = new Set<number>();
      const weeklyActivities: Map<string, number> = new Map();

      while (true) {
        const batch = await db
          .select({
            id: swimmingActivities.id,
            activityDate: swimmingActivities.activityDate,
            distanceMeters: swimmingActivities.distanceMeters,
            durationSeconds: swimmingActivities.durationSeconds,
            avgSwolf: swimmingActivities.avgSwolf,
            avgPacePer100m: swimmingActivities.avgPacePer100m,
            maxHeartRate: swimmingActivities.maxHeartRate,
            avgHeartRate: swimmingActivities.avgHeartRate,
            calories: swimmingActivities.calories,
          })
          .from(swimmingActivities)
          .where(and(eq(swimmingActivities.userId, userId), gt(swimmingActivities.id, lastId)))
          .orderBy(swimmingActivities.id)
          .limit(BATCH_SIZE);

        if (batch.length === 0) break;

        for (const activity of batch as ActivityForBadges[]) {
          // Build per-week counts for consistency badges.
          if (consistencyBadges.length > 0) {
            const date = new Date(activity.activityDate as any);
            if (!Number.isNaN(date.getTime())) {
              const weekKey = getWeekKey(date);
              weeklyActivities.set(weekKey, (weeklyActivities.get(weekKey) || 0) + 1);
            }
          }

          // Evaluate "single_activity" badges; short-circuit per-badge as soon as it's met.
          for (const badge of singleActivityBadges) {
            if (metSingleBadges.has(badge.id)) continue;
            const criteria = badge.criteriaJson as BadgeCriteria;
            const value = getActivityValue(activity, criteria.metric);
            if (value !== null && evaluateOperator(value, criteria.operator, criteria.value)) {
              metSingleBadges.add(badge.id);
            }
          }
        }

        lastId = (batch[batch.length - 1] as any).id;

        // If we don't need consistency counts, we can stop early once every single-activity badge is met.
        if (consistencyBadges.length === 0 && metSingleBadges.size === singleActivityBadges.length) {
          break;
        }
      }

      // Award met single-activity badges.
      for (const badge of singleActivityBadges) {
        if (!metSingleBadges.has(badge.id)) continue;
        await db.insert(userAchievementBadges).values({ userId, badgeId: badge.id });
        newlyAwardedBadges.push(badge.name);
        log.info("Badge awarded", { userId, badgeId: badge.id, badgeName: badge.name, criteriaType: badge.criteriaType });
      }

      // Evaluate and award consistency badges using the weekly counts.
      for (const badge of consistencyBadges) {
        const criteria = badge.criteriaJson as BadgeCriteria;
        if (!evaluateConsistencyCriteriaFromWeeklyCounts(criteria, weeklyActivities)) continue;
        await db.insert(userAchievementBadges).values({ userId, badgeId: badge.id });
        newlyAwardedBadges.push(badge.name);
        log.info("Badge awarded", { userId, badgeId: badge.id, badgeName: badge.name, criteriaType: badge.criteriaType });
      }
    }

    return newlyAwardedBadges;
  } catch (error) {
    logger.error("Error checking badges", { component: "badge_engine", userId, error });
    return [];
  }
}

/**
 * Check if aggregate totals meet the criteria
 */
function evaluateAggregateTotalCriteria(criteria: BadgeCriteria, profile: any): boolean {
  let value: number | null = null;

  switch (criteria.metric) {
    case 'total_distance':
      value = profile.totalDistanceMeters || 0;
      break;
    case 'total_sessions':
      value = profile.totalSessions || 0;
      break;
    case 'total_time':
      value = profile.totalTimeSeconds || 0;
      break;
    default:
      return false;
  }

  return evaluateOperator(value, criteria.operator, criteria.value);
}

/**
 * Check if consistency criteria are met (e.g., 3 sessions per week for 4 weeks),
 * using pre-aggregated weekly counts (computed while scanning activities in batches).
 */
function evaluateConsistencyCriteriaFromWeeklyCounts(
  criteria: BadgeCriteria,
  weeklyActivities: Map<string, number>
): boolean {
  if (!criteria.min_activities_per_week || !criteria.consecutive_weeks) {
    return false;
  }

  // Check for consecutive weeks meeting the minimum, including missing weeks as breaks
  const weeks = Array.from(weeklyActivities.keys()).sort((a, b) => a.localeCompare(b));
  if (weeks.length === 0) return false;

  let consecutiveCount = 0;
  let maxConsecutive = 0;

  let cursor = weeks[0];
  const last = weeks[weeks.length - 1];

  while (cursor <= last) {
    const count = weeklyActivities.get(cursor) || 0;
    if (count >= criteria.min_activities_per_week) {
      consecutiveCount++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
    } else {
      consecutiveCount = 0;
    }

    if (cursor === last) break;
    cursor = getNextWeekKey(cursor);
  }

  return maxConsecutive >= criteria.consecutive_weeks;
}

/**
 * Check if a calculated metric (like SEI) meets the criteria
 */
async function evaluateMetricPeakCriteria(criteria: BadgeCriteria, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const activities = await db
    .select()
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId))
    .limit(500);

  if (activities.length === 0) return false;

  if (criteria.metric === "sei") {
    const seiValues = activities
      .map(a =>
        calculateSEI({
          distanceMeters: a.distanceMeters,
          durationSeconds: a.durationSeconds,
          avgPacePer100m: a.avgPacePer100m ?? undefined,
          swolfScore: a.avgSwolf ?? undefined,
          avgStrokeDistance: a.avgStrokeDistance ?? undefined,
          avgStrokes: a.avgStrokes ?? undefined,
          avgStrokeCadence: a.avgStrokeCadence ?? undefined,
          poolLengthMeters: a.poolLengthMeters ?? undefined,
        })
      )
      .filter((v): v is number => v !== null && v !== undefined);

    if (seiValues.length === 0) return false;
    const peak = Math.max(...seiValues);
    return evaluateOperator(peak, criteria.operator, criteria.value);
  }

  if (criteria.metric === "ser") {
    const serValues = activities
      .map(a =>
        calculateSER({
          distanceMeters: a.distanceMeters,
          durationSeconds: a.durationSeconds,
          avgPacePer100m: a.avgPacePer100m ?? undefined,
          swolfScore: a.avgSwolf ?? undefined,
          avgStrokeDistance: a.avgStrokeDistance ?? undefined,
          avgStrokes: a.avgStrokes ?? undefined,
          avgStrokeCadence: a.avgStrokeCadence ?? undefined,
          poolLengthMeters: a.poolLengthMeters ?? undefined,
        })
      )
      .filter((v): v is number => v !== null && v !== undefined);

    if (serValues.length === 0) return false;
    const peak = Math.max(...serValues);
    return evaluateOperator(peak, criteria.operator, criteria.value);
  }

  if (criteria.metric === "tci") {
    const tci = calculateTCI(
      activities.map(a => ({
        distanceMeters: a.distanceMeters,
        durationSeconds: a.durationSeconds,
        avgPacePer100m: a.avgPacePer100m ?? undefined,
        swolfScore: a.avgSwolf ?? undefined,
        avgStrokeDistance: a.avgStrokeDistance ?? undefined,
        avgStrokes: a.avgStrokes ?? undefined,
        avgStrokeCadence: a.avgStrokeCadence ?? undefined,
        poolLengthMeters: a.poolLengthMeters ?? undefined,
      }))
    );
    if (tci === null) return false;
    return evaluateOperator(tci, criteria.operator, criteria.value);
  }

  // Fallback: use direct activity metrics and evaluate peak
  const values = activities
    .map(a => getActivityValue(a, criteria.metric))
    .filter((v): v is number => v !== null && v !== undefined);
  if (values.length === 0) return false;
  const peak = Math.max(...values);
  return evaluateOperator(peak, criteria.operator, criteria.value);
}

/**
 * Get a value from an activity based on the metric name
 */
function getActivityValue(activity: any, metric: string): number | null {
  switch (metric) {
    case 'distance':
      return activity.distanceMeters;
    case 'duration':
      return activity.durationSeconds;
    case 'swolf_score':
      return activity.swolfScore ?? activity.avgSwolf ?? null;
    case 'avg_pace_per_100m':
      return activity.avgPacePer100m;
    case 'max_heart_rate':
      return activity.maxHeartRate;
    case 'avg_heart_rate':
      return activity.avgHeartRate;
    case 'calories':
      return activity.calories;
    default:
      return null;
  }
}

/**
 * Evaluate an operator comparison
 */
function evaluateOperator(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case '>=':
      return actual >= expected;
    case '<=':
      return actual <= expected;
    case '>':
      return actual > expected;
    case '<':
      return actual < expected;
    case '==':
      return actual === expected;
    default:
      return false;
  }
}

/**
 * Get a week key (YYYY-WW format) for grouping activities
 */
function getWeekKey(date: Date): string {
  const year = date.getFullYear();
  const onejan = new Date(year, 0, 1);
  const week = Math.ceil((((date.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
  return `${year}-${String(week).padStart(2, '0')}`;
}

function parseWeekKey(weekKey: string): { year: number; week: number } {
  const [yearStr, weekStr] = weekKey.split("-");
  return { year: Number(yearStr), week: Number(weekStr) };
}

function getWeeksInYear(year: number): number {
  const lastDay = new Date(year, 11, 31);
  const key = getWeekKey(lastDay);
  return parseWeekKey(key).week;
}

function getNextWeekKey(weekKey: string): string {
  const { year, week } = parseWeekKey(weekKey);
  const weeksInYear = getWeeksInYear(year);
  if (week >= weeksInYear) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(week + 1).padStart(2, '0')}`;
}
