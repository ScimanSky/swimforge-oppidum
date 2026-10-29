/**
 * Bound a promise in time so a dependency that never answers (e.g. a Redis
 * socket that died without being noticed) cannot hang a request forever.
 *
 * Imports nothing from `./cache`, so it can be used from modules whose tests
 * mock `./cache` wholesale.
 */
import { logger } from "../middleware/logger";

/** Per-call budget for Redis commands made on the request path. */
export const REDIS_COMMAND_TIMEOUT_MS = 1500;
/** Consecutive Redis timeouts that open the circuit. */
export const REDIS_CIRCUIT_THRESHOLD = 3;
/** How long Redis calls are skipped once the circuit is open. */
export const REDIS_CIRCUIT_OPEN_MS = 30_000;

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export class RedisCircuitOpenError extends Error {
  constructor(label: string) {
    super(`${label} skipped: Redis circuit open after repeated timeouts`);
    this.name = "RedisCircuitOpenError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  // If we stop waiting, a late rejection must not become an unhandledRejection.
  promise.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

let consecutiveRedisTimeouts = 0;
let redisCircuitOpenUntil = 0;

export function isRedisCircuitOpen(): boolean {
  return Date.now() < redisCircuitOpenUntil;
}

/** Test helper: close the circuit and forget past timeouts. */
export function resetRedisCircuit(): void {
  consecutiveRedisTimeouts = 0;
  redisCircuitOpenUntil = 0;
}

/**
 * Run a Redis command with a time budget. A socket that is connected but
 * silent would otherwise cost every request the full timeout, so after
 * REDIS_CIRCUIT_THRESHOLD consecutive timeouts the command is not even sent
 * for REDIS_CIRCUIT_OPEN_MS (callers already treat errors as cache miss /
 * fail-open).
 */
export async function withRedisTimeout<T>(
  command: () => Promise<T>,
  label = "redis command"
): Promise<T> {
  if (isRedisCircuitOpen()) {
    throw new RedisCircuitOpenError(label);
  }
  try {
    const result = await withTimeout(command(), REDIS_COMMAND_TIMEOUT_MS, label);
    consecutiveRedisTimeouts = 0;
    return result;
  } catch (error) {
    if (error instanceof TimeoutError) {
      consecutiveRedisTimeouts += 1;
      if (consecutiveRedisTimeouts >= REDIS_CIRCUIT_THRESHOLD) {
        consecutiveRedisTimeouts = 0;
        redisCircuitOpenUntil = Date.now() + REDIS_CIRCUIT_OPEN_MS;
        logger.warn(`Redis timed out ${REDIS_CIRCUIT_THRESHOLD} times in a row; skipping Redis for ${REDIS_CIRCUIT_OPEN_MS}ms`, {
          event: "redis:circuit_open",
        });
      }
    }
    throw error;
  }
}
