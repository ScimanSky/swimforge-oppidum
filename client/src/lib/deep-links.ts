/**
 * URLs the native app is opened with (App plugin `appUrlOpen` / `getLaunchUrl`).
 *
 * - `swimforge://auth/callback?code=...` (exact path) → OAuth return (Supabase PKCE);
 *   `error` / `error_description` are read from the query or, as a fallback, the fragment.
 * - `https://swimforge.it/<path>` and `https://www.swimforge.it/<path>` → in-app route
 *   (path + query, origin stripped, leading slashes collapsed to one; the fragment is dropped).
 * - anything else (other schemes, hosts, ports, malformed URLs) → null.
 */
export type DeepLink =
  | { kind: "auth-callback"; code: string | null; error: string | null }
  | { kind: "route"; path: string };

export const NATIVE_AUTH_CALLBACK_URL = "swimforge://auth/callback";

const WEB_HOSTS = new Set(["swimforge.it", "www.swimforge.it"]);

function readParam(url: URL, hashParams: URLSearchParams, name: string): string | null {
  return url.searchParams.get(name) || hashParams.get(name) || null;
}

export function resolveDeepLink(url: string): DeepLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol === "swimforge:") {
    if (parsed.hostname.toLowerCase() !== "auth" || parsed.pathname !== "/callback") return null;
    const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
    const code = readParam(parsed, hashParams, "code");
    const error =
      readParam(parsed, hashParams, "error_description") ?? readParam(parsed, hashParams, "error");
    return { kind: "auth-callback", code, error };
  }

  if (parsed.protocol === "https:" && WEB_HOSTS.has(parsed.hostname) && !parsed.port) {
    // "//evil.example/x" must not become a protocol-relative navigation.
    const path = (parsed.pathname || "/").replace(/^\/+/, "/");
    return { kind: "route", path: `${path}${parsed.search}` };
  }

  return null;
}
