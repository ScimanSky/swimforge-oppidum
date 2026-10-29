import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary, { CHUNK_RELOAD_RESET_MS, CHUNK_RELOAD_SESSION_KEY } from "./ErrorBoundary";

function ChunkFailure(): never {
  throw new TypeError("Failed to fetch dynamically imported module: https://swimforge.it/assets/Coach-abc.js");
}

/** jsdom does not navigate: location.replace() is reported on the console instead. */
const reloads = () =>
  vi
    .mocked(console.error)
    .mock.calls.filter(([first]) => /not implemented: navigation/i.test(String((first as Error)?.message ?? first))).length;

describe("ErrorBoundary: the automatic reload after a deploy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    // React reports the caught render errors on the console.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("a page that loads fine clears the reload flag after 30 seconds", () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, "1");
    render(
      <ErrorBoundary>
        <p>Oggi</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("Oggi")).toBeTruthy();

    act(() => vi.advanceTimersByTime(CHUNK_RELOAD_RESET_MS - 1));
    expect(sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)).toBe("1");
    act(() => vi.advanceTimersByTime(1));
    // The next deploy can reload the tab once again instead of showing the error page.
    expect(sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)).toBeNull();
    expect(CHUNK_RELOAD_RESET_MS).toBe(30_000);
  });

  it("the first chunk failure reloads the page once, remembering it", () => {
    render(
      <ErrorBoundary>
        <ChunkFailure />
      </ErrorBoundary>,
    );
    expect(reloads()).toBe(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)).toBe("1");
  });

  it("a chunk still failing after the reload shows the error page and keeps the flag (no reload loop)", () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, "1");
    render(
      <ErrorBoundary>
        <ChunkFailure />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Si è verificato un errore imprevisto.")).toBeTruthy();
    expect(reloads()).toBe(0);

    act(() => vi.advanceTimersByTime(CHUNK_RELOAD_RESET_MS * 2));
    expect(sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)).toBe("1");
  });

  it("with the storage blocked a chunk failure shows the error page instead of reloading", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(
      <ErrorBoundary>
        <ChunkFailure />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Si è verificato un errore imprevisto.")).toBeTruthy();
    expect(reloads()).toBe(0);
  });
});
