/**
 * Counts the history entries created inside the SPA, so «Indietro» and the Android back button
 * never leave the site: `history.length` also counts what came before (a search engine, an
 * email link). Each entry carries `sfIdx` in `history.state`: 0 for the entry the app booted
 * on, +1 for each pushState, unchanged on replaceState (unless the new state sets it). A pushed
 * entry also remembers in `sfPrev` the path it was pushed from, i.e. the entry before it.
 */
const INSTALLED = Symbol.for("swimforge.inAppHistory");

type IndexedState = { sfIdx?: number; sfPrev?: string } & Record<string, unknown>;

const currentState = () => window.history.state as IndexedState | null;

const currentIndex = (): number => {
  const state = currentState();
  return typeof state?.sfIdx === "number" ? state.sfIdx : 0;
};

/** Merges the index (and the previous path, when known) into the state the router passes. */
const withIndex = (data: unknown, sfIdx: number, sfPrev?: string): unknown => {
  const entry = sfPrev === undefined ? { sfIdx } : { sfIdx, sfPrev };
  return data === null || data === undefined
    ? entry
    : typeof data === "object"
      ? { ...(data as object), ...entry }
      : data;
};

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
    const from = window.location.pathname + window.location.search;
    return pushState.call(this, withIndex(data, currentIndex() + 1, from), unused, url);
  };
  history.replaceState = function (data, unused, url) {
    const explicit = (data as IndexedState | null)?.sfIdx;
    const sfIdx = typeof explicit === "number" ? explicit : currentIndex();
    // Replacing this entry leaves the one before it where it is.
    const explicitPrev = (data as IndexedState | null)?.sfPrev;
    const sfPrev = typeof explicitPrev === "string" ? explicitPrev : currentState()?.sfPrev;
    return replaceState.call(this, withIndex(data, sfIdx, sfPrev), unused, url);
  };
}

/** True when the previous history entry belongs to the app. */
export function canGoBackInApp(): boolean {
  if (typeof window === "undefined") return false;
  return currentIndex() > 0;
}

/** Path (with the query) of the previous history entry when it belongs to the app, else null. */
export function previousInAppPath(): string | null {
  if (!canGoBackInApp()) return null;
  const sfPrev = currentState()?.sfPrev;
  return typeof sfPrev === "string" ? sfPrev : null;
}
