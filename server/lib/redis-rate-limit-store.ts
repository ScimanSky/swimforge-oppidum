/**
 * Redis-based Rate Limit Store for express-rate-limit
 * 
 * Uses existing Redis client from cache.ts with graceful fallback to in-memory
 * if Redis is not connected.
 */

import type { Store, IncrementResponse } from 'express-rate-limit';
import { redis } from './cache';
import { getRedisPolicy } from './redis-policy';
import { logger } from '../middleware/logger';
import { withRedisTimeout } from './with-timeout';
import { LOG_THROTTLE_MS, logThrottled } from './throttled-log';

// Cleanup expired local store entries at most once per minute to avoid performance overhead
const LOCAL_STORE_CLEANUP_INTERVAL_MS = 60000;

export class RedisRateLimitStore implements Store {
  prefix: string;
  resetExpiryOnChange: boolean;
  windowMs: number;
  localKeys: boolean;
  private localStore: Map<string, { count: number; resetTime: number }> = new Map();
  private lastCleanup: number = Date.now();
  private lastFailOpenLogAt = Number.NEGATIVE_INFINITY;
  private lastFailClosedLogAt = Number.NEGATIVE_INFINITY;

  constructor(options: { prefix?: string; windowMs: number; resetExpiryOnChange?: boolean }) {
    this.prefix = options.prefix || 'rl:';
    this.windowMs = options.windowMs;
    this.resetExpiryOnChange = options.resetExpiryOnChange ?? false;
    this.localKeys = false; // Redis is shared across instances
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  private incrementLocal(key: string): IncrementResponse {
    const now = Date.now();
    const existing = this.localStore.get(key);
    
    if (existing && existing.resetTime > now) {
      existing.count++;
      return { totalHits: existing.count, resetTime: new Date(existing.resetTime) };
    }
    
    const resetTime = now + this.windowMs;
    this.localStore.set(key, { count: 1, resetTime });
    return { totalHits: 1, resetTime: new Date(resetTime) };
  }

  private cleanExpiredLocal(): void {
    const now = Date.now();
    // Only clean up periodically to avoid performance issues on high traffic
    if (now - this.lastCleanup < LOCAL_STORE_CLEANUP_INTERVAL_MS) {
      return;
    }
    
    const keysToDelete: string[] = [];
    this.localStore.forEach((value, key) => {
      if (value.resetTime <= now) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.localStore.delete(key));
    this.lastCleanup = now;
  }

  private shouldLog(now: number, lastAt: number): boolean {
    return now - lastAt >= LOG_THROTTLE_MS;
  }

  private failOpenMemoryFallback(key: string): IncrementResponse {
    const now = Date.now();
    if (this.shouldLog(now, this.lastFailOpenLogAt)) {
      logger.warn('Redis unavailable, using in-memory rate limit fallback (fail-open distributed)', {
        event: 'rate-limit:fail_open_memory_fallback',
        keyPrefix: this.prefix,
      });
      this.lastFailOpenLogAt = now;
    }
    this.cleanExpiredLocal();
    return this.incrementLocal(key);
  }

  private failClosedBlock(): IncrementResponse {
    const now = Date.now();
    if (this.shouldLog(now, this.lastFailClosedLogAt)) {
      logger.error('Redis unavailable with REDIS_RATE_LIMIT_MODE=block, denying requests (fail-closed)', {
        event: 'rate-limit:fail_closed_block',
        keyPrefix: this.prefix,
      });
      this.lastFailClosedLogAt = now;
    }
    return { totalHits: Number.MAX_SAFE_INTEGER, resetTime: new Date(now + this.windowMs) };
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redisKey = this.getKey(key);
    const policy = getRedisPolicy();
    
    try {
      // Not ready = disconnected or reconnecting (isOpen stays true while the
      // client retries): skip Redis without trying, the fallback logs once a minute.
      if (!redis.isReady) {
        return policy.rateLimitMode === 'block'
          ? this.failClosedBlock()
          : this.failOpenMemoryFallback(key);
      }

      // Use individual commands instead of multi() — pTTL is not available in multi
      const totalHits = await withRedisTimeout(() => redis.incr(redisKey), 'rate-limit INCR');
      let ttl = await withRedisTimeout(() => redis.pTTL(redisKey), 'rate-limit PTTL');

      // Set the window on the first hit, and also whenever the key has no TTL
      // (-1): if an earlier PEXPIRE failed or timed out after INCR created the
      // key, it would otherwise never expire and the client would stay limited
      // forever.
      if (totalHits === 1 || ttl === -1) {
        await withRedisTimeout(() => redis.pExpire(redisKey, this.windowMs), 'rate-limit PEXPIRE');
        ttl = this.windowMs;
      }

      const resetTime = ttl > 0 ? new Date(Date.now() + ttl) : undefined;

      return { totalHits, resetTime };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logThrottled('error', 'rate-limit:increment_failed', `Rate limit increment failed: ${message}`);
      return policy.rateLimitMode === 'block'
        ? this.failClosedBlock()
        : this.failOpenMemoryFallback(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isReady) return;
      
      const current = await withRedisTimeout(() => redis.get(redisKey), 'rate-limit GET');
      if (current) {
        const currentStr = current;
        if (parseInt(currentStr) > 0) {
          await withRedisTimeout(() => redis.decr(redisKey), 'rate-limit DECR');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logThrottled('error', 'rate-limit:decrement_failed', `Rate limit decrement failed: ${message}`);
    }
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isReady) return;
      await withRedisTimeout(() => redis.del(redisKey), 'rate-limit DEL');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logThrottled('error', 'rate-limit:reset_failed', `Rate limit reset failed: ${message}`);
    }
  }

  // Optional: Get current hit count
  async get(key: string): Promise<{ totalHits: number; resetTime: Date | undefined } | undefined> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isReady) return undefined;
      
      const value = await withRedisTimeout(() => redis.get(redisKey), 'rate-limit GET');
      if (!value) return undefined;
      
      const valueStr = value;
      const ttl = await withRedisTimeout(() => redis.pTTL(redisKey), 'rate-limit PTTL');
      const ttlNum = typeof ttl === 'number' ? ttl : -1;
      const resetTime = ttlNum > 0 ? new Date(Date.now() + ttlNum) : undefined;
      
      return { totalHits: parseInt(valueStr), resetTime };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logThrottled('error', 'rate-limit:get_failed', `Rate limit get failed: ${message}`);
      return undefined;
    }
  }

  // Optional: Initialize store (called once when store is created)
  init?(): void {
    const policy = getRedisPolicy();
    const status = redis.isReady ? 'connected' : 'disconnected';
    logger.info(`Redis rate limit store initialized (Redis: ${status})`, {
      event: 'rate-limit:store_init',
      redisConnected: redis.isReady,
      rateLimitMode: policy.rateLimitMode,
      rateLimitFailOpen: policy.rateLimitFailOpen,
    });
  }
}

/**
 * Create a Redis-based store for rate limiters
 */
export function createRedisStore(options: { prefix?: string; windowMs: number }): Store {
  return new RedisRateLimitStore(options);
}
