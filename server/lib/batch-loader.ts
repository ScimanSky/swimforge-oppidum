/**
 * Batch Loader for N+1 Query Elimination
 * 
 * Converts N+1 queries into single batch queries
 * Reduces query count from 101 to 1 (100x improvement)
 */

import { db } from '../db';
import { users, userBadges, badgeDefinitions } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { logger } from '../middleware/logger';

/**
 * Batch load users by IDs
 * 
 * ❌ BEFORE (N+1):
 * for (const id of userIds) {
 *   const user = await db.select().from(users).where(eq(users.id, id));
 * }
 * TOTAL: 100 queries
 * 
 * ✅ AFTER (Batch):
 * const users = await batchLoadUsers(userIds);
 * TOTAL: 1 query
 */
export async function batchLoadUsers(userIds: string[]) {
  if (userIds.length === 0) return [];

  try {
    const startTime = Date.now();

    const loadedUsers = await db
      .select()
      .from(users)
      .where(inArray(users.id, userIds));

    const duration = Date.now() - startTime;

    logger.debug({
      event: 'batch:load_users',
      count: userIds.length,
      duration,
    });

    // Return in same order as requested
    return userIds.map(
      (id) => loadedUsers.find((u) => u.id === id) || null
    );
  } catch (error) {
    logger.error({
      event: 'batch:load_users_failed',
      count: userIds.length,
      message: error instanceof Error ? error.message : String(error),
    });
    return userIds.map(() => null);
  }
}

/**
 * Batch load user badges
 */
export async function batchLoadUserBadges(userIds: string[]) {
  if (userIds.length === 0) return new Map();

  try {
    const startTime = Date.now();

    const badges = await db
      .select()
      .from(userBadges)
      .where(inArray(userBadges.userId, userIds));

    const duration = Date.now() - startTime;

    logger.debug({
      event: 'batch:load_badges',
      count: userIds.length,
      duration,
    });

    // Group by user ID
    const badgesByUser = new Map<string, typeof badges>();
    for (const badge of badges) {
      if (!badgesByUser.has(badge.userId)) {
        badgesByUser.set(badge.userId, []);
      }
      badgesByUser.get(badge.userId)!.push(badge);
    }

    return badgesByUser;
  } catch (error) {
    logger.error({
      event: 'batch:load_badges_failed',
      count: userIds.length,
      message: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  }
}

/**
 * Batch load badge definitions
 */
export async function batchLoadBadgeDefinitions(badgeIds: string[]) {
  if (badgeIds.length === 0) return [];

  try {
    const startTime = Date.now();

    const defs = await db
      .select()
      .from(badgeDefinitions)
      .where(inArray(badgeDefinitions.id, badgeIds));

    const duration = Date.now() - startTime;

    logger.debug({
      event: 'batch:load_badge_definitions',
      count: badgeIds.length,
      duration,
    });

    return defs;
  } catch (error) {
    logger.error({
      event: 'batch:load_badge_definitions_failed',
      count: badgeIds.length,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Optimized leaderboard query (no N+1)
 * 
 * ❌ BEFORE (N+1):
 * 1. SELECT * FROM swimmer_profiles LIMIT 100;
 * 2-101. SELECT * FROM users WHERE id = X; (for each profile)
 * TOTAL: 101 queries
 * 
 * ✅ AFTER (Single JOIN):
 * SELECT sp.*, u.* FROM swimmer_profiles sp
 * JOIN users u ON sp.user_id = u.id LIMIT 100;
 * TOTAL: 1 query
 */
export async function getLeaderboardOptimized(limit: number = 100, offset: number = 0) {
  try {
    const startTime = Date.now();

    // Single query with JOIN - no N+1!
    const leaderboard = await db.query.swimmerProfiles.findMany({
      limit,
      offset,
      orderBy: (profile, { desc }) => [desc(profile.totalXp)],
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            profileImage: true,
          },
        },
      },
    });

    const duration = Date.now() - startTime;

    logger.debug({
      event: 'query:leaderboard_optimized',
      count: leaderboard.length,
      duration,
    });

    return leaderboard;
  } catch (error) {
    logger.error({
      event: 'query:leaderboard_optimized_failed',
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Optimized user statistics query
 * 
 * Uses aggregation instead of N+1 queries
 */
export async function getUserStatsOptimized(userId: string) {
  try {
    const startTime = Date.now();

    // Single aggregation query - no N+1!
    const stats = await db.query.swimmingActivities.findMany({
      where: (activity, { eq }) => eq(activity.userId, userId),
      columns: {
        distanceMeters: true,
        durationSeconds: true,
        avgPacePer100m: true,
      },
    });

    const duration = Date.now() - startTime;

    logger.debug({
      event: 'query:user_stats_optimized',
      userId,
      duration,
    });

    // Calculate aggregates
    const totalActivities = stats.length;
    const totalDistance = stats.reduce((sum, s) => sum + (s.distanceMeters || 0), 0);
    const totalTime = stats.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
    const avgPace = stats.length > 0
      ? stats.reduce((sum, s) => sum + (s.avgPacePer100m || 0), 0) / stats.length
      : 0;

    return {
      totalActivities,
      totalDistance,
      totalTime,
      avgPace,
    };
  } catch (error) {
    logger.error({
      event: 'query:user_stats_optimized_failed',
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      totalActivities: 0,
      totalDistance: 0,
      totalTime: 0,
      avgPace: 0,
    };
  }
}

/**
 * Optimized user badges query
 * 
 * Single query with JOIN instead of N+1
 */
export async function getUserBadgesOptimized(userId: string) {
  try {
    const startTime = Date.now();

    // Single query with JOIN - no N+1!
    const badges = await db.query.userBadges.findMany({
      where: (badge, { eq }) => eq(badge.userId, userId),
      with: {
        badgeDefinition: {
          columns: {
            id: true,
            name: true,
            description: true,
            badgeImageUrl: true,
            rarity: true,
          },
        },
      },
      orderBy: (badge, { desc }) => [desc(badge.earnedAt)],
    });

    const duration = Date.now() - startTime;

    logger.debug({
      event: 'query:user_badges_optimized',
      userId,
      count: badges.length,
      duration,
    });

    return badges;
  } catch (error) {
    logger.error({
      event: 'query:user_badges_optimized_failed',
      userId,
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Performance comparison helper
 */
export function logQueryPerformance(
  queryName: string,
  duration: number,
  expectedBefore: number,
  expectedAfter: number
) {
  const improvement = ((expectedBefore - expectedAfter) / expectedBefore * 100).toFixed(0);

  logger.info({
    event: 'performance:query_optimized',
    query: queryName,
    duration,
    expectedBefore,
    expectedAfter,
    improvement: `${improvement}%`,
  });
}
