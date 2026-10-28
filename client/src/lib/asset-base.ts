/**
 * Base URL for heavy static assets (landing images, badges, profile badges).
 * Empty on the web (same-origin relative paths, as before). In the `native` Vite mode
 * it is the public website (e.g. https://swimforge.it): those folders are pruned from
 * the APK (scripts/prune-native-bundle.mjs) and loaded from the site instead.
 * VITE_ASSET_BASE_URL must be an absolute origin (https://host, no path): a relative or
 * path-only value would point back into the APK, where those folders no longer exist.
 */
export const ASSET_BASE_URL = String(import.meta.env.VITE_ASSET_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Prefixes root-relative paths ("/images/x.webp") with the base. Anything else
 * (absolute http(s), protocol-relative, data:, blob:, empty) is returned unchanged,
 * so it is safe to wrap image URLs coming from the API as well.
 */
export function buildAssetUrl(base: string, path: string): string {
  const normalizedBase = base.replace(/\/+$/, "");
  if (!normalizedBase) return path;
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  return `${normalizedBase}${path}`;
}

export function assetUrl(path: string): string {
  return buildAssetUrl(ASSET_BASE_URL, path);
}
