import { describe, expect, it, vi } from "vitest";
import { createDeepLinkHandler, shouldExitOnBack } from "./native-runtime";

describe("shouldExitOnBack", () => {
  it("goes back when there is history and we are not on the home", () => {
    expect(shouldExitOnBack("/post/7", true)).toBe(false);
    expect(shouldExitOnBack("/home/messages", true)).toBe(false);
  });
  it("exits on the home even with history", () => {
    expect(shouldExitOnBack("/home", true)).toBe(true);
    expect(shouldExitOnBack("/home/", true)).toBe(true);
  });
  it("exits when there is nowhere to go back to", () => {
    expect(shouldExitOnBack("/post/7", false)).toBe(true);
  });
});

describe("createDeepLinkHandler", () => {
  const setup = () => {
    let clock = 0;
    const navigate = vi.fn();
    const onAuthCallback = vi.fn();
    const handle = createDeepLinkHandler({ navigate, onAuthCallback }, () => clock);
    return { handle, navigate, onAuthCallback, advance: (ms: number) => (clock += ms) };
  };

  it("sends the OAuth return to the auth callback", () => {
    const { handle, navigate, onAuthCallback } = setup();
    expect(handle("swimforge://auth/callback?code=abc")).toBe(true);
    expect(onAuthCallback).toHaveBeenCalledWith({ code: "abc", error: null });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates to website links", () => {
    const { handle, navigate } = setup();
    expect(handle("https://www.swimforge.it/post/7?c=1")).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/post/7?c=1");
  });

  it("ignores unknown and empty URLs", () => {
    const { handle, navigate, onAuthCallback } = setup();
    expect(handle("https://example.com/x")).toBe(false);
    expect(handle(undefined)).toBe(false);
    expect(handle("")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(onAuthCallback).not.toHaveBeenCalled();
  });

  it("ignores the same URL delivered twice in a row (cold start), not later repeats", () => {
    const { handle, navigate, advance } = setup();
    handle("https://swimforge.it/home");
    advance(100);
    expect(handle("https://swimforge.it/home")).toBe(false);
    advance(5000);
    expect(handle("https://swimforge.it/home")).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});

const runtimeMocks = vi.hoisted(() => ({
  launchUrl: undefined as string | undefined,
  listeners: [] as Array<{ event: string; cb: (data: unknown) => void }>,
}));

vi.mock("./platform", () => ({ isNativePlatform: () => true }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (event: string, cb: (data: unknown) => void) => {
      runtimeMocks.listeners.push({ event, cb });
      return { remove: vi.fn(async () => {}) };
    }),
    getLaunchUrl: vi.fn(async () => (runtimeMocks.launchUrl ? { url: runtimeMocks.launchUrl } : undefined)),
    exitApp: vi.fn(async () => {}),
  },
}));
vi.mock("@capacitor/status-bar", () => ({
  StatusBar: { setStyle: vi.fn(async () => {}), setBackgroundColor: vi.fn(async () => {}) },
  Style: { Dark: "DARK" },
}));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: vi.fn(async () => {}) } }));

describe("initNativeRuntime launch URL", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("does not replay the cold-start URL after a full page reload in the same session", async () => {
    const { initNativeRuntime, HANDLED_LAUNCH_URL_KEY } = await import("./native-runtime");
    sessionStorage.removeItem(HANDLED_LAUNCH_URL_KEY);
    runtimeMocks.launchUrl = "swimforge://auth/callback?code=once";
    const onAuthCallback = vi.fn();
    const navigate = vi.fn();

    const cleanupFirst = initNativeRuntime({ navigate, onAuthCallback });
    await flush();
    expect(onAuthCallback).toHaveBeenCalledTimes(1);
    expect(onAuthCallback).toHaveBeenCalledWith({ code: "once", error: null });
    cleanupFirst();

    // Reload: a fresh runtime (new in-memory dedupe), same process, same launch URL.
    const cleanupSecond = initNativeRuntime({ navigate, onAuthCallback });
    await flush();
    expect(onAuthCallback).toHaveBeenCalledTimes(1);
    cleanupSecond();

    // A different launch URL (new cold start) is handled.
    runtimeMocks.launchUrl = "https://swimforge.it/post/9";
    const cleanupThird = initNativeRuntime({ navigate, onAuthCallback });
    await flush();
    expect(navigate).toHaveBeenCalledWith("/post/9");
    cleanupThird();
  });

  it("still handles appUrlOpen events", async () => {
    const { initNativeRuntime } = await import("./native-runtime");
    runtimeMocks.launchUrl = undefined;
    runtimeMocks.listeners.length = 0;
    const navigate = vi.fn();
    const cleanup = initNativeRuntime({ navigate, onAuthCallback: vi.fn() });
    await flush();
    runtimeMocks.listeners.find((l) => l.event === "appUrlOpen")?.cb({ url: "https://www.swimforge.it/home/messages" });
    expect(navigate).toHaveBeenCalledWith("/home/messages");
    cleanup();
  });
});
