/**
 * Badge Engine - Automatic Achievement Badge System
 * 
 * This module evaluates user activities and awards achievement badges
 * based on flexible criteria defined in the database.
 */

import { getDb } from "./db";
import { achievementBadgeDefinitions, userAchievementBadges, swimmingActivities, swimmerProfiles } from "../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";

interface BadgeCriteria {
  metric: string;
  operator: string;
  value: number;
  min_activities_per_week?: number;
  consecutive_weeks?: number;
}

/**
 * Main function to check and award badges for a user
 * Called after activity sync completes
 */
export async function checkAndAwardBadges(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];

  try {
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

    // Evaluate each badge
    for (const badge of allBadges) {
      // Skip if user already has this badge
      if (ownedBadgeIds.has(badge.id)) continue;

      const criteria = badge.criteriaJson as BadgeCriteria;
      const criteriaMet = await evaluateBadgeCriteria(
        userId,
        badge.criteriaType,
        criteria,
        userActivities,
        profile
      );

      if (criteriaMet) {
        // Award the badge
        await db.insert(userAchievementBadges).values({
          userId,
          badgeId: badge.id,
        });

        newlyAwardedBadges.push(badge.name);
        console.log(`[Badge Engine] Awarded badge "${badge.name}" to user ${userId}`);
      }
    }

    return newlyAwardedBadges;
  } catch (error) {
    console.error(`[Badge Engine] Error checking badges for user ${userId}:`, error);
    return [];
  }
}

/**
 * Evaluate if a badge's criteria are met
 */
async function evaluateBadgeCriteria(
  userId: number,
  criteriaType: string,
  criteria: BadgeCriteria,
  activities: any[],
  profile: any
): Promise<boolean> {
  switch (criteriaType) {
    case 'single_activity':
      return evaluateSingleActivityCriteria(criteria, activities);

    case 'aggregate_total':
      return evaluateAggregateTotalCriteria(criteria, profile);

    case 'consistency':
      return evaluateConsistencyCriteria(criteria, activities);

    case 'metric_peak':
      return await evaluateMetricPeakCriteria(criteria, userId);

    default:
      console.warn(`[Badge Engine] Unknown criteria type: ${criteriaType}`);
      return false;
  }
}

/**
 * Check if any single activity meets the criteria
 */
function evaluateSingleActivityCriteria(criteria: BadgeCriteria, activities: any[]): boolean {
  for (const activity of activities) {
    const value = getActivityValue(activity, criteria.metric);
    if (value !== null && evaluateOperator(value, criteria.operator, criteria.value)) {
      return true;
    }
  }
  return false;
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
 * Check if consistency criteria are met (e.g., 3 sessions per week for 4 weeks)
 */
function evaluateConsistencyCriteria(criteria: BadgeCriteria, activities: any[]): boolean {
  if (!criteria.min_activities_per_week || !criteria.consecutive_weeks) {
    return false;
  }

  // Sort activities by date (oldest first)
  const sortedActivities = [...activities].sort(
    (a, b) => new Date(a.activityDate).getTime() - new Date(b.activityDate).getTime()
  );

  if (sortedActivities.length === 0) return false;

  // Group activities by week
  const weeklyActivities: Map<string, number> = new Map();

  for (const activity of sortedActivities) {
    const date = new Date(activity.activityDate);
    const weekKey = getWeekKey(date);
    weeklyActivities.set(weekKey, (weeklyActivities.get(weekKey) || 0) + 1);
  }

  // Check for consecutive weeks meeting the minimum
  const weeks = Array.from(weeklyActivities.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  
  let consecutiveCount = 0;
  let maxConsecutive = 0;

  for (let i = 0; i < weeks.length; i++) {
    const [weekKey, count] = weeks[i];

    if (count >= criteria.min_activities_per_week) {
      consecutiveCount++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
    } else {
      consecutiveCount = 0;
    }
  }

  return maxConsecutive >= criteria.consecutive_weeks;
}

/**
 * Check if a calculated metric (like SEI) meets the criteria
 */
async function evaluateMetricPeakCriteria(criteria: BadgeCriteria, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // For now, we'll calculate SEI from the most recent activities
  // In a real implementation, you might want to cache these values
  
  // This is a placeholder - you would need to implement the actual metric calculation
  // based on your metrics in db_statistics.ts
  
  return false; // TODO: Implement metric peak evaluation
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
      return activity.swolfScore;
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
