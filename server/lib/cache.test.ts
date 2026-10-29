import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const client = {
    isOpen: true,
    on: vi.fn(),
    connect: vi.fn(async () => {}),
    get: vi.fn(),
    set: vi.fn(),
    setEx: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
  };
  return {
    client,
    createClientOptions: undefined as any,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

vi.mock("redis", () => ({
  createClient: (options: unknown) => {
    m.createClientOptions = options;
    return m.client;
  },
}));
vi.mock("../middleware/logger", () => ({ logger: m.logger }));

import {
  CACHE_MAX_VALUE_BYTES,
  deleteCached,
  getCached,
  getOrSetCached,
  setCached,
} from "./cache";
import { REDIS_COMMAND_TIMEOUT_MS, resetRedisCircuit } from "./with-timeout";

const never = () => new Promise<never>(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  resetRedisCircuit();
  m.client.isOpen = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("redis client options", () => {
  it("rejects commands while disconnected instead of queueing them forever", () => {
    expect(m.createClientOptions.disableOfflineQueue).toBe(true);
  });

  it("keeps reconnecting instead of giving up permanently", () => {
    const strategy = m.createClientOptions.socket.reconnectStrategy as (n: number) => unknown;
    for (const retries of [1, 20, 21, 500, 10_000]) {
      const delay = strategy(retries);
      expect(typeof delay).toBe("number");
      expect(delay as number).toBeGreaterThan(0);
      expect(delay as number).toBeLessThanOrEqual(30_000);
    }
  });
});

describe("setCached", () => {
  it("serializes and stores values under the size limit", async () => {
    m.client.setEx.mockResolvedValue("OK");
    await setCached("k", { a: 1 }, 60);
    expect(m.client.setEx).toHaveBeenCalledWith("k", 60, JSON.stringify({ a: 1 }));
  });

  it("skips values larger than the limit and logs one warn with key and size", async () => {
    const big = { blob: "x".repeat(CACHE_MAX_VALUE_BYTES + 10) };
    await setCached("big-key", big, 60);
    expect(m.client.setEx).not.toHaveBeenCalled();
    expect(m.logger.warn).toHaveBeenCalledTimes(1);
    const [message, meta] = m.logger.warn.mock.calls[0];
    expect(message).toContain("big-key");
    expect(meta).toMatchObject({
      event: "cache:set_skipped_oversize",
      key: "big-key",
      bytes: JSON.stringify(big).length,
      limitBytes: CACHE_MAX_VALUE_BYTES,
    });
  });

  it("limit stays well below the Upstash 10 MB request limit", () => {
    expect(CACHE_MAX_VALUE_BYTES).toBeLessThanOrEqual(1024 * 1024);
  });

  it("does not hang when Redis never answers", async () => {
    vi.useFakeTimers();
    m.client.setEx.mockImplementation(never);
    const p = setCached("k", { a: 1 }, 60);
    await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 10);
    await expect(p).resolves.toBeUndefined();
  });
});

describe("getCached / deleteCached", () => {
  it("returns null (cache miss) when Redis never answers", async () => {
    vi.useFakeTimers();
    m.client.get.mockImplementation(never);
    const p = getCached("k");
    await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 10);
    await expect(p).resolves.toBeNull();
  });

  it("deleteCached resolves when Redis never answers", async () => {
    vi.useFakeTimers();
    m.client.del.mockImplementation(never);
    const p = deleteCached("k");
    await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 10);
    await expect(p).resolves.toBeUndefined();
  });
});

describe("getOrSetCached", () => {
  it("returns the fetcher result within the timeout when every Redis call hangs", async () => {
    vi.useFakeTimers();
    m.client.get.mockImplementation(never);
    m.client.set.mockImplementation(never);
    m.client.setEx.mockImplementation(never);
    m.client.eval.mockImplementation(never);
    const fetcher = vi.fn(async () => ["row"]);

    let settled = false;
    const p = getOrSetCached("k", fetcher, 60).then((v) => {
      settled = true;
      return v;
    });
    // get + lock attempts are each bounded; the whole call must finish within a few timeouts.
    await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS * 4);
    expect(settled).toBe(true);
    await expect(p).resolves.toEqual(["row"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("goes straight to the fetcher when Redis errors (no lock wait loop)", async () => {
    m.client.get.mockRejectedValue(new Error("socket closed"));
    m.client.set.mockRejectedValue(new Error("socket closed"));
    m.client.setEx.mockRejectedValue(new Error("socket closed"));
    const fetcher = vi.fn(async () => 42);
    const start = Date.now();
    await expect(getOrSetCached("k", fetcher, 60)).resolves.toBe(42);
    expect(Date.now() - start).toBeLessThan(500);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns the cached value on a hit", async () => {
    m.client.get.mockResolvedValue(JSON.stringify({ cached: true }));
    const fetcher = vi.fn(async () => ({ cached: false }));
    await expect(getOrSetCached("k", fetcher, 60)).resolves.toEqual({ cached: true });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("caches the fetched value when it holds the lock", async () => {
    m.client.get.mockResolvedValue(null);
    m.client.set.mockResolvedValue("OK");
    m.client.setEx.mockResolvedValue("OK");
    m.client.eval.mockResolvedValue(1);
    await expect(getOrSetCached("k", async () => ({ v: 1 }), 60)).resolves.toEqual({ v: 1 });
    expect(m.client.setEx).toHaveBeenCalledWith("k", 60, JSON.stringify({ v: 1 }));
    expect(m.client.eval).toHaveBeenCalledTimes(1);
  });

  it("is a pass-through when the client is not open", async () => {
    m.client.isOpen = false;
    await expect(getOrSetCached("k", async () => "fresh", 60)).resolves.toBe("fresh");
    expect(m.client.get).not.toHaveBeenCalled();
  });
});
