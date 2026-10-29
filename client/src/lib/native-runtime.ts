import { App } from "@capacitor/app";
import { SystemBars, SystemBarsStyle, type PluginListenerHandle } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { resolveDeepLink } from "./deep-links";
import { canGoBackInApp } from "./in-app-history";
import { isPublicPath, normalizePath, TODAY_PATH } from "./navigation";
import { isNativePlatform } from "./platform";
import { setPushNavigate } from "./push";

export type NativeAuthCallback = { code: string | null; error: string | null };

export type NativeRuntimeOptions = {
  navigate: (path: string, options?: { replace?: boolean }) => void;
  onAuthCallback: (callback: NativeAuthCallback) => unknown;
};

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

export type BackButtonAction = "back" | "home" | "exit";

/**
 * Android back button: on the native home (Oggi) close the app; elsewhere go back in the
 * history when the previous entry belongs to the app. Without such an entry a shell page lands
 * on Oggi (replacing the current entry) instead of closing the app from a deep page, while a
 * public page (login, privacy…) closes the app: signed out, Oggi would bounce back to the login.
 */
export function backButtonAction(path: string, canGoBack: boolean): BackButtonAction {
  if (normalizePath(path) === TODAY_PATH) return "exit";
  if (canGoBack) return "back";
  return isPublicPath(path) ? "exit" : "home";
}

/**
 * Icons of the status bar and of the navigation bar follow the app theme (light icons on the
 * dark theme, dark icons on the light one), whatever the system night mode. The bars are
 * transparent (edge-to-edge, MainActivity): their background is the page's own header and
 * bottom navigation, padded with env(safe-area-inset-*). No-op on the web.
 */
export function syncNativeSystemBars(theme: "dark" | "light"): void {
  if (!isNativePlatform()) return;
  SystemBars.setStyle({ style: theme === "dark" ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
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
      // Only entries created by the app: never back to the login page or a pre-app entry.
      const canGoBackInHistory = canGoBack !== false && canGoBackInApp();
      const action = backButtonAction(window.location.pathname, canGoBackInHistory);
      if (action === "exit") App.exitApp().catch(() => {});
      else if (action === "back") window.history.back();
      else options.navigate(TODAY_PATH, { replace: true });
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
