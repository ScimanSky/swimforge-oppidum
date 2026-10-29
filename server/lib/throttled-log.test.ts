import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../middleware/logger", () => ({ logger: m.logger }));

import { LOG_THROTTLE_MS, logThrottled, resetLogThrottle } from "./throttled-log";

beforeEach(() => {
  vi.clearAllMocks();
  resetLogThrottle();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("logThrottled", () => {
  it("logs an event at most once per interval and reports how many were suppressed", () => {
    for (let i = 0; i < 50; i++) logThrottled("error", "cache:get_failed", `failed ${i}`);
    expect(m.logger.error).toHaveBeenCalledTimes(1);
    expect(m.logger.error.mock.calls[0][0]).toBe("failed 0");
    expect(m.logger.error.mock.calls[0][1]).toMatchObject({ event: "cache:get_failed" });

    vi.advanceTimersByTime(LOG_THROTTLE_MS);
    logThrottled("error", "cache:get_failed", "failed again");
    expect(m.logger.error).toHaveBeenCalledTimes(2);
    expect(m.logger.error.mock.calls[1][1]).toMatchObject({ event: "cache:get_failed", suppressed: 49 });
  });

  it("throttles each event independently", () => {
    logThrottled("warn", "a", "a1");
    logThrottled("warn", "b", "b1");
    logThrottled("warn", "a", "a2");
    expect(m.logger.warn).toHaveBeenCalledTimes(2);
    expect(m.logger.warn.mock.calls.map((c) => c[0])).toEqual(["a1", "b1"]);
  });

  it("keeps the caller's metadata", () => {
    logThrottled("warn", "x", "msg", { key: "k1" });
    expect(m.logger.warn).toHaveBeenCalledWith("msg", { key: "k1", event: "x" });
  });
});
