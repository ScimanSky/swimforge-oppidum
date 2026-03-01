export type RedisRateLimitMode = "memory" | "block";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function isProbablyConfiguredRedisUrl(value: string | undefined): value is string {
  return Boolean(value && /^rediss?:\/\//i.test(value));
}

function parseRateLimitMode(value: string | undefined): RedisRateLimitMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === "block" ? "block" : "memory";
}

export function getRedisPolicy(env: NodeJS.ProcessEnv = process.env) {
  const redisConfigured = isProbablyConfiguredRedisUrl(env.REDIS_URL);
  const redisRequiredForReady =
    env.REDIS_REQUIRED_FOR_READY === undefined
      ? redisConfigured
      : parseBool(env.REDIS_REQUIRED_FOR_READY, redisConfigured);
  const rateLimitMode = parseRateLimitMode(env.REDIS_RATE_LIMIT_MODE);

  return {
    redisConfigured,
    redisRequiredForReady,
    rateLimitMode,
    rateLimitFailOpen: rateLimitMode === "memory",
  };
}
