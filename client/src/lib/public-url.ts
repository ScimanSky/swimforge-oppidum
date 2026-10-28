import { isNativePlatform } from "./platform";

/**
 * Public website origin for links that leave the app (shares, invites, Supabase email
 * redirects). On native the WebView origin (https://app.swimforge.it) is local to the shell,
 * so those links must point at the real site: VITE_PUBLIC_SITE_URL, default https://swimforge.it.
 */
export const PUBLIC_SITE_URL = String(import.meta.env.VITE_PUBLIC_SITE_URL || "https://swimforge.it").replace(
  /\/+$/,
  "",
);

export function buildPublicSiteUrl(
  path: string,
  input: { isNative: boolean; nativeBase: string; webOrigin: string },
): string {
  const base = (input.isNative ? input.nativeBase : input.webOrigin).replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
}

/** Absolute public URL for `path`: window.location.origin on the web, the public site on native. */
export function publicSiteUrl(path: string): string {
  return buildPublicSiteUrl(path, {
    isNative: isNativePlatform(),
    nativeBase: PUBLIC_SITE_URL,
    webOrigin: typeof window !== "undefined" ? window.location.origin : "",
  });
}
