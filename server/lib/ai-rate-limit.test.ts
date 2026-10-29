import { describe, expect, it, vi } from "vitest";

// Redis down: the store counts in memory (REDIS_RATE_LIMIT_MODE defaults to "memory").
vi.mock("./cache", () => ({ redis: { isReady: false } }));
vi.mock("../middleware/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { aiInsightsRateLimit, aiWorkoutsRateLimit, createUserRateLimit } from "./ai-rate-limit";

describe("per-user AI rate limits", () => {
  it("allows `max` uses per user and window, then refuses; each user counts alone", async () => {
    const limit = createUserRateLimit({ prefix: "rl:test-ai:", windowMs: 60_000, max: 2 });
    expect(await limit.consume(1)).toBe(true);
    expect(await limit.consume(1)).toBe(true);
    expect(await limit.consume(1)).toBe(false);
    expect(await limit.consume(2)).toBe(true);
  });

  it("the window resets the count", async () => {
    vi.useFakeTimers();
    try {
      const limit = createUserRateLimit({ prefix: "rl:test-ai-window:", windowMs: 60_000, max: 1 });
      expect(await limit.consume(7)).toBe(true);
      expect(await limit.consume(7)).toBe(false);
      vi.advanceTimersByTime(60_001);
      expect(await limit.consume(7)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("insights: 4 Gemini generations an hour; workouts: 5 requests an hour", async () => {
    for (let i = 0; i < 4; i++) expect(await aiInsightsRateLimit.consume(99)).toBe(true);
    expect(await aiInsightsRateLimit.consume(99)).toBe(false);
    for (let i = 0; i < 5; i++) expect(await aiWorkoutsRateLimit.consume(99)).toBe(true);
    expect(await aiWorkoutsRateLimit.consume(99)).toBe(false);
  });
});
