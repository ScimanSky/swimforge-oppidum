import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GARMIN_SYNC_COUNT_KEY,
  garminSyncButtonLabel,
  readGarminSyncCount,
  writeGarminSyncCount,
} from "./garmin-sync-count";

describe("garmin sync count preference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("defaults to the last 10 swims", () => {
    expect(readGarminSyncCount()).toBe(10);
  });

  it("remembers the last choice", () => {
    writeGarminSyncCount(5);
    expect(window.localStorage.getItem(GARMIN_SYNC_COUNT_KEY)).toBe("5");
    expect(readGarminSyncCount()).toBe(5);
  });

  it("ignores a stored value that is not 1, 5 or 10", () => {
    window.localStorage.setItem(GARMIN_SYNC_COUNT_KEY, "3");
    expect(readGarminSyncCount()).toBe(10);
    window.localStorage.setItem(GARMIN_SYNC_COUNT_KEY, "abc");
    expect(readGarminSyncCount()).toBe(10);
  });

  it("falls back to the default when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readGarminSyncCount()).toBe(10);
    expect(() => writeGarminSyncCount(1)).not.toThrow();
  });

  it("labels the sync button after the choice", () => {
    expect(garminSyncButtonLabel(1)).toBe("Sincronizza l'ultima nuotata");
    expect(garminSyncButtonLabel(5)).toBe("Sincronizza le ultime 5");
    expect(garminSyncButtonLabel(10)).toBe("Sincronizza le ultime 10");
  });
});
