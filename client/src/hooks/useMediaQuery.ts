import { useCallback, useSyncExternalStore } from "react";

const supported = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

/**
 * Whether `query` matches now, re-rendering on every `change`. Synchronous from the first
 * render (no flash of the other layout). Without `matchMedia` (SSR, jsdom, very old WebViews)
 * it is `fallback`, by default true: the desktop layout, as the app's `min-width` queries expect.
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => {};
      const media = window.matchMedia(query);
      media.addEventListener?.("change", onChange);
      return () => media.removeEventListener?.("change", onChange);
    },
    [query]
  );
  const getSnapshot = () => (supported() ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}
