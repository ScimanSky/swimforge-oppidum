/**
 * Redis Caching System
 * 
 * Provides caching layer for expensive queries
 * Reduces database load and improves response times by 10-100x
 */

import { createClient } from 'redis';
import { logger } from './logger';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

redis.on('error', (err) => {
  logger.error({
    event: 'redis:error',
    message: err.message,
  });
});

redis.on('connect', () => {
  logger.info({
    event: 'redis:connected',
    message: 'Connected to Redis',
  });
});

// Connect to Redis
export async function connectRedis() {
  try {
    await redis.connect();
    logger.info({ event: 'redis:ready', message: 'Redis ready' });
  } catch (error) {
    logger.error({
      event: 'redis:connection_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Cache TTL (Time To Live) in seconds
 */
export const CACHE_TTL = {
  LEADERBOARD: 3600,        // 1 hour
  USER_STATS: 300,          // 5 minutes
  BADGES: 86400,            // 24 hours
  ACTIVITIES: 60,           // 1 minute
  PROFILE: 1800,            // 30 minutes
  SEARCH: 600,              // 10 minutes
};

/**
 * Get cached value
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    if (!cached) return null;

    logger.debug({
      event: 'cache:hit',
      key,
    });

    return JSON.parse(cached) as T;
  } catch (error) {
    logger.error({
      event: 'cache:get_failed',
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Set cached value
 */
export async function setCached<T>(
  key: string,
  value: T,
  ttl: number = 3600
): Promise<void> {
  try {
    await redis.setEx(key, ttl, JSON.stringify(value));

    logger.debug({
      event: 'cache:set',
      key,
      ttl,
    });
  } catch (error) {
    logger.error({
      event: 'cache:set_failed',
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete cached value
 */
export async function deleteCached(key: string): Promise<void> {
  try {
    await redis.del(key);

    logger.debug({
      event: 'cache:delete',
      key,
    });
  } catch (error) {
    logger.error({
      event: 'cache:delete_failed',
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete multiple cached values
 */
export async function deleteMultipleCached(keys: string[]): Promise<void> {
  try {
    if (keys.length === 0) return;

    await redis.del(keys);

    logger.debug({
      event: 'cache:delete_multiple',
      count: keys.length,
    });
  } catch (error) {
    logger.error({
      event: 'cache:delete_multiple_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get or set cached value
 */
export async function getOrSetCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 3600
): Promise<T> {
  // Try cache first
  const cached = await getCached<T>(key);
  if (cached) return cached;

  // Fetch from source
  const data = await fetcher();

  // Cache result
  await setCached(key, data, ttl);

  return data;
}

/**
 * Invalidate cache patterns
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
      logger.debug({
        event: 'cache:invalidate_pattern',
        pattern,
        count: keys.length,
      });
    }
  } catch (error) {
    logger.error({
      event: 'cache:invalidate_pattern_failed',
      pattern,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Cache key builders
 */
export const cacheKeys = {
  leaderboard: (limit: number, offset: number) =>
    `leaderboard:${limit}:${offset}`,
  userStats: (userId: string) => `user:stats:${userId}`,
  userProfile: (userId: string) => `user:profile:${userId}`,
  badges: (userId: string) => `user:badges:${userId}`,
  activities: (userId: string, limit: number, offset: number) =>
    `user:activities:${userId}:${limit}:${offset}`,
  search: (query: string) => `search:${query}`,
  badgeDefinitions: () => 'badge:definitions',
};

/**
 * Invalidate user-related caches
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  const keys = [
    cacheKeys.userStats(userId),
    cacheKeys.userProfile(userId),
    cacheKeys.badges(userId),
    `user:activities:${userId}:*`,
  ];

  await deleteMultipleCached(keys);
  await invalidateCachePattern(`user:activities:${userId}:*`);
}

/**
 * Invalidate leaderboard cache
 */
export async function invalidateLeaderboardCache(): Promise<void> {
  await invalidateCachePattern('leaderboard:*');
}

/**
 * Get cache stats
 */
export async function getCacheStats() {
  try {
    const info = await redis.info('stats');
    const keys = await redis.dbSize();

    return {
      keys,
      info,
    };
  } catch (error) {
    logger.error({
      event: 'cache:stats_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}
