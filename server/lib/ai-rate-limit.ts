/**
 * Per-user limits on the Gemini calls of the Coach page, counted in Redis (shared by the
 * instances, with the store's in-memory fallback, see RedisRateLimitStore).
 *
 * The express `aiCoachLimiter` (middleware/security.ts) is not mounted on these procedures: it
 * counts per IP (testers on the same mobile network share one), counts every request (cache hits
 * included) and answers 429 by writing the shared Express response, which would break the other
 * calls of a tRPC batch.
 */
import { RedisRateLimitStore } from "./redis-rate-limit-store";

const HOUR_MS = 60 * 60 * 1000;

export interface UserRateLimit {
  /** Counts one use by the user: false when they are over the limit of the current window. */
  consume(userId: number): Promise<boolean>;
}

export function createUserRateLimit(options: { prefix: string; windowMs: number; max: number }): UserRateLimit {
  const store = new RedisRateLimitStore({ prefix: options.prefix, windowMs: options.windowMs });
  return {
    async consume(userId) {
      const { totalHits } = await store.increment(String(userId));
      return totalHits <= options.max;
    },
  };
}

/**
 * Gemini generations of the Coach page insights. Normally at most one every 6 hours (new swims)
 * or 24 hours (expiry); the margin covers a failed or incomplete answer retried on the next visit.
 */
export const aiInsightsRateLimit = createUserRateLimit({ prefix: "rl:ai-insights:", windowMs: HOUR_MS, max: 4 });

/** «Genera allenamenti» (two Gemini calls each): the 7-day cooldown makes a real use rare. */
export const aiWorkoutsRateLimit = createUserRateLimit({ prefix: "rl:ai-workouts:", windowMs: HOUR_MS, max: 5 });

/** Shown when «Genera allenamenti» is over its limit. */
export const AI_RATE_LIMIT_MESSAGE = "Troppe richieste al coach AI. Riprova tra un'ora.";
