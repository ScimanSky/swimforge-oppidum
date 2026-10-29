import { beforeEach, describe, expect, it, vi } from "vitest";
import { SystemBars } from "@capacitor/core";
import {
  createDeepLinkHandler,
  backButtonAction,
  syncNativeSystemBars,
} from "./native-runtime";

describe("backButtonAction", () => {
  it("goes back when there is in-app history and we are not on the home", () => {
    expect(backButtonAction("/post/7", true)).toBe("back");
    expect(backButtonAction("/home/messages", true)).toBe("back");
  });
  it("exits on the native home (Oggi), with or without history", () => {
    expect(backButtonAction("/today", true)).toBe("exit");
    expect(backButtonAction("/today/", true)).toBe("exit");
    expect(backButtonAction("/today", false)).toBe("exit");
  });
  it("goes back from the feed when there is history (it is not the native home)", () => {
    expect(backButtonAction("/home", true)).toBe("back");
  });
  it("lands on Oggi instead of exiting when there is nowhere to go back to", () => {
    expect(backButtonAction("/post/7", false)).toBe("home");
    expect(backButtonAction("/home", false)).toBe("home");
    expect(backButtonAction("/messages", false)).toBe("home");
  });
  it("a chat or «Nuovo messaggio» opened from a link goes up to the conversation list", () => {
    expect(backButtonAction("/messages?con=5", false)).toBe("parent");
    expect(backButtonAction("/messages?new=1", false)).toBe("parent");
    expect(backButtonAction("/messages?con=5", true)).toBe("back");
  });
  // Signed out on a cold start: Oggi would 401 and reload the login page, looping.
  it.each(["/login", "/", "/register", "/auth/callback", "/privacy", "/login/?next=1"])(
    "exits from the public screen %s when there is no in-app history",
    path => {
      expect(backButtonAction(path, false)).toBe("exit");
    },
  );
  it.each(["/login", "/", "/register", "/auth/callback", "/privacy"])(
    "goes back from the public screen %s when there is in-app history",
    path => {
      expect(backButtonAction(path, true)).toBe("back");
    },
  );
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
    expect(handle("https://swimforge.it/messages?con=5")).toBe(true);
    expect(navigate).toHaveBeenLastCalledWith("/messages?con=5");
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

const platformMock = vi.hoisted(() => ({ native: true }));
vi.mock("./platform", () => ({ isNativePlatform: () => platformMock.native }));
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
vi.mock("@capacitor/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@capacitor/core")>()),
  SystemBars: { setStyle: vi.fn(async () => {}) },
}));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: { hide: vi.fn(async () => {}) } }));
const pushMocks = vi.hoisted(() => ({ setPushNavigate: vi.fn() }));
vi.mock("./push", () => ({ setPushNavigate: pushMocks.setPushNavigate }));

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

  it("hands the navigate function to the push module", async () => {
    const { initNativeRuntime } = await import("./native-runtime");
    const navigate = vi.fn();
    const cleanup = initNativeRuntime({ navigate, onAuthCallback: vi.fn() });
    expect(pushMocks.setPushNavigate).toHaveBeenLastCalledWith(navigate);
    cleanup();
  });
});

describe("syncNativeSystemBars", () => {
  beforeEach(() => {
    vi.mocked(SystemBars.setStyle).mockClear();
    platformMock.native = true;
  });

  // No `bar`: the style applies to the status bar and to the navigation bar.
  it("follows the dark theme: light icons on both system bars", () => {
    syncNativeSystemBars("dark");
    expect(SystemBars.setStyle).toHaveBeenCalledTimes(1);
    expect(SystemBars.setStyle).toHaveBeenCalledWith({ style: "DARK" });
  });

  it("follows the light theme: dark icons on both system bars", () => {
    syncNativeSystemBars("light");
    expect(SystemBars.setStyle).toHaveBeenCalledTimes(1);
    expect(SystemBars.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
  });

  it("ignores a failing plugin call", async () => {
    vi.mocked(SystemBars.setStyle).mockRejectedValueOnce(new Error("not implemented"));
    expect(() => syncNativeSystemBars("dark")).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("does nothing on the web", () => {
    platformMock.native = false;
    syncNativeSystemBars("dark");
    expect(SystemBars.setStyle).not.toHaveBeenCalled();
  });

  it("initNativeRuntime leaves the system bars to the theme", async () => {
    const { initNativeRuntime } = await import("./native-runtime");
    const cleanup = initNativeRuntime({ navigate: vi.fn(), onAuthCallback: vi.fn() });
    expect(SystemBars.setStyle).not.toHaveBeenCalled();
    cleanup();
  });
});

describe("Android back button", () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function pressBack(state: unknown, path: string, canGoBack = true) {
    const { App } = await import("@capacitor/app");
    const { initNativeRuntime } = await import("./native-runtime");
    vi.mocked(App.exitApp).mockClear();
    runtimeMocks.listeners.length = 0;
    window.history.replaceState(state, "", path);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const navigate = vi.fn();
    const cleanup = initNativeRuntime({ navigate, onAuthCallback: vi.fn() });
    await flush();
    runtimeMocks.listeners.find((l) => l.event === "backButton")?.cb({ canGoBack });
    cleanup();
    const result = {
      exited: vi.mocked(App.exitApp).mock.calls.length > 0,
      wentBack: back.mock.calls.length > 0,
      navigated: navigate.mock.calls,
    };
    back.mockRestore();
    return result;
  }

  it("goes back when the previous entry belongs to the app", async () => {
    expect(await pressBack({ sfIdx: 2 }, "/track/4")).toEqual({ exited: false, wentBack: true, navigated: [] });
  });

  it("lands on Oggi (replace) when the previous entry is not the app's (e.g. the login page before a reload)", async () => {
    expect(await pressBack({ sfIdx: 0 }, "/track/4")).toEqual({
      exited: false,
      wentBack: false,
      navigated: [["/today", { replace: true }]],
    });
  });

  it("lands on Oggi when the WebView has nothing behind a deep page", async () => {
    expect(await pressBack({ sfIdx: 3 }, "/track/4", false)).toEqual({
      exited: false,
      wentBack: false,
      navigated: [["/today", { replace: true }]],
    });
  });

  it("a chat opened from a notification goes back to the list, not to Oggi", async () => {
    expect(await pressBack({ sfIdx: 0 }, "/messages?con=5")).toEqual({
      exited: false,
      wentBack: false,
      navigated: [["/messages", { replace: true }]],
    });
    expect(await pressBack({ sfIdx: 2 }, "/messages?con=5")).toEqual({ exited: false, wentBack: true, navigated: [] });
  });

  it("exits on Oggi, with or without history behind", async () => {
    expect(await pressBack({ sfIdx: 3 }, "/today")).toEqual({ exited: true, wentBack: false, navigated: [] });
    expect(await pressBack({ sfIdx: 0 }, "/today", false)).toEqual({ exited: true, wentBack: false, navigated: [] });
  });
});
