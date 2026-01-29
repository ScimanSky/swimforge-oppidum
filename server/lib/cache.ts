/**
 * Redis Caching System
 * 
 * Provides caching layer for expensive queries
 * Reduces database load and improves response times by 10-100x
 */

import { createClient } from 'redis';
import { logger } from '../middleware/logger';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 500),
  },
});

redis.on('error', (err) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Redis error: ${message}`, {
    event: 'redis:error',
    stack: err instanceof Error ? err.stack : undefined,
  });
});

redis.on('connect', () => {
  logger.info('Connected to Redis', {
    event: 'redis:connected',
  });
});

// Connect to Redis (non-blocking)
export async function connectRedis() {
  try {
    // Set a timeout for connection attempt
    const connectionPromise = redis.connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
    );

    await Promise.race([connectionPromise, timeoutPromise]);
    logger.info('Redis connected successfully', { event: 'redis:ready' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Redis connection warning: ${message}. Continuing without Redis cache`, {
      event: 'redis:connection_warning',
    });
    // Don't throw - allow app to continue without Redis
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
    if (!redis.isOpen) return null; // Redis not connected
    const cached = await redis.get(key);
    if (!cached) return null;

    logger.debug(`Cache hit: ${key}`, {
      event: 'cache:hit',
    });

    return JSON.parse(cached) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Cache get failed for key ${key}: ${message}`, {
      event: 'cache:get_failed',
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
    if (!redis.isOpen) return; // Redis not connected
    await redis.setEx(key, ttl, JSON.stringify(value));

    logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`, {
      event: 'cache:set',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Cache set failed for key ${key}: ${message}`, {
      event: 'cache:set_failed',
    });
  }
}

/**
 * Delete cached value
 */
export async function deleteCached(key: string): Promise<void> {
  try {
    if (!redis.isOpen) return; // Redis not connected
    await redis.del(key);

    logger.debug(`Cache delete: ${key}`, {
      event: 'cache:delete',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Cache delete failed for key ${key}: ${message}`, {
      event: 'cache:delete_failed',
    });
  }
}

/**
 * Delete multiple cached values
 */
export async function deleteMultipleCached(keys: string[]): Promise<void> {
  try {
    if (!redis.isOpen || keys.length === 0) return; // Redis not connected
    await redis.del(keys);

    logger.debug(`Cache delete multiple: ${keys.length} keys`, {
      event: 'cache:delete_multiple',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Redis connection warning: ${message}`, {
      event: 'redis:connection_warning',
      stack: error instanceof Error ? error.stack : undefined,
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
    if (!redis.isOpen) return; // Redis not connected
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
      logger.debug(`Cache invalidate pattern: ${pattern} (${keys.length} keys)`, {
        event: 'cache:invalidate_pattern',
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Cache invalidate pattern failed for ${pattern}: ${message}`, {
      event: 'cache:invalidate_pattern_failed',
    });
  }
}

/**
 * Cache key builders
 */
export const cacheKeys = {
  leaderboard: (orderBy: string, limit: number, offset: number) =>
    `leaderboard:${orderBy}:${limit}:${offset}`,
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
    if (!redis.isOpen) {
      return { keys: 0, info: 'Redis not connected' };
    }
    const info = await redis.info('stats');
    const keys = await redis.dbSize();

    return {
      keys,
      info,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Cache stats failed: ${message}`, {
      event: 'cache:stats_failed',
    });
    return null;
  }
}
