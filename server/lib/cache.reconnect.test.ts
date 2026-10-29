/**
 * Self-repair of the Redis client: a socket that is open but never answers
 * (hung handshake, or a ready socket gone silent) must be thrown away and
 * replaced, at most once every REDIS_RECONNECT_MIN_INTERVAL_MS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  clients: [] as any[],
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("redis", async () => {
  const { EventEmitter } = await import("node:events");
  class FakeClient extends EventEmitter {
    isOpen = false;
    isReady = false;
    /** Resolves the pending connect() once the handshake "completes". */
    private finishHandshake?: () => void;
    connect = vi.fn(() => {
      if (this.isOpen) return Promise.reject(new Error("Socket already opened"));
      this.isOpen = true;
      // TCP connected, handshake started (and, unless the test says so, never finishes).
      queueMicrotask(() => this.emit("connect"));
      return new Promise<this>((resolve) => {
        this.finishHandshake = () => resolve(this);
      });
    });
    destroy = vi.fn(() => {
      if (!this.isOpen) throw new Error("The client is closed");
      this.isOpen = false;
      this.isReady = false;
      this.emit("end");
      this.finishHandshake?.(); // node-redis lets the pending connect() settle
    });
    get = vi.fn(() => new Promise<never>(() => {})); // silent
    becomeReady() {
      this.isReady = true;
      this.emit("ready");
      this.finishHandshake?.();
    }
  }
  return {
    createClient: () => {
      const client = new FakeClient();
      m.clients.push(client);
      return client;
    },
  };
});
vi.mock("../middleware/logger", () => ({ logger: m.logger }));

type CacheModule = typeof import("./cache");
type TimeoutModule = typeof import("./with-timeout");
let cache: CacheModule;
let timeouts: TimeoutModule;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  m.clients.length = 0;
  vi.resetModules(); // fresh client, breaker and reconnect throttle per test
  cache = await import("./cache");
  timeouts = await import("./with-timeout");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("hung handshake", () => {
  it("is abandoned after REDIS_HANDSHAKE_TIMEOUT_MS: old client destroyed, a new one connects", async () => {
    void cache.connectRedis();
    await vi.advanceTimersByTimeAsync(0);
    const first = m.clients[0];
    expect(first.connect).toHaveBeenCalledTimes(1);
    expect(cache.redis).toBe(first);

    await vi.advanceTimersByTimeAsync(cache.REDIS_HANDSHAKE_TIMEOUT_MS - 100);
    expect(m.clients).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(200);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(m.clients).toHaveLength(2);
    expect(m.clients[1].connect).toHaveBeenCalledTimes(1);
    expect(cache.redis).toBe(m.clients[1]); // importers see the new client
  });

  it("retries a server that keeps hanging no more often than every REDIS_RECONNECT_MIN_INTERVAL_MS", async () => {
    void cache.connectRedis();
    // Two minutes of a server that accepts TCP but never answers.
    await vi.advanceTimersByTimeAsync(120_000);
    // t≈5 s first repair, then one per 30 s: 5, 35, 65, 95 → 4 repairs, 5 clients.
    expect(m.clients).toHaveLength(5);
    for (const old of m.clients.slice(0, -1)) expect(old.destroy).toHaveBeenCalledTimes(1);
    expect(m.clients.at(-1).destroy).not.toHaveBeenCalled();
    const reconnectLogs = m.logger.warn.mock.calls.filter((c) => c[1]?.event === "redis:reconnect");
    expect(reconnectLogs).toHaveLength(4);
  });

  it("a client that becomes ready in time is left alone", async () => {
    void cache.connectRedis();
    await vi.advanceTimersByTimeAsync(1000);
    m.clients[0].becomeReady();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(m.clients).toHaveLength(1);
    expect(m.clients[0].destroy).not.toHaveBeenCalled();
  });

  it("a pending retry is dropped if the client recovered meanwhile", async () => {
    void cache.connectRedis();
    await vi.advanceTimersByTimeAsync(cache.REDIS_HANDSHAKE_TIMEOUT_MS + 100); // repair #1 → client 2
    await vi.advanceTimersByTimeAsync(cache.REDIS_HANDSHAKE_TIMEOUT_MS + 100); // client 2 hangs → retry deferred
    expect(m.clients).toHaveLength(2);
    m.clients[1].becomeReady();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(m.clients).toHaveLength(2);
  });
});

describe("ready socket that goes silent", () => {
  async function readyClient() {
    void cache.connectRedis();
    await vi.advanceTimersByTimeAsync(0);
    m.clients[0].becomeReady();
    await vi.advanceTimersByTimeAsync(0);
    return m.clients[0];
  }

  async function timeOutGets(n: number) {
    const gets = Array.from({ length: n }, (_, i) => cache.getCached(`k${i}`));
    await vi.advanceTimersByTimeAsync(timeouts.REDIS_COMMAND_TIMEOUT_MS + 10);
    await expect(Promise.all(gets)).resolves.toEqual(Array(n).fill(null));
  }

  it("the circuit opening destroys the client and connects a new one", async () => {
    const first = await readyClient();
    await timeOutGets(timeouts.REDIS_CIRCUIT_THRESHOLD);
    expect(timeouts.isRedisCircuitOpen()).toBe(true);
    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(m.clients).toHaveLength(2);
    expect(cache.redis).toBe(m.clients[1]);
    expect(m.clients[1].connect).toHaveBeenCalledTimes(1);
  });

  it("the new client becoming ready closes the circuit so the cache works again at once", async () => {
    await readyClient();
    await timeOutGets(timeouts.REDIS_CIRCUIT_THRESHOLD);
    expect(timeouts.isRedisCircuitOpen()).toBe(true);
    m.clients[1].get.mockResolvedValue(JSON.stringify({ hit: true }));
    m.clients[1].becomeReady();
    expect(timeouts.isRedisCircuitOpen()).toBe(false);
    await expect(cache.getCached("k")).resolves.toEqual({ hit: true });
  });

  it("repeated repair requests within the interval run a single reconnect", async () => {
    await readyClient();
    expect(cache.requestRedisReconnect("test")).toBe(true);
    expect(cache.requestRedisReconnect("test")).toBe(false);
    expect(cache.requestRedisReconnect("test")).toBe(false);
    expect(m.clients).toHaveLength(2);
  });

  it("events from a retired client are ignored", async () => {
    const first = await readyClient();
    cache.requestRedisReconnect("test");
    vi.clearAllMocks();
    first.emit("error", new Error("late error from the old socket"));
    first.emit("ready");
    expect(m.logger.error).not.toHaveBeenCalled();
    expect(m.logger.info).not.toHaveBeenCalled();
  });
});
