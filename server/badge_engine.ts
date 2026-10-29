/**
 * Badge Engine - Automatic Achievement Badge System
 * 
 * This module evaluates user activities and awards achievement badges
 * based on flexible criteria defined in the database.
 */

import { getDb } from "./db";
import { achievementBadgeDefinitions, userAchievementBadges, swimmingActivities, swimmerProfiles } from "../drizzle/schema";
import { eq, and, gte, gt, sql } from "drizzle-orm";
import { logger } from "./middleware/logger";
import { loadStrokeIndexProgress } from "./swim_metrics";

interface BadgeCriteria {
  metric: string;
  operator: string;
  value: number;
  min_activities_per_week?: number;
  consecutive_weeks?: number;
}

/**
 * «stroke_index_gain» (e.g. «Efficienza Suprema»): the median Stroke Index of the last 28 days is
 * at least `min_gain_pct` above the median of the 90 days before, in the same pool length, with
 * enough swims in both windows. The summary is the efficiency card's (same guards).
 */
export interface StrokeIndexGainCriteria {
  metric?: string;
  min_gain_pct?: number;
  min_sessions_28d?: number;
  min_sessions_baseline?: number;
}

const STROKE_INDEX_GAIN_DEFAULTS = { minGainPct: 10, minSessions28d: 6, minSessionsBaseline: 6 } as const;

/** Scores of the removed invented metrics: criteria naming them never award a badge again. */
const RETIRED_METRICS = new Set(["sei", "ser", "tci"]);

type StrokeIndexSummary = {
  avg28: number | null;
  baseline: number | null;
  n28?: number;
  nBaseline?: number;
};

export function strokeIndexGainMet(summary: StrokeIndexSummary, criteria: StrokeIndexGainCriteria | null | undefined): boolean {
  const minGainPct = criteria?.min_gain_pct ?? STROKE_INDEX_GAIN_DEFAULTS.minGainPct;
  const min28 = criteria?.min_sessions_28d ?? STROKE_INDEX_GAIN_DEFAULTS.minSessions28d;
  const minBaseline = criteria?.min_sessions_baseline ?? STROKE_INDEX_GAIN_DEFAULTS.minSessionsBaseline;
  if (summary.avg28 === null || summary.baseline === null || !(summary.baseline > 0)) return false;
  if ((summary.n28 ?? 0) < min28 || (summary.nBaseline ?? 0) < minBaseline) return false;
  // Small tolerance: exactly +10% counts.
  return summary.avg28 >= summary.baseline * (1 + minGainPct / 100) - 1e-9;
}

type SwimmerProfileRow = typeof swimmerProfiles.$inferSelect;
type SwimmingActivityRow = typeof swimmingActivities.$inferSelect;

type ActivityForBadges = {
  id: number;
  activityDate: Date;
  distanceMeters: number;
  durationSeconds: number;
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
    const strokeIndexBadges: typeof pendingBadges = [];

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
        case "stroke_index_gain":
          strokeIndexBadges.push(badge);
          break;
        default:
          log.warn("Unknown badge criteria type", { userId, badgeId: badge.id, criteriaType: badge.criteriaType });
          break;
      }
    }

    // stroke_index_gain: one fresh read of the Stroke Index summary for all such badges. A failure
    // only skips these badges.
    if (strokeIndexBadges.length > 0) {
      try {
        const summary = await loadStrokeIndexProgress(userId);
        for (const badge of strokeIndexBadges) {
          if (!strokeIndexGainMet(summary, badge.criteriaJson as StrokeIndexGainCriteria | null)) continue;
          await db.insert(userAchievementBadges).values({ userId, badgeId: badge.id });
          newlyAwardedBadges.push(badge.name);
          log.info("Badge awarded", { userId, badgeId: badge.id, badgeName: badge.name, criteriaType: badge.criteriaType });
        }
      } catch (error) {
        log.warn("Stroke Index badges skipped", {
          userId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // metric_peak evaluation uses its own bounded query (already limited).
    for (const badge of metricPeakBadges) {
      const criteria = badge.criteriaJson as BadgeCriteria | null;
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
        const batch = (await db
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
          .limit(BATCH_SIZE)) as ActivityForBadges[];

        if (batch.length === 0) break;

        for (const activity of batch) {
          // Build per-week counts for consistency badges.
          if (consistencyBadges.length > 0) {
            const date = activity.activityDate;
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

        lastId = batch[batch.length - 1]!.id;

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
function evaluateAggregateTotalCriteria(criteria: BadgeCriteria, profile: SwimmerProfileRow): boolean {
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
 * Peak of a direct activity metric (distance, SWOLF, pace, heart rate...). Criteria on the removed
 * invented scores (SEI, SER, TCI) and malformed criteria never award a badge.
 */
async function evaluateMetricPeakCriteria(criteria: BadgeCriteria | null | undefined, userId: number): Promise<boolean> {
  if (!criteria || typeof criteria.metric !== "string") return false;
  if (RETIRED_METRICS.has(criteria.metric.toLowerCase())) return false;

  const db = await getDb();
  if (!db) return false;

  const activities = await db
    .select()
    .from(swimmingActivities)
    .where(eq(swimmingActivities.userId, userId))
    .limit(500);

  if (activities.length === 0) return false;

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
type ActivityValueSource = Pick<
  SwimmingActivityRow,
  | "distanceMeters"
  | "durationSeconds"
  | "avgSwolf"
  | "avgPacePer100m"
  | "maxHeartRate"
  | "avgHeartRate"
  | "calories"
>;

function getActivityValue(activity: ActivityValueSource, metric: string): number | null {
  switch (metric) {
    case 'distance':
      return activity.distanceMeters;
    case 'duration':
      return activity.durationSeconds;
    case 'swolf_score':
      return activity.avgSwolf ?? null;
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
