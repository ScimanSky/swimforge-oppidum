/**
 * Redis-based Rate Limit Store for express-rate-limit
 * 
 * Uses existing Redis client from cache.ts with graceful fallback to in-memory
 * if Redis is not connected.
 */

import type { Store, IncrementResponse } from 'express-rate-limit';
import { redis } from './cache';
import { logger } from '../middleware/logger';

export class RedisRateLimitStore implements Store {
  prefix: string;
  resetExpiryOnChange: boolean;
  windowMs: number;
  localKeys: boolean;

  constructor(options: { prefix?: string; windowMs: number; resetExpiryOnChange?: boolean }) {
    this.prefix = options.prefix || 'rl:';
    this.windowMs = options.windowMs;
    this.resetExpiryOnChange = options.resetExpiryOnChange ?? false;
    this.localKeys = false; // Redis is shared across instances
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isOpen) {
        logger.debug('Redis not connected, rate limit not persisted', {
          event: 'rate-limit:redis_unavailable',
        });
        return { totalHits: 1, resetTime: undefined };
      }

      // Use individual commands instead of multi() — pTtl is not available in multi
      const totalHits = await redis.incr(redisKey);
      
      // Only set expiry on first increment (when totalHits is 1)
      if (totalHits === 1) {
        await redis.pExpire(redisKey, this.windowMs);
      }
      
      const ttl = await redis.pTTL(redisKey);
      const resetTime = ttl > 0 ? new Date(Date.now() + ttl) : undefined;

      return { totalHits, resetTime };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Rate limit increment failed: ${message}`, {
        event: 'rate-limit:increment_failed',
      });
      return { totalHits: 1, resetTime: undefined };
    }
  }

  async decrement(key: string): Promise<void> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isOpen) return;
      
      const current = await redis.get(redisKey);
      if (current) {
        const currentStr = typeof current === 'string' ? current : current.toString();
        if (parseInt(currentStr) > 0) {
          await redis.decr(redisKey);
        }
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
  async get(key: string): Promise<{ totalHits: number; resetTime: Date | undefined } | undefined> {
    const redisKey = this.getKey(key);
    
    try {
      if (!redis.isOpen) return undefined;
      
      const value = await redis.get(redisKey);
      if (!value) return undefined;
      
      const valueStr = typeof value === 'string' ? value : value.toString();
      const ttl = await redis.pTTL(redisKey);
      const ttlNum = typeof ttl === 'number' ? ttl : -1;
      const resetTime = ttlNum > 0 ? new Date(Date.now() + ttlNum) : undefined;
      
      return { totalHits: parseInt(valueStr), resetTime };
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
    const status = redis.isOpen ? 'connected' : 'disconnected';
    logger.info(`Redis rate limit store initialized (Redis: ${status})`, {
      event: 'rate-limit:store_init',
      redisConnected: redis.isOpen,
    });
  }
}

/**
 * Create a Redis-based store for rate limiters
 */
export function createRedisStore(options: { prefix?: string; windowMs: number }): Store {
  return new RedisRateLimitStore(options);
}
