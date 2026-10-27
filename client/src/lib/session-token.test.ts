import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    native: false,
    store,
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      store.delete(key);
    }),
  };
});

vi.mock("./platform", () => ({ isNativePlatform: () => mocks.native }));
vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: mocks.get, set: mocks.set, remove: mocks.remove },
}));

type SessionTokenModule = typeof import("./session-token");

async function freshModule(): Promise<SessionTokenModule> {
  vi.resetModules();
  return import("./session-token");
}

beforeEach(() => {
  localStorage.clear();
  mocks.store.clear();
  mocks.native = false;
  vi.clearAllMocks();
});

describe("session-token (web)", () => {
  it("stores and reads the token", async () => {
    const { getNativeSessionToken, setNativeSessionToken } = await freshModule();
    setNativeSessionToken("t");
    expect(getNativeSessionToken()).toBe("t");
    expect(localStorage.getItem("swimforge:nativeSessionToken")).toBe("t");
  });
  it("clears the token", async () => {
    const { clearNativeSessionToken, getNativeSessionToken, setNativeSessionToken } = await freshModule();
    setNativeSessionToken("t");
    clearNativeSessionToken();
    expect(getNativeSessionToken()).toBeNull();
  });
  it("survives a broken storage", async () => {
    const { getNativeSessionToken } = await freshModule();
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(getNativeSessionToken()).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
  it("never touches Preferences", async () => {
    const { loadNativeSessionToken, setNativeSessionToken, clearNativeSessionToken } = await freshModule();
    await loadNativeSessionToken();
    setNativeSessionToken("t");
    clearNativeSessionToken();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("session-token (native)", () => {
  beforeEach(() => {
    mocks.native = true;
  });
  afterEach(() => {
    mocks.native = false;
  });

  it("is empty before load and when Preferences has nothing", async () => {
    const { getNativeSessionToken, loadNativeSessionToken } = await freshModule();
    expect(getNativeSessionToken()).toBeNull();
    await loadNativeSessionToken();
    expect(getNativeSessionToken()).toBeNull();
  });

  it("loads the token from Preferences into the cache", async () => {
    mocks.store.set("nativeSessionToken", "pref-token");
    const { getNativeSessionToken, loadNativeSessionToken } = await freshModule();
    await loadNativeSessionToken();
    expect(getNativeSessionToken()).toBe("pref-token");
  });

  it("migrates the phase 0 localStorage token once and removes it", async () => {
    localStorage.setItem("swimforge:nativeSessionToken", "legacy-token");
    const { getNativeSessionToken, loadNativeSessionToken } = await freshModule();
    await loadNativeSessionToken();
    expect(getNativeSessionToken()).toBe("legacy-token");
    expect(mocks.store.get("nativeSessionToken")).toBe("legacy-token");
    expect(localStorage.getItem("swimforge:nativeSessionToken")).toBeNull();
  });

  it("prefers the Preferences token over a stale legacy one", async () => {
    mocks.store.set("nativeSessionToken", "pref-token");
    localStorage.setItem("swimforge:nativeSessionToken", "legacy-token");
    const { getNativeSessionToken, loadNativeSessionToken } = await freshModule();
    await loadNativeSessionToken();
    expect(getNativeSessionToken()).toBe("pref-token");
    expect(mocks.store.get("nativeSessionToken")).toBe("pref-token");
    expect(localStorage.getItem("swimforge:nativeSessionToken")).toBeNull();
  });

  it("set updates the cache synchronously and persists to Preferences, not localStorage", async () => {
    const { getNativeSessionToken, setNativeSessionToken } = await freshModule();
    setNativeSessionToken("new-token");
    expect(getNativeSessionToken()).toBe("new-token");
    await Promise.resolve();
    expect(mocks.set).toHaveBeenCalledWith({ key: "nativeSessionToken", value: "new-token" });
    expect(localStorage.getItem("swimforge:nativeSessionToken")).toBeNull();
  });

  it("clear empties the cache and removes the token from Preferences", async () => {
    mocks.store.set("nativeSessionToken", "pref-token");
    const { clearNativeSessionToken, getNativeSessionToken, loadNativeSessionToken } = await freshModule();
    await loadNativeSessionToken();
    clearNativeSessionToken();
    expect(getNativeSessionToken()).toBeNull();
    expect(mocks.remove).toHaveBeenCalledWith({ key: "nativeSessionToken" });
  });

  it("falls back to an empty session when Preferences fails", async () => {
    mocks.get.mockRejectedValueOnce(new Error("unavailable"));
    const { getNativeSessionToken, loadNativeSessionToken } = await freshModule();
    await expect(loadNativeSessionToken()).resolves.toBeUndefined();
    expect(getNativeSessionToken()).toBeNull();
  });
});
