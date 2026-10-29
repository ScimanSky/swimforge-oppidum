import { CSRF_COOKIE_NAME } from "@shared/const";
import { createTRPCClient, httpBatchLink, httpLink, splitLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import { apiUrl } from "./api-base";
import { isNativePlatform } from "./platform";
import { getNativeSessionToken } from "./session-token";
import { buildTrpcHeaders } from "./trpc-headers";

const readCsrfCookie = (): string | null =>
  typeof document === "undefined"
    ? null
    : document.cookie
        .split(";")
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(`${CSRF_COOKIE_NAME}=`))
        ?.slice(CSRF_COOKIE_NAME.length + 1) ?? null;

/**
 * The app's tRPC links: batch link on /api/trpc with superjson, credentials, the CSRF header
 * on the web and the bearer token + native client header on native. Shared by the React
 * client (main.tsx) and the vanilla client below.
 *
 * A call with `context: { skipBatch: true }` (React Query: `trpc: { context: { skipBatch: true } }`)
 * goes alone in its own request: a slow procedure (the Coach page's Gemini insights) would
 * otherwise hold back the answer of every query batched with it.
 */
export function createTrpcLinks() {
  const options = {
    url: apiUrl("/api/trpc"),
    transformer: superjson,
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      const headers = buildTrpcHeaders(
        { isNative: isNativePlatform(), csrfToken: readCsrfCookie(), nativeToken: getNativeSessionToken() },
        init?.headers,
      );
      return globalThis.fetch(input, {
        ...(init ?? {}),
        headers,
        credentials: "include",
      });
    },
  };
  return [
    splitLink<AppRouter>({
      condition: (op) => op.context.skipBatch === true,
      true: httpLink<AppRouter>(options),
      false: httpBatchLink<AppRouter>(options),
    }),
  ];
}

/**
 * Vanilla tRPC client for code outside React (e.g. push registration). Its errors do not go
 * through the React Query caches, so they never trigger the global 401 redirect.
 */
export const vanillaTrpc = createTRPCClient<AppRouter>({ links: createTrpcLinks() });
