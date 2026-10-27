/**
 * Base URL for API calls. Empty on the web (same-origin relative paths, as before);
 * set to the public backend (e.g. https://swimforge.it) in the `native` Vite mode,
 * where the WebView origin is not the API host.
 */
export const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

export function buildApiUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, "");
  if (!normalizedBase) return path;
  return `${normalizedBase}/${path.replace(/^\/+/, "")}`;
}

export function apiUrl(path: string): string {
  return buildApiUrl(API_BASE_URL, path);
}
