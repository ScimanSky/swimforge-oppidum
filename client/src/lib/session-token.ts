const KEY = "swimforge:nativeSessionToken"; // phase 1: move to @capacitor/preferences

/** Returns the stored native session token, or null if absent or storage is unavailable. */
export function getNativeSessionToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Stores the native session token returned by auth.syncSupabaseUser; storage errors are ignored. */
export function setNativeSessionToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* ignore */
  }
}

/** Removes the native session token; call on every logout path. Storage errors are ignored. */
export function clearNativeSessionToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
