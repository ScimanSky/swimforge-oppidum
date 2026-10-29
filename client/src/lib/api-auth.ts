import { isNativePlatform } from "./platform";
import { getNativeSessionToken } from "./session-token";
import { buildTrpcHeaders } from "./trpc-headers";

/**
 * RequestInit for a plain fetch to an authenticated, non-tRPC API route (GET): the session
 * cookie on the web, the bearer token + native client header on native, as tRPC does.
 */
export function authenticatedApiInit(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    credentials: "include",
    headers: buildTrpcHeaders(
      { isNative: isNativePlatform(), csrfToken: null, nativeToken: getNativeSessionToken() },
      init.headers,
    ),
  };
}
