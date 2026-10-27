const KEY = "swimforge:nativeSessionToken"; // phase 1: move to @capacitor/preferences

export function getNativeSessionToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setNativeSessionToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearNativeSessionToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
