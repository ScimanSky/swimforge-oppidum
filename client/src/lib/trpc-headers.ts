import { NATIVE_CLIENT_HEADER, NATIVE_CLIENT_VALUE } from "@shared/native";

/** Native sends bearer + client header and never the CSRF header (the server exempts bearer requests from CSRF). */
export function buildTrpcHeaders(
  input: { isNative: boolean; csrfToken: string | null; nativeToken: string | null },
  init?: HeadersInit,
): Headers {
  const headers = new Headers(init ?? {});
  if (input.isNative) {
    headers.set(NATIVE_CLIENT_HEADER, NATIVE_CLIENT_VALUE);
    if (input.nativeToken) headers.set("authorization", `Bearer ${input.nativeToken}`);
    return headers;
  }
  if (input.csrfToken) headers.set("x-csrf-token", decodeURIComponent(input.csrfToken));
  return headers;
}
