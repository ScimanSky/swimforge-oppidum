import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted so mock objects are available before vi.mock factory runs
const { mockRedis, mockLogger } = vi.hoisted(() => ({
  mockRedis: {
    isOpen: true,
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

describe("RedisRateLimitStore", () => {
  let store: RedisRateLimitStore;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRedisCircuit();
    mockRedis.isOpen = true;
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

    it("should return resetTime as undefined when ttl is negative", async () => {
      mockRedis.incr.mockResolvedValue(3);
      mockRedis.pTTL.mockResolvedValue(-1); // No expiry

      const result = await store.increment("test-key");

      expect(result.totalHits).toBe(3);
      expect(result.resetTime).toBeUndefined();
    });

    it("should use in-memory fallback when Redis is not connected", async () => {
      mockRedis.isOpen = false;

      const result = await store.increment("test-key");

      expect(mockRedis.incr).not.toHaveBeenCalled();
      expect(result.totalHits).toBe(1);
      expect(result.resetTime).toBeInstanceOf(Date);
    });

    it("should accumulate hits in in-memory fallback", async () => {
      mockRedis.isOpen = false;

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
      mockRedis.isOpen = false;

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
      mockRedis.isOpen = false;

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
      mockRedis.isOpen = false;

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
      mockRedis.isOpen = false;

      const result = await store.get("test-key");

      expect(result).toBeUndefined();
      expect(mockRedis.get).not.toHaveBeenCalled();
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
