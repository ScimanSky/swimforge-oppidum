import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDayKey, useCurrentDay } from "./useCurrentDay";

describe("localDayKey", () => {
  it("giorno locale AAAA-MM-GG", () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDayKey(new Date(2026, 9, 28, 0, 0))).toBe("2026-10-28");
  });
});

describe("useCurrentDay", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("passa al giorno dopo a mezzanotte e riarma il timer", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 28, 23, 30) });
    const { result } = renderHook(() => useCurrentDay());
    expect(result.current.dayKey).toBe("2026-10-28");

    act(() => {
      vi.advanceTimersByTime(31 * 60_000);
    });
    expect(result.current.dayKey).toBe("2026-10-29");
    expect(result.current.now.getDate()).toBe(29);

    act(() => {
      vi.advanceTimersByTime(24 * 60 * 60_000);
    });
    expect(result.current.dayKey).toBe("2026-10-30");
  });

  it("al ritorno in primo piano si aggiorna se il giorno è cambiato", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 28, 18), toFake: ["Date"] });
    const { result } = renderHook(() => useCurrentDay());
    const first = result.current.now;

    // Same day: nothing changes (same Date instance, memos keep their value).
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.now).toBe(first);

    vi.setSystemTime(new Date(2026, 10, 2, 8));
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.dayKey).toBe("2026-11-02");
  });
});
