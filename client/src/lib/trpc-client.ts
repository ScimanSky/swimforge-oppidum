import { CSRF_COOKIE_NAME } from "@shared/const";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
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
 */
export function createTrpcLinks() {
  return [
    httpBatchLink<AppRouter>({
      url: apiUrl("/api/trpc"),
      transformer: superjson,
      fetch(input, init) {
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
    }),
  ];
}

/**
 * Vanilla tRPC client for code outside React (e.g. push registration). Its errors do not go
 * through the React Query caches, so they never trigger the global 401 redirect.
 */
export const vanillaTrpc = createTRPCClient<AppRouter>({ links: createTrpcLinks() });
