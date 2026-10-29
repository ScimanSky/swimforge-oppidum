/**
 * End-to-end check of the Redis self-repair with the real node-redis client
 * against a local TCP server that can stop answering.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import type { AddressInfo } from "node:net";

const m = vi.hoisted(() => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../middleware/logger", () => ({ logger: m.logger }));

/**
 * Minimal RESP server: answers every command (`+OK`, `$-1` for GET) unless the
 * connection is silent. `silentNew` makes new connections silent from the
 * start (handshake never completes); `silenceExisting()` mutes the open ones.
 */
function fakeRedisServer() {
  const sockets: { socket: net.Socket; silent: boolean }[] = [];
  const state = { silentNew: false, connections: 0, commands: [] as string[] };
  const server = net.createServer((socket) => {
    state.connections += 1;
    const entry = { socket, silent: state.silentNew };
    sockets.push(entry);
    socket.on("error", () => {});
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const parsed = parseCommand(buffer);
        if (!parsed) break;
        buffer = buffer.subarray(parsed.length);
        if (entry.silent) continue;
        const name = parsed.args[0]?.toUpperCase() ?? "";
        state.commands.push(name);
        socket.write(name === "GET" ? "$-1\r\n" : "+OK\r\n");
      }
    });
  });
  return {
    state,
    silenceExisting: () => sockets.forEach((s) => (s.silent = true)),
    listen: () =>
      new Promise<number>((resolve) =>
        server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port))
      ),
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((s) => s.socket.destroy());
        server.close(() => resolve());
      }),
  };
}

/** Parse one RESP array of bulk strings; null if incomplete. */
function parseCommand(buf: Buffer): { args: string[]; length: number } | null {
  let pos = 0;
  const readLine = () => {
    const end = buf.indexOf("\r\n", pos);
    if (end === -1) return null;
    const line = buf.subarray(pos, end).toString();
    pos = end + 2;
    return line;
  };
  const header = readLine();
  if (header === null || !header.startsWith("*")) return null;
  const count = Number(header.slice(1));
  const args: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = readLine();
    if (len === null) return null;
    const n = Number(len.slice(1));
    if (buf.length < pos + n + 2) return null;
    args.push(buf.subarray(pos, pos + n).toString());
    pos += n + 2;
  }
  return { args, length: pos };
}

async function waitFor(condition: () => boolean, timeoutMs: number) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("condition not met in time");
    await new Promise((r) => setTimeout(r, 25));
  }
}

let fake: ReturnType<typeof fakeRedisServer>;
let cache: typeof import("./cache");
let timeouts: typeof import("./with-timeout");
const previousRedisUrl = process.env.REDIS_URL;

beforeEach(async () => {
  vi.clearAllMocks();
  fake = fakeRedisServer();
  const port = await fake.listen();
  process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
  vi.resetModules();
  cache = await import("./cache");
  timeouts = await import("./with-timeout");
});

afterEach(async () => {
  try {
    if (cache.redis.isOpen) cache.redis.destroy();
  } catch {
    // already closed
  }
  await fake.close();
  if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = previousRedisUrl;
});

describe("real node-redis client against a silent server", () => {
  it("a handshake that never completes is retried on a new socket; cache calls stay instant and quiet", async () => {
    fake.state.silentNew = true;
    void cache.connectRedis();
    await waitFor(() => fake.state.connections === 1, 2000);
    expect(cache.redis.isOpen).toBe(true);
    expect(cache.redis.isReady).toBe(false);

    // Meanwhile requests short-circuit: no wait, no error logs.
    const start = Date.now();
    for (let i = 0; i < 20; i++) {
      await expect(cache.getCached(`k${i}`)).resolves.toBeNull();
      await expect(cache.getOrSetCached(`k${i}`, async () => i, 60)).resolves.toBe(i);
    }
    expect(Date.now() - start).toBeLessThan(200);
    expect(m.logger.error).not.toHaveBeenCalled();

    // After the handshake budget the client is replaced by one on a fresh socket.
    await waitFor(() => fake.state.connections === 2, cache.REDIS_HANDSHAKE_TIMEOUT_MS + 2000);
    const reconnects = m.logger.warn.mock.calls.filter((c) => c[1]?.event === "redis:reconnect");
    expect(reconnects).toHaveLength(1);
    expect(reconnects[0][1]).toMatchObject({ reason: "handshake_timeout" });
  }, 15_000);

  it("a ready socket that goes silent is replaced when the circuit opens, and the cache recovers", async () => {
    await cache.connectRedis();
    expect(cache.redis.isReady).toBe(true);
    const first = cache.redis;

    fake.silenceExisting(); // the open socket stops answering, no error, no close
    const gets = Array.from({ length: timeouts.REDIS_CIRCUIT_THRESHOLD }, (_, i) => cache.getCached(`k${i}`));
    await expect(Promise.all(gets)).resolves.toEqual(Array(timeouts.REDIS_CIRCUIT_THRESHOLD).fill(null));

    // Circuit opened → old client destroyed → new socket → handshake answered → ready.
    await waitFor(() => cache.redis !== first && cache.redis.isReady, 3000);
    expect(first.isOpen).toBe(false);
    expect(fake.state.connections).toBe(2);
    expect(timeouts.isRedisCircuitOpen()).toBe(false);

    const getsBefore = fake.state.commands.filter((c) => c === "GET").length;
    await expect(cache.getCached("after")).resolves.toBeNull();
    expect(fake.state.commands.filter((c) => c === "GET").length).toBe(getsBefore + 1);
  }, 15_000);
});
