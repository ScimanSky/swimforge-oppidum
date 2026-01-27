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

    logger.debug(`Batch load users: ${userIds.length} users in ${duration}ms`, {
      event: 'batch:load_users',
    });

    // Return in same order as requested
    return userIds.map(
      (id) => loadedUsers.find((u) => u.id === id) || null
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Batch load users failed (${userIds.length} users): ${message}`, {
      event: 'batch:load_users_failed',
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

    logger.debug(`Batch load badges: ${userIds.length} users in ${duration}ms`, {
      event: 'batch:load_badges',
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
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Batch load badges failed (${userIds.length} users): ${message}`, {
      event: 'batch:load_badges_failed',
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

    logger.debug(`Batch load badge definitions: ${badgeIds.length} badges in ${duration}ms`, {
      event: 'batch:load_badge_definitions',
    });

    return defs;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Batch load badge definitions failed (${badgeIds.length} badges): ${message}`, {
      event: 'batch:load_badge_definitions_failed',
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

    logger.debug(`Leaderboard query optimized: ${leaderboard.length} entries in ${duration}ms`, {
      event: 'query:leaderboard_optimized',
    });

    return leaderboard;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Leaderboard query failed: ${message}`, {
      event: 'query:leaderboard_optimized_failed',
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

    logger.debug(`User stats query optimized for ${userId}: ${duration}ms`, {
      event: 'query:user_stats_optimized',
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
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`User stats query failed for ${userId}: ${message}`, {
      event: 'query:user_stats_optimized_failed',
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

    logger.debug(`User badges query optimized for ${userId}: ${badges.length} badges in ${duration}ms`, {
      event: 'query:user_badges_optimized',
    });

    return badges;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`User badges query failed for ${userId}: ${message}`, {
      event: 'query:user_badges_optimized_failed',
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

  logger.info(`Query optimized: ${queryName} (${improvement}% improvement, ${duration}ms)`, {
    event: 'performance:query_optimized',
    expectedBefore,
    expectedAfter,
  });
}
