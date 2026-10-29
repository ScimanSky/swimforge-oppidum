/**
 * Redis Caching System
 * 
 * Provides caching layer for expensive queries
 * Reduces database load and improves response times by 10-100x
 */

import { createClient } from 'redis';
import { logger } from '../middleware/logger';
import { randomUUID } from 'node:crypto';
import { getRedisPolicy } from './redis-policy';
import {
  REDIS_COMMAND_TIMEOUT_MS,
  isRedisCircuitOpen,
  onRedisCircuitOpen,
  resetRedisCircuit,
  withRedisTimeout,
  withTimeout,
} from './with-timeout';
import { logThrottled } from './throttled-log';

/**
 * Largest serialized value we send to Redis. Upstash rejects requests over
 * 10 MB by closing the socket, which used to throw the client into a reconnect
 * loop; anything this big is not worth caching anyway.
 */
export const CACHE_MAX_VALUE_BYTES = 1024 * 1024;

/** A TCP-connected socket that has not become ready within this is abandoned. */
export const REDIS_HANDSHAKE_TIMEOUT_MS = 5000;
/** Minimum spacing between two forced reconnects (replacing the client). */
export const REDIS_RECONNECT_MIN_INTERVAL_MS = 30_000;

function createRedisClient() {
  return createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    // Reject commands while reconnecting instead of queueing them until the
    // socket comes back (they would hang the requests waiting on them).
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 5000,
      // Never give up for good: a client that stopped reconnecting stays in
      // degraded mode until the process restarts. Back off to 30 s instead.
      reconnectStrategy: (retries) => {
        if (retries > 20) return 30_000;
        return Math.min(100 + retries * 200, 5000);
      },
    },
  });
}

type RedisClient = ReturnType<typeof createRedisClient>;

/**
 * Create a client and wire its events. Events from a client that has since
 * been replaced (see requestRedisReconnect) are ignored.
 */
function buildRedisClient(): RedisClient {
  const client = createRedisClient();
  let handshakeTimer: ReturnType<typeof setTimeout> | undefined;
  const clearHandshakeTimer = () => {
    if (handshakeTimer) clearTimeout(handshakeTimer);
    handshakeTimer = undefined;
  };

  client.on('error', (err) => {
    clearHandshakeTimer();
    if (client !== redis) return;
    if (reconnectInFlight === client) reconnectInFlight = null;
    const message = err instanceof Error ? err.message : String(err);
    // Emitted on every reconnect attempt during an outage: keep it bounded.
    logThrottled('error', 'redis:error', `Redis error: ${message}`, {
      stack: err instanceof Error ? err.stack : undefined,
    });
  });

  // 'connect' = TCP connected, handshake starting. node-redis does not bound
  // the handshake: against a server that accepts but never answers it waits
  // forever with isOpen true and no error, so bound it here.
  client.on('connect', () => {
    if (client !== redis) return;
    logger.info('Connected to Redis', { event: 'redis:connected' });
    clearHandshakeTimer();
    handshakeTimer = setTimeout(() => {
      handshakeTimer = undefined;
      if (client !== redis || client.isReady || !client.isOpen) return;
      if (reconnectInFlight === client) reconnectInFlight = null;
      logThrottled('warn', 'redis:handshake_timeout', `Redis did not become ready within ${REDIS_HANDSHAKE_TIMEOUT_MS}ms of connecting`);
      requestRedisReconnect('handshake_timeout');
    }, REDIS_HANDSHAKE_TIMEOUT_MS);
    handshakeTimer.unref?.();
  });

  client.on('ready', () => {
    clearHandshakeTimer();
    if (client !== redis) return;
    if (reconnectInFlight === client) reconnectInFlight = null;
    // Timeouts counted against the previous socket say nothing about this one.
    resetRedisCircuit();
    logger.info('Redis ready', { event: 'redis:ready' });
  });

  client.on('end', clearHandshakeTimer);

  return client;
}

/**
 * The shared client. `let` on purpose: requestRedisReconnect replaces it, and
 * ES module importers (`import { redis }`) see the new one.
 */
export let redis: RedisClient = buildRedisClient();

/** The client whose forced reconnect has not finished (ready, error or handshake timeout). */
let reconnectInFlight: RedisClient | null = null;
let lastReconnectAt = Number.NEGATIVE_INFINITY;
let deferredReconnect: ReturnType<typeof setTimeout> | undefined;

function startRedisConnect(client: RedisClient): Promise<unknown> {
  // connect() rejects only if the reconnect strategy gives up (ours never
  // does) or the client is already open; never let it go unhandled.
  const attempt = client.connect();
  attempt.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    logThrottled('warn', 'redis:connect_failed', `Redis connect failed: ${message}`);
  });
  return attempt;
}

/**
 * Throw the current client away and connect a new one. Used when the socket is
 * open but useless: the handshake never completed, or a ready socket went
 * silent (the circuit breaker opened). node-redis cannot notice either case
 * on its own: no error event, isOpen stays true.
 *
 * A new client is used instead of destroy() + connect() on the same one
 * because node-redis may still be running its own reconnect loop on the old
 * socket; reconnecting the same client would race two loops on one client.
 *
 * Runs at most one at a time and at most once every
 * REDIS_RECONNECT_MIN_INTERVAL_MS; a request that comes too early is retried
 * when allowed, if Redis is still not usable by then.
 * Returns true if a reconnect was started now.
 */
export function requestRedisReconnect(reason: string): boolean {
  const wait = lastReconnectAt + REDIS_RECONNECT_MIN_INTERVAL_MS - Date.now();
  if (reconnectInFlight !== null || wait > 0) {
    if (!deferredReconnect) {
      deferredReconnect = setTimeout(() => {
        deferredReconnect = undefined;
        if (!redis.isReady || isRedisCircuitOpen()) requestRedisReconnect(reason);
      }, Math.max(wait, 1000));
      deferredReconnect.unref?.();
    }
    return false;
  }

  lastReconnectAt = Date.now();
  logger.warn(`Recreating the Redis connection (${reason})`, { event: 'redis:reconnect', reason });

  const previous = redis;
  try {
    // Rejects its pending commands at once and closes the socket.
    if (previous.isOpen) previous.destroy();
  } catch {
    // already closed
  }

  const next = buildRedisClient();
  redis = next;
  reconnectInFlight = next;
  void startRedisConnect(next);
  return true;
}

onRedisCircuitOpen(() => {
  requestRedisReconnect('circuit_open');
});

// Connect to Redis (non-blocking)
export async function connectRedis() {
  const policy = getRedisPolicy();
  logger.info('Redis runtime policy initialized', {
    event: 'redis:policy',
    redisConfigured: policy.redisConfigured,
    redisRequiredForReady: policy.redisRequiredForReady,
    rateLimitMode: policy.rateLimitMode,
    rateLimitFailOpen: policy.rateLimitFailOpen,
  });

  try {
    // Bounded wait for startup logging only; the handshake watchdog above
    // takes care of a connection that hangs.
    await withTimeout(startRedisConnect(redis), REDIS_HANDSHAKE_TIMEOUT_MS, 'Redis connection');
    if (!redis.isReady) throw new Error('Redis not ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(`Redis connection warning: ${message}. Running in degraded mode`, {
      event: 'redis:degraded_mode',
      redisRequiredForReady: policy.redisRequiredForReady,
      rateLimitMode: policy.rateLimitMode,
    });
    // Don't throw - allow app to continue without Redis
  }
}

/**
 * Cache TTL (Time To Live) in seconds
 */
export const CACHE_TTL = {
  LEADERBOARD: 120,         // 2 minutes (near-real-time)
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

/**
 * Try to take a short-lived lock.
 * - `{ token }`: we own it
 * - `'busy'`: someone else holds it
 * - `'unavailable'`: Redis errored or did not answer in time (callers must not wait on it)
 */
async function acquireLock(
  lockKey: string,
  ttlMs: number
): Promise<{ token: string } | 'busy' | 'unavailable'> {
  if (!redis.isReady) return 'unavailable';
  const token = randomUUID();
  try {
    const res = await withRedisTimeout(
      () => redis.set(lockKey, token, { NX: true, PX: ttlMs }),
      `SET ${lockKey}`
    );
    if (res !== 'OK') return 'busy';
    return { token };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logThrottled('warn', 'cache:lock_unavailable', `Failed to acquire cache lock ${lockKey}: ${message}`);
    return 'unavailable';
  }
}

async function releaseLock(lockKey: string, token: string): Promise<void> {
  if (!redis.isReady) return;
  // Only delete the lock if we still own it (prevents unlocking someone else's lock after TTL expiry).
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  try {
    await withRedisTimeout(() => redis.eval(script, { keys: [lockKey], arguments: [token] }), `EVAL release ${lockKey}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logThrottled('warn', 'cache:lock_release_failed', `Failed to release cache lock ${lockKey}: ${message}`);
  }
}

/**
 * Get cached value
 */
export async function getCached<T>(key: string): Promise<T | null> {
  try {
    if (!redis.isReady) return null; // Redis not connected (or reconnecting)
    const cached = await withRedisTimeout(() => redis.get(key), `GET ${key}`);
    if (!cached) return null;

    logger.debug(`Cache hit: ${key}`, {
      event: 'cache:hit',
    });

    // node-redis returns a string (or null); parse JSON payload.
    return JSON.parse(cached) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logThrottled('error', 'cache:get_failed', `Cache get failed for key ${key}: ${message}`);
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
    if (!redis.isReady) return; // Redis not connected (or reconnecting)
    const payload = JSON.stringify(value);
    if (payload === undefined) return;
    const bytes = Buffer.byteLength(payload, 'utf8');
    if (bytes > CACHE_MAX_VALUE_BYTES) {
      logger.warn(`Cache set skipped for key ${key}: ${bytes} bytes exceeds ${CACHE_MAX_VALUE_BYTES}`, {
        event: 'cache:set_skipped_oversize',
        key,
        bytes,
        limitBytes: CACHE_MAX_VALUE_BYTES,
      });
      return;
    }
    await withRedisTimeout(() => redis.setEx(key, ttl, payload), `SETEX ${key}`);

    logger.debug(`Cache set: ${key} (TTL: ${ttl}s)`, {
      event: 'cache:set',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logThrottled('error', 'cache:set_failed', `Cache set failed for key ${key}: ${message}`);
  }
}

/**
 * Delete cached value
 */
export async function deleteCached(key: string): Promise<void> {
  try {
    if (!redis.isReady) return; // Redis not connected (or reconnecting)
    await withRedisTimeout(() => redis.del(key), `DEL ${key}`);

    logger.debug(`Cache delete: ${key}`, {
      event: 'cache:delete',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logThrottled('error', 'cache:delete_failed', `Cache delete failed for key ${key}: ${message}`);
  }
}

/**
 * Delete multiple cached values
 */
export async function deleteMultipleCached(keys: string[]): Promise<void> {
  try {
    if (!redis.isReady || keys.length === 0) return; // Redis not connected (or reconnecting)
    await withRedisTimeout(() => redis.del(keys), `DEL ${keys.length} keys`);

    logger.debug(`Cache delete multiple: ${keys.length} keys`, {
      event: 'cache:delete_multiple',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logThrottled('warn', 'redis:connection_warning', `Redis connection warning: ${message}`, {
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
  if (!redis.isReady) {
    // Redis not connected (or reconnecting); behave like a pass-through.
    return await fetcher();
  }

  // Try cache first
  const cached = await getCached<T>(key);
  if (cached) return cached;

  const lKey = lockKeyForCacheKey(key);
  const lock = await acquireLock(lKey, CACHE_LOCK_TTL_MS);

  // Redis is failing: do not wait on it, serve straight from the source.
  if (lock === 'unavailable') {
    return await fetcher();
  }

  // If we didn't get the lock, wait for the other worker to populate the cache.
  if (lock === 'busy') {
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
    if (!redis.isReady || isRedisCircuitOpen()) return; // Redis not connected / not answering
    const work = async () => {
      const keysToDelete: string[] = [];

      // Use SCAN instead of KEYS to avoid blocking Redis on Upstash
      for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
        keysToDelete.push(String(key));
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
    };
    // SCAN may take a few round trips: give it a larger, but still bounded, budget.
    await withTimeout(work(), REDIS_COMMAND_TIMEOUT_MS * 3, `invalidate ${pattern}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logThrottled('error', 'cache:invalidate_pattern_failed', `Cache invalidate pattern failed for ${pattern}: ${message}`);
  }
}

/**
 * Cache key builders
 */
export const cacheKeys = {
  // v3: payloads cached up to v2 carried users' emails; bumping the version makes
  // the server never read them again (they expire on their own TTL).
  // v4: badgeCount/periodXp are numbers (v3 payloads carried them as strings).
  leaderboard: (orderBy: string, period: string, limit: number, offset: number) =>
    `leaderboard:v4:${orderBy}:${period}:${limit}:${offset}`,
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
  if (!redis.isReady) return;

  const lockKey = `lock:cache_invalidate:user:${userId}`;
  const lock = await acquireLock(lockKey, 5000);
  if (lock === 'busy' || lock === 'unavailable') {
    // Another process is already invalidating (or Redis is failing); best effort, don't race.
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
    try {
      await withRedisTimeout(() => multi.exec(), `MULTI DEL user ${userId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logThrottled('warn', 'cache:invalidate_user_failed', `Cache invalidate failed for user ${userId}: ${message}`);
    }

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
    if (!redis.isReady) {
      return { keys: 0, info: 'Redis not connected' };
    }
    const info = await withRedisTimeout(() => redis.info('stats'), 'INFO stats');
    const keys = await withRedisTimeout(() => redis.dbSize(), 'DBSIZE');

    return {
      keys,
      info,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logThrottled('error', 'cache:stats_failed', `Cache stats failed: ${message}`);
    return null;
  }
}
