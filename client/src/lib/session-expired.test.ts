import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  calls: [] as string[],
  unregisterPushTokenLocally: vi.fn(),
  clearNativeSessionToken: vi.fn(),
}));

vi.mock("./push", async () => {
  const actual = await vi.importActual<typeof import("./push")>("./push");
  return { settleWithin: actual.settleWithin, unregisterPushTokenLocally: m.unregisterPushTokenLocally };
});
vi.mock("./session-token", () => ({ clearNativeSessionToken: m.clearNativeSessionToken }));

import { endExpiredSession } from "./session-expired";

describe("endExpiredSession (401)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.calls.length = 0;
    m.unregisterPushTokenLocally.mockImplementation(async () => {
      m.calls.push("device-unregister");
    });
    m.clearNativeSessionToken.mockImplementation(() => {
      m.calls.push("clear-token");
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes the device push token before clearing the session and redirecting", async () => {
    const redirect = vi.fn(() => m.calls.push("redirect"));
    await endExpiredSession(redirect);
    expect(m.calls).toEqual(["device-unregister", "clear-token", "redirect"]);
  });

  it("redirects after 1 s when the device cleanup hangs", async () => {
    vi.useFakeTimers();
    m.unregisterPushTokenLocally.mockImplementation(() => new Promise(() => {}));
    const redirect = vi.fn();
    const pending = endExpiredSession(redirect);
    await vi.advanceTimersByTimeAsync(999);
    expect(redirect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(m.clearNativeSessionToken).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
  });

  it("handles a burst of 401s once", async () => {
    const redirect = vi.fn();
    await Promise.all([endExpiredSession(redirect), endExpiredSession(redirect)]);
    expect(m.unregisterPushTokenLocally).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
