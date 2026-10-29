import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted so mock objects are available before vi.mock factory runs
const { mockRedis, mockLogger } = vi.hoisted(() => ({
  mockRedis: {
    // During an outage node-redis keeps reconnecting, so isOpen stays true;
    // only isReady says whether commands can be sent.
    isOpen: true,
    isReady: true,
    incr: vi.fn(),
    pExpire: vi.fn(),
    pTTL: vi.fn(),
    get: vi.fn(),
    decr: vi.fn(),
    del: vi.fn(),
  },
  mockLogger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock cache module
vi.mock("./cache", () => ({
  redis: mockRedis,
}));

// Mock logger
vi.mock("../middleware/logger", () => ({
  logger: mockLogger,
}));

import { RedisRateLimitStore } from "./redis-rate-limit-store";
import { REDIS_COMMAND_TIMEOUT_MS, resetRedisCircuit } from "./with-timeout";
import { LOG_THROTTLE_MS, resetLogThrottle } from "./throttled-log";

describe("RedisRateLimitStore", () => {
  let store: RedisRateLimitStore;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRedisCircuit();
    resetLogThrottle();
    mockRedis.isOpen = true;
    mockRedis.isReady = true;
    delete process.env.REDIS_RATE_LIMIT_MODE;
    store = new RedisRateLimitStore({
      prefix: "test:",
      windowMs: 60000, // 1 minute
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("increment", () => {
    it("should increment and set expiry on first hit", async () => {
      mockRedis.incr.mockResolvedValue(1); // First hit
      mockRedis.pExpire.mockResolvedValue(true);
      mockRedis.pTTL.mockResolvedValue(60000);

      const result = await store.increment("test-key");

      expect(mockRedis.incr).toHaveBeenCalledWith("test:test-key");
      expect(mockRedis.pExpire).toHaveBeenCalledWith("test:test-key", 60000);
      expect(mockRedis.pTTL).toHaveBeenCalledWith("test:test-key");
      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it("should increment but not set expiry on subsequent hits", async () => {
      mockRedis.incr.mockResolvedValue(5); // Not first hit
      mockRedis.pTTL.mockResolvedValue(45000); // 45 seconds remaining

      const result = await store.increment("test-key");

      expect(mockRedis.incr).toHaveBeenCalledWith("test:test-key");
      expect(mockRedis.pExpire).not.toHaveBeenCalled(); // Should not be called
      expect(mockRedis.pTTL).toHaveBeenCalledWith("test:test-key");
      expect(result.totalHits).toBe(5);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it("repairs a key left without TTL (orphan) by setting the expiry again", async () => {
      mockRedis.incr.mockResolvedValue(3);
      mockRedis.pTTL.mockResolvedValue(-1); // No expiry: an earlier PEXPIRE was lost
      mockRedis.pExpire.mockResolvedValue(true);

      const result = await store.increment("test-key");

      expect(mockRedis.pExpire).toHaveBeenCalledWith("test:test-key", 60000);
      expect(result.totalHits).toBe(3);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it("a PEXPIRE lost on the first hit is repaired on the next hit (IP not limited forever)", async () => {
      vi.useFakeTimers();
      try {
        // First hit: INCR creates the key, PEXPIRE never answers.
        mockRedis.incr.mockResolvedValueOnce(1);
        mockRedis.pTTL.mockResolvedValueOnce(-1);
        mockRedis.pExpire.mockImplementationOnce(() => new Promise<never>(() => {}));
        const first = store.increment("orphan");
        await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 10);
        await expect(first).resolves.toMatchObject({ totalHits: 1 }); // memory fallback, request allowed

        // Next hit: the key still has no TTL, so the expiry is set now.
        mockRedis.incr.mockResolvedValueOnce(2);
        mockRedis.pTTL.mockResolvedValueOnce(-1);
        mockRedis.pExpire.mockResolvedValueOnce(true);
        const second = await store.increment("orphan");
        expect(mockRedis.pExpire).toHaveBeenLastCalledWith("test:orphan", 60000);
        expect(second.totalHits).toBe(2);
        expect(second.resetTime).toBeInstanceOf(Date);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not touch the expiry of a key that already has one", async () => {
      mockRedis.incr.mockResolvedValue(7);
      mockRedis.pTTL.mockResolvedValue(12_000);

      await store.increment("test-key");

      expect(mockRedis.pExpire).not.toHaveBeenCalled();
    });

    it("should use in-memory fallback when Redis is not connected", async () => {
      mockRedis.isReady = false;

      const result = await store.increment("test-key");

      expect(mockRedis.incr).not.toHaveBeenCalled();
      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it("should accumulate hits in in-memory fallback", async () => {
      mockRedis.isReady = false;

      const result1 = await store.increment("test-key");
      const result2 = await store.increment("test-key");
      const result3 = await store.increment("test-key");

      expect(result1.totalHits).toBe(1);
      expect(result2.totalHits).toBe(2);
      expect(result3.totalHits).toBe(3);
    });

    it("should use in-memory fallback on Redis errors", async () => {
      mockRedis.incr.mockRejectedValue(new Error("Redis connection failed"));

      const result = await store.increment("test-key");

      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it("should fail closed when REDIS_RATE_LIMIT_MODE=block and Redis is unavailable", async () => {
      process.env.REDIS_RATE_LIMIT_MODE = "block";
      mockRedis.isReady = false;

      const result = await store.increment("test-key");

      expect(result.totalHits).toBe(Number.MAX_SAFE_INTEGER);
      expect(result.resetTime).toBeInstanceOf(Date);
    });
  });

  describe("decrement", () => {
    it("should decrement if current value is greater than 0", async () => {
      mockRedis.get.mockResolvedValue("5");

      await store.decrement("test-key");

      expect(mockRedis.get).toHaveBeenCalledWith("test:test-key");
      expect(mockRedis.decr).toHaveBeenCalledWith("test:test-key");
    });

    it("should not decrement if current value is 0", async () => {
      mockRedis.get.mockResolvedValue("0");

      await store.decrement("test-key");

      expect(mockRedis.get).toHaveBeenCalledWith("test:test-key");
      expect(mockRedis.decr).not.toHaveBeenCalled();
    });

    it("should do nothing when Redis is not connected", async () => {
      mockRedis.isReady = false;

      await store.decrement("test-key");

      expect(mockRedis.get).not.toHaveBeenCalled();
      expect(mockRedis.decr).not.toHaveBeenCalled();
    });
  });

  describe("resetKey", () => {
    it("should delete the key from Redis", async () => {
      mockRedis.del.mockResolvedValue(1);

      await store.resetKey("test-key");

      expect(mockRedis.del).toHaveBeenCalledWith("test:test-key");
    });

    it("should do nothing when Redis is not connected", async () => {
      mockRedis.isReady = false;

      await store.resetKey("test-key");

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe("get", () => {
    it("should return current hits and reset time", async () => {
      mockRedis.get.mockResolvedValue("10");
      mockRedis.pTTL.mockResolvedValue(30000); // 30 seconds

      const result = await store.get("test-key");

      expect(result).toBeDefined();
      expect(result?.totalHits).toBe(10);
      expect(result?.resetTime).toBeInstanceOf(Date);
    });

    it("should return undefined if key does not exist", async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await store.get("test-key");

      expect(result).toBeUndefined();
    });

    it("should return undefined when Redis is not connected", async () => {
      mockRedis.isReady = false;

      const result = await store.get("test-key");

      expect(result).toBeUndefined();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });
  });

  describe("Redis outage (client open but not ready)", () => {
    it("short-circuits without calling Redis or logging errors, and warns at most once a minute", async () => {
      vi.useFakeTimers();
      try {
        mockRedis.isReady = false;
        for (let i = 0; i < 100; i++) await store.increment(`ip-${i % 5}`);
        await store.decrement("ip-0");
        await store.resetKey("ip-0");
        await store.get("ip-0");

        expect(mockRedis.incr).not.toHaveBeenCalled();
        expect(mockRedis.get).not.toHaveBeenCalled();
        expect(mockRedis.del).not.toHaveBeenCalled();
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledTimes(1);
        expect(mockLogger.warn.mock.calls[0][1]).toMatchObject({ event: "rate-limit:fail_open_memory_fallback" });

        vi.advanceTimersByTime(LOG_THROTTLE_MS);
        await store.increment("ip-0");
        expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("throttles the error log when every Redis call fails", async () => {
      mockRedis.incr.mockRejectedValue(new Error("The client is offline"));
      mockRedis.get.mockRejectedValue(new Error("The client is offline"));
      mockRedis.del.mockRejectedValue(new Error("The client is offline"));
      for (let i = 0; i < 50; i++) {
        await store.increment("ip");
        await store.decrement("ip");
        await store.resetKey("ip");
        await store.get("ip");
      }
      const events = mockLogger.error.mock.calls.map((c) => c[1]?.event);
      expect(events.sort()).toEqual([
        "rate-limit:decrement_failed",
        "rate-limit:get_failed",
        "rate-limit:increment_failed",
        "rate-limit:reset_failed",
      ]);
      expect(mockLogger.warn).toHaveBeenCalledTimes(1); // memory fallback notice
    });
  });

  describe("hung Redis", () => {
    const never = () => new Promise<never>(() => {});

    afterEach(() => {
      vi.useRealTimers();
    });

    it("increment lets the request through (memory fallback) when Redis never answers", async () => {
      vi.useFakeTimers();
      mockRedis.incr.mockImplementation(never);

      let settled = false;
      const p = store.increment("hung-key").then((r) => {
        settled = true;
        return r;
      });
      await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 10);
      expect(settled).toBe(true);
      const result = await p;
      expect(result.totalHits).toBe(1);
    });

    it("increment does not hang when pTTL never answers", async () => {
      vi.useFakeTimers();
      mockRedis.incr.mockResolvedValue(2);
      mockRedis.pTTL.mockImplementation(never);

      const p = store.increment("hung-ttl");
      await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 10);
      await expect(p).resolves.toMatchObject({ totalHits: 1 });
    });

    it("decrement, resetKey and get resolve when Redis never answers", async () => {
      vi.useFakeTimers();
      mockRedis.get.mockImplementation(never);
      mockRedis.del.mockImplementation(never);

      const d = store.decrement("k");
      const r = store.resetKey("k");
      const g = store.get("k");
      await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 10);
      await expect(d).resolves.toBeUndefined();
      await expect(r).resolves.toBeUndefined();
      await expect(g).resolves.toBeUndefined();
    });
  });
});
