import { Preferences } from "@capacitor/preferences";
import { isNativePlatform } from "./platform";

/** Phase 0 storage of the native token (localStorage); migrated once to Preferences. */
export const LEGACY_SESSION_TOKEN_KEY = "swimforge:nativeSessionToken";
/** Key of the native token in @capacitor/preferences (CapacitorStorage, excluded from backups). */
export const PREFERENCES_SESSION_TOKEN_KEY = "nativeSessionToken";

/**
 * Native only: in-memory copy of the token, so the fetch wrapper can read it synchronously.
 * Filled by loadNativeSessionToken() before the first render, kept in sync by set/clear.
 */
let nativeCache: string | null = null;

function readLegacyToken(): string | null {
  try {
    return localStorage.getItem(LEGACY_SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

function removeLegacyToken(): void {
  try {
    localStorage.removeItem(LEGACY_SESSION_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Native only, call once at startup before rendering: fills the in-memory cache from
 * Preferences, migrating the phase 0 localStorage token (then removing it). No-op on the web.
 */
export async function loadNativeSessionToken(): Promise<void> {
  if (!isNativePlatform()) return;
  let stored: string | null = null;
  try {
    stored = (await Preferences.get({ key: PREFERENCES_SESSION_TOKEN_KEY })).value;
  } catch {
    stored = null;
  }
  const legacy = readLegacyToken();
  if (!stored && legacy) {
    stored = legacy;
    try {
      await Preferences.set({ key: PREFERENCES_SESSION_TOKEN_KEY, value: legacy });
    } catch {
      /* keep it in memory for this run; the next start retries the migration */
      nativeCache = legacy;
      return;
    }
  }
  if (legacy) removeLegacyToken();
  nativeCache = stored;
}

/** Returns the stored native session token, or null if absent or storage is unavailable. */
export function getNativeSessionToken(): string | null {
  if (isNativePlatform()) return nativeCache;
  return readLegacyToken();
}

/**
 * Stores the native session token returned by auth.syncSupabaseUser; storage errors are ignored.
 * The in-memory copy is updated synchronously; the returned promise resolves once the token
 * is persisted (await it before a full page reload on native).
 */
export async function setNativeSessionToken(token: string): Promise<void> {
  if (isNativePlatform()) {
    nativeCache = token;
    await Preferences.set({ key: PREFERENCES_SESSION_TOKEN_KEY, value: token }).catch(() => {});
    return;
  }
  try {
    localStorage.setItem(LEGACY_SESSION_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

/** Removes the native session token; call on every logout path. Storage errors are ignored. */
export function clearNativeSessionToken(): void {
  if (isNativePlatform()) {
    nativeCache = null;
    Preferences.remove({ key: PREFERENCES_SESSION_TOKEN_KEY }).catch(() => {});
  }
  removeLegacyToken();
}
