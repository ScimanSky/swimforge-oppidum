import { describe, expect, it } from "vitest";
import { getRedisPolicy } from "./redis-policy";

describe("getRedisPolicy", () => {
  it("defaults to redis-required when REDIS_URL is configured", () => {
    const policy = getRedisPolicy({
      REDIS_URL: "redis://localhost:6379",
    } as NodeJS.ProcessEnv);

    expect(policy.redisConfigured).toBe(true);
    expect(policy.redisRequiredForReady).toBe(true);
    expect(policy.rateLimitMode).toBe("memory");
    expect(policy.rateLimitFailOpen).toBe(true);
  });

  it("allows fail-open readiness override even with REDIS_URL configured", () => {
    const policy = getRedisPolicy({
      REDIS_URL: "redis://localhost:6379",
      REDIS_REQUIRED_FOR_READY: "false",
    } as NodeJS.ProcessEnv);

    expect(policy.redisConfigured).toBe(true);
    expect(policy.redisRequiredForReady).toBe(false);
  });

  it("supports fail-closed rate limiting mode", () => {
    const policy = getRedisPolicy({
      REDIS_URL: "redis://localhost:6379",
      REDIS_RATE_LIMIT_MODE: "block",
    } as NodeJS.ProcessEnv);

    expect(policy.rateLimitMode).toBe("block");
    expect(policy.rateLimitFailOpen).toBe(false);
  });
});
