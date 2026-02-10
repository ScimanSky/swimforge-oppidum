/**
 * Redis Caching System
 * 
 * Provides caching layer for expensive queries
 * Reduces database load and improves response times by 10-100x
 */

import { createClient } from 'redis';
import { logger } from '../middleware/logger';
import { randomUUID } from 'node:crypto';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 20) return false; // Stop reconnecting after 20 attempts
      return Math.min(retries * 100, 3000);
    },
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

const CACHE_LOCK_TTL_MS = 10_000;
const CACHE_LOCK_MAX_WAIT_MS = 2_500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function lockKeyForCacheKey(key: string): string {
  // Keep it readable for ops; Redis keys can be long but should remain bounded by our cache key sizes.
  return `lock:cache:${key}`;
}

async function acquireLock(lockKey: string, ttlMs: number): Promise<{ token: string } | null> {
  if (!redis.isOpen) return null;
  const token = randomUUID();
  const res = await redis.set(lockKey, token, { NX: true, PX: ttlMs });
  if (res !== 'OK') return null;
  return { token };
}

async function releaseLock(lockKey: string, token: string): Promise<void> {
  if (!redis.isOpen) return;
  // Only delete the lock if we still own it (prevents unlocking someone else's lock after TTL expiry).
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  try {
    await redis.eval(script, { keys: [lockKey], arguments: [token] });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to release cache lock ${lockKey}: ${message}`, { event: 'cache:lock_release_failed' });
  }
}

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

    // Redis get returns string | Buffer, convert to string
    const cachedStr = typeof cached === 'string' ? cached : cached.toString();
    return JSON.parse(cachedStr) as T;
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
  if (!redis.isOpen) {
    // Redis not connected; behave like a pass-through.
    return await fetcher();
  }

  // Try cache first
  const cached = await getCached<T>(key);
  if (cached) return cached;

  const lKey = lockKeyForCacheKey(key);
  const lock = await acquireLock(lKey, CACHE_LOCK_TTL_MS);

  // If we didn't get the lock, wait for the other worker to populate the cache.
  if (!lock) {
    const start = Date.now();
    let backoffMs = 50;

    while (Date.now() - start < CACHE_LOCK_MAX_WAIT_MS) {
      // Small jitter to avoid thundering herd.
      const jitter = Math.floor(Math.random() * 30);
      await sleep(backoffMs + jitter);

      const cachedAfterWait = await getCached<T>(key);
      if (cachedAfterWait) return cachedAfterWait;

      backoffMs = Math.min(Math.floor(backoffMs * 1.5), 250);
    }

    // Fallback: if cache still not available, fetch directly (avoids long tail latency).
    const data = await fetcher();
    await setCached(key, data, ttl);
    return data;
  }

  try {
    // Double-check cache after acquiring lock.
    const cachedAfterLock = await getCached<T>(key);
    if (cachedAfterLock) return cachedAfterLock;

    const data = await fetcher();

    // Cache result
    await setCached(key, data, ttl);

    return data;
  } finally {
    await releaseLock(lKey, lock.token);
  }
}

/**
 * Invalidate cache patterns
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  try {
    if (!redis.isOpen) return; // Redis not connected
    const keysToDelete: string[] = [];
    
    // Use SCAN instead of KEYS to avoid blocking Redis on Upstash
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      // scanIterator returns string | Buffer, convert to string
      const keyStr = typeof key === 'string' ? key : key.toString();
      keysToDelete.push(keyStr);
    }
    
    if (keysToDelete.length > 0) {
      // Handle single key and multiple keys differently to avoid type assertion issues
      if (keysToDelete.length === 1) {
        await redis.del(keysToDelete[0]);
      } else {
        await redis.del(keysToDelete as [string, ...string[]]);
      }
      logger.debug(`Cache invalidate pattern: ${pattern} (${keysToDelete.length} keys)`, {
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
  leaderboard: (orderBy: string, period: string, limit: number, offset: number) =>
    `leaderboard:${orderBy}:${period}:${limit}:${offset}`,
  userStats: (userId: string) => `user:stats:${userId}`,
  userProfile: (userId: string) => `user:profile:${userId}`,
  badges: (userId: string) => `user:badges:${userId}`,
  activities: (key: string, limit: number, offset: number) =>
    `user:activities:${key}:${limit}:${offset}`,
  search: (query: string) => `search:${query}`,
  badgeDefinitions: () => 'badge:definitions',
};

/**
 * Invalidate user-related caches
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  if (!redis.isOpen) return;

  const lockKey = `lock:cache_invalidate:user:${userId}`;
  const lock = await acquireLock(lockKey, 5000);
  if (!lock) {
    // Another process is already invalidating; best effort, don't race.
    return;
  }

  try {
    const keys = [
      cacheKeys.userStats(userId),
      cacheKeys.userProfile(userId),
      cacheKeys.badges(userId),
      // REMOVED: `user:activities:${userId}:*` — DEL doesn't support wildcards
    ];

    // Delete fixed keys atomically.
    const multi = redis.multi();
    if (keys.length === 1) {
      multi.del(keys[0]);
    } else if (keys.length > 1) {
      multi.del(keys as [string, ...string[]]);
    }
    await multi.exec();

    // Pattern-based delete (SCAN) is best-effort; cannot be fully atomic with writes.
    await invalidateCachePattern(`user:activities:${userId}:*`);
  } finally {
    await releaseLock(lockKey, lock.token);
  }
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
