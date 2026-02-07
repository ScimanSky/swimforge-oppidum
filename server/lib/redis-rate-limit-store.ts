/**
 * Redis-based Rate Limit Store for express-rate-limit
 * 
 * Uses existing Redis client from cache.ts with graceful fallback to in-memory
 * if Redis is not connected.
 */

import { Store } from 'express-rate-limit';
import { redis } from './cache';
import { logger } from '../middleware/logger';

export class RedisRateLimitStore implements Store {
  prefix: string;
  resetExpiryOnChange: boolean;
  windowMs: number;

  constructor(options: { prefix?: string; windowMs: number; resetExpiryOnChange?: boolean }) {
    this.prefix = options.prefix || 'rl:';
    this.windowMs = options.windowMs;
    this.resetExpiryOnChange = options.resetExpiryOnChange ?? false;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async increment(key: string): Promise<{ totalHits: number; resetTime?: Date }> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isOpen) {
        // Fallback to in-memory behavior - no persistent storage
        logger.debug('Redis not connected, rate limit not persisted', {
          event: 'rate-limit:redis_unavailable',
        });
        return { totalHits: 1 };
      }

      const multi = redis.multi();
      multi.incr(redisKey);
      multi.pExpire(redisKey, this.windowMs);
      multi.pTtl(redisKey);

      const results = await multi.exec();
      
      if (!results || results.length < 3) {
        throw new Error('Redis multi command failed');
      }

      const totalHits = results[0] as number;
      const ttl = results[2] as number;

      const resetTime = ttl > 0 ? new Date(Date.now() + ttl) : undefined;

      return { totalHits, resetTime };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Rate limit increment failed: ${message}`, {
        event: 'rate-limit:increment_failed',
      });
      // Fallback: return permissive value to not block users on Redis errors
      return { totalHits: 1 };
    }
  }

  async decrement(key: string): Promise<void> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isOpen) return;
      
      const current = await redis.get(redisKey);
      if (current && parseInt(current) > 0) {
        await redis.decr(redisKey);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Rate limit decrement failed: ${message}`, {
        event: 'rate-limit:decrement_failed',
      });
    }
  }

  async resetKey(key: string): Promise<void> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isOpen) return;
      await redis.del(redisKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Rate limit reset failed: ${message}`, {
        event: 'rate-limit:reset_failed',
      });
    }
  }

  // Optional: Get current hit count
  async get(key: string): Promise<number | undefined> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isOpen) return undefined;
      
      const value = await redis.get(redisKey);
      return value ? parseInt(value) : undefined;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Rate limit get failed: ${message}`, {
        event: 'rate-limit:get_failed',
      });
      return undefined;
    }
  }

  // Optional: Initialize store (called once when store is created)
  init?(): void {
    logger.info('Redis rate limit store initialized', {
      event: 'rate-limit:store_init',
    });
  }
}

/**
 * Create a Redis-based store for rate limiters
 */
export function createRedisStore(options: { prefix?: string; windowMs: number }): Store {
  return new RedisRateLimitStore(options);
}
