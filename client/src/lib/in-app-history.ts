/**
 * Counts the history entries created inside the SPA, so «Indietro» and the Android back button
 * never leave the site: `history.length` also counts what came before (a search engine, an
 * email link). Each entry carries `sfIdx` in `history.state`: 0 for the entry the app booted
 * on, +1 for each pushState, unchanged on replaceState (unless the new state sets it).
 */
const INSTALLED = Symbol.for("swimforge.inAppHistory");

type IndexedState = { sfIdx?: number } & Record<string, unknown>;

const currentIndex = (): number => {
  const state = window.history.state as IndexedState | null;
  return typeof state?.sfIdx === "number" ? state.sfIdx : 0;
};

/** Merges the index into the state the router passes (null or an object). */
const withIndex = (data: unknown, sfIdx: number): unknown =>
  data === null || data === undefined
    ? { sfIdx }
    : typeof data === "object"
      ? { ...(data as object), sfIdx }
      : data;

/** Call once before the first render. Idempotent. */
export function installInAppHistory(): void {
  if (typeof window === "undefined") return;
  const history = window.history as History & { [INSTALLED]?: true };
  if (history[INSTALLED]) return;
  history[INSTALLED] = true;

  // Boot (also after a full reload): this entry is the in-app root.
  history.replaceState(withIndex(history.state, 0), "");

  const pushState = history.pushState;
  const replaceState = history.replaceState;
  history.pushState = function (data, unused, url) {
    return pushState.call(this, withIndex(data, currentIndex() + 1), unused, url);
  };
  history.replaceState = function (data, unused, url) {
    const explicit = (data as IndexedState | null)?.sfIdx;
    const sfIdx = typeof explicit === "number" ? explicit : currentIndex();
    return replaceState.call(this, withIndex(data, sfIdx), unused, url);
  };
}

/** True when the previous history entry belongs to the app. */
export function canGoBackInApp(): boolean {
  if (typeof window === "undefined") return false;
  return currentIndex() > 0;
}
