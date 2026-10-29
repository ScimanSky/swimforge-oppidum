/**
 * Rate-limited logging for failures that would otherwise repeat on every
 * request (e.g. each cache or rate-limit call while Redis is down). Docker
 * logs on the VM are not rotated, so an outage must not turn into a flood.
 *
 * Imports nothing from `./cache`, so modules whose tests mock `./cache` can
 * use it.
 */
import { logger } from "../middleware/logger";

/** Each event is logged at most once in this window. */
export const LOG_THROTTLE_MS = 60_000;

const lastLogged = new Map<string, { at: number; suppressed: number }>();

/**
 * Log `message` unless the same `event` was already logged in the last
 * LOG_THROTTLE_MS. The next line that gets through carries `suppressed`, the
 * number of occurrences dropped since the previous one.
 */
export function logThrottled(
  level: "warn" | "error",
  event: string,
  message: string,
  meta: Record<string, unknown> = {}
): void {
  const now = Date.now();
  const entry = lastLogged.get(event);
  if (entry && now - entry.at < LOG_THROTTLE_MS) {
    entry.suppressed += 1;
    return;
  }
  const suppressed = entry?.suppressed ?? 0;
  lastLogged.set(event, { at: now, suppressed: 0 });
  logger[level](message, suppressed > 0 ? { ...meta, event, suppressed } : { ...meta, event });
}

/** Test helper: forget what was logged. */
export function resetLogThrottle(): void {
  lastLogged.clear();
}
