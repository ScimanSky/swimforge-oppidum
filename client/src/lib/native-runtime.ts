import { App } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { resolveDeepLink } from "./deep-links";
import { normalizePath, TODAY_PATH } from "./navigation";
import { isNativePlatform } from "./platform";
import { setPushNavigate } from "./push";

export type NativeAuthCallback = { code: string | null; error: string | null };

export type NativeRuntimeOptions = {
  navigate: (path: string) => void;
  onAuthCallback: (callback: NativeAuthCallback) => unknown;
};

export const NATIVE_THEME_COLORS = { dark: "#0A1520", light: "#F4F7F9" } as const;
/** appUrlOpen may repeat the launch URL on a cold start: the same URL within this window is ignored. */
const DUPLICATE_URL_WINDOW_MS = 2000;
/**
 * getLaunchUrl() keeps returning the cold-start URL for the whole process, also after a full
 * page reload (e.g. window.location.href = "/home" after a sign-in): the handled one is kept
 * in sessionStorage (cleared with the process) so it is not replayed.
 */
export const HANDLED_LAUNCH_URL_KEY = "swimforge:handledLaunchUrl";

/** True the first time a launch URL is seen in this WebView session; storage errors allow it. */
export function claimLaunchUrl(url: string): boolean {
  try {
    if (sessionStorage.getItem(HANDLED_LAUNCH_URL_KEY) === url) return false;
    sessionStorage.setItem(HANDLED_LAUNCH_URL_KEY, url);
  } catch {
    /* storage unavailable: handle it (the in-memory dedupe still applies) */
  }
  return true;
}

/**
 * Android back button: go back in the WebView history when there is somewhere to go and we
 * are not on the native home (Oggi); otherwise close the app.
 */
export function shouldExitOnBack(path: string, canGoBack: boolean): boolean {
  return !canGoBack || normalizePath(path) === TODAY_PATH;
}

/** Status bar follows the app theme. No-op on the web. */
export function syncNativeStatusBar(theme: "dark" | "light"): void {
  if (!isNativePlatform()) return;
  StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light }).catch(() => {});
  StatusBar.setBackgroundColor({ color: NATIVE_THEME_COLORS[theme] }).catch(() => {});
}

/**
 * Turns an opened URL into an action: OAuth return → onAuthCallback, website link → navigate.
 * Unknown URLs are ignored. Returns whether the URL was handled.
 */
export function createDeepLinkHandler(
  options: NativeRuntimeOptions,
  now: () => number = Date.now,
): (url: string | null | undefined) => boolean {
  let last: { url: string; at: number } | null = null;
  return (url) => {
    if (!url) return false;
    const at = now();
    if (last && last.url === url && at - last.at < DUPLICATE_URL_WINDOW_MS) return false;
    const link = resolveDeepLink(url);
    if (!link) return false;
    last = { url, at };
    if (link.kind === "auth-callback") {
      void Promise.resolve(options.onAuthCallback({ code: link.code, error: link.error })).catch((error) => {
        console.error("[native] auth callback failed", error);
      });
    } else {
      options.navigate(link.path);
    }
    return true;
  };
}

/** Hides the launch splash (configured with launchAutoHide: false). No-op on the web. */
export function hideSplash(): void {
  if (!isNativePlatform()) return;
  SplashScreen.hide().catch(() => {});
}

/**
 * Native only (no-op on the web): Android back button, deep links
 * (including the URL the app was cold-started with), in-app navigation for notification
 * taps. Returns a cleanup function.
 */
export function initNativeRuntime(options: NativeRuntimeOptions): () => void {
  if (!isNativePlatform()) return () => {};

  setPushNavigate(options.navigate);

  const handleUrl = createDeepLinkHandler(options);
  const handles: Promise<PluginListenerHandle>[] = [
    App.addListener("backButton", ({ canGoBack }) => {
      const canGoBackInHistory = canGoBack ?? window.history.length > 1;
      if (shouldExitOnBack(window.location.pathname, canGoBackInHistory)) {
        App.exitApp().catch(() => {});
      } else {
        window.history.back();
      }
    }),
    App.addListener("appUrlOpen", ({ url }) => {
      handleUrl(url);
    }),
  ];

  App.getLaunchUrl()
    .then((launch) => {
      const url = launch?.url;
      if (url && claimLaunchUrl(url)) handleUrl(url);
    })
    .catch(() => {});

  return () => {
    for (const handle of handles) {
      handle.then((listener) => listener.remove()).catch(() => {});
    }
  };
}
