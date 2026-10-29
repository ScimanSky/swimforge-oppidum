import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../middleware/logger", () => ({ logger: m.logger }));

import {
  REDIS_CIRCUIT_OPEN_MS,
  REDIS_CIRCUIT_THRESHOLD,
  REDIS_COMMAND_TIMEOUT_MS,
  RedisCircuitOpenError,
  TimeoutError,
  isRedisCircuitOpen,
  onRedisCircuitOpen,
  resetRedisCircuit,
  withRedisTimeout,
  withTimeout,
} from "./with-timeout";

const never = () => new Promise<never>(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  resetRedisCircuit();
  onRedisCircuitOpen(undefined);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resolves with the value when the promise wins", async () => {
    await expect(withTimeout(Promise.resolve(7), 100)).resolves.toBe(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with TimeoutError when the promise never settles", async () => {
    const p = withTimeout(never(), 100, "slow");
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(101);
    await assertion;
  });
});

describe("withRedisTimeout circuit", () => {
  async function timeOutOnce() {
    const p = withRedisTimeout(never, "GET k");
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(REDIS_COMMAND_TIMEOUT_MS + 1);
    await assertion;
  }

  it("opens after consecutive timeouts and skips the command without sending it", async () => {
    for (let i = 0; i < REDIS_CIRCUIT_THRESHOLD; i++) await timeOutOnce();
    expect(isRedisCircuitOpen()).toBe(true);
    expect(m.logger.warn).toHaveBeenCalledTimes(1);
    expect(m.logger.warn.mock.calls[0][1]).toMatchObject({ event: "redis:circuit_open" });

    const command = vi.fn(async () => "OK");
    await expect(withRedisTimeout(command)).rejects.toBeInstanceOf(RedisCircuitOpenError);
    expect(command).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(REDIS_CIRCUIT_OPEN_MS);
    await expect(withRedisTimeout(command)).resolves.toBe("OK");
    expect(command).toHaveBeenCalledTimes(1);
  });

  it("a success resets the consecutive timeout count", async () => {
    for (let i = 0; i < REDIS_CIRCUIT_THRESHOLD - 1; i++) await timeOutOnce();
    await expect(withRedisTimeout(async () => "PONG")).resolves.toBe("PONG");
    await timeOutOnce();
    expect(isRedisCircuitOpen()).toBe(false);
  });

  it("plain errors do not open the circuit", async () => {
    for (let i = 0; i < REDIS_CIRCUIT_THRESHOLD + 2; i++) {
      await expect(withRedisTimeout(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    }
    expect(isRedisCircuitOpen()).toBe(false);
  });

  it("calls the registered circuit-open handler once each time the circuit opens", async () => {
    const handler = vi.fn();
    onRedisCircuitOpen(handler);
    for (let i = 0; i < REDIS_CIRCUIT_THRESHOLD - 1; i++) await timeOutOnce();
    expect(handler).not.toHaveBeenCalled();
    await timeOutOnce();
    expect(handler).toHaveBeenCalledTimes(1);

    // Calls skipped while open do not call it again.
    await expect(withRedisTimeout(async () => "OK")).rejects.toBeInstanceOf(RedisCircuitOpenError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("a throwing circuit-open handler does not change the command's outcome", async () => {
    onRedisCircuitOpen(() => {
      throw new Error("boom");
    });
    for (let i = 0; i < REDIS_CIRCUIT_THRESHOLD; i++) await timeOutOnce();
    expect(isRedisCircuitOpen()).toBe(true);
  });
});
