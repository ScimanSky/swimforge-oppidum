import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

/** A `MediaQueryList` whose result the test flips, firing a real `change` event. */
function mockMatchMedia(initial: boolean) {
  const media = Object.assign(new EventTarget(), { matches: initial });
  const add = vi.spyOn(media, "addEventListener");
  const remove = vi.spyOn(media, "removeEventListener");
  const matchMedia = vi.fn((query: string) => Object.assign(media, { media: query }));
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: matchMedia,
  });
  const change = (matches: boolean) =>
    act(() => {
      media.matches = matches;
      media.dispatchEvent(new Event("change"));
    });
  return { matchMedia, add, remove, change };
}

describe("useMediaQuery", () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: undefined,
    });
  });

  it("valore iniziale sincrono, poi segue gli eventi change", () => {
    const { matchMedia, change } = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery("(min-width: 1280px)"));
    expect(result.current).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith("(min-width: 1280px)");

    change(true);
    expect(result.current).toBe(true);
    change(false);
    expect(result.current).toBe(false);
  });

  it("rimuove il listener allo smontaggio", () => {
    const { add, remove } = mockMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 1280px)"));
    expect(add).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(remove).toHaveBeenCalledWith("change", add.mock.calls[0][1]);
  });

  it("senza matchMedia (jsdom, WebView vecchie) vale il default desktop", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 1280px)"));
    expect(result.current).toBe(true);
  });
});
