import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";

/** An address the caller already vetted, e.g. against private ranges. */
export type PinnedTarget = { address: string; family: 4 | 6 };

export type PinnedResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: AsyncIterable<Buffer>;
  /** Drops the connection; call it whenever the body is not read to the end. */
  destroy: () => void;
};

/**
 * One GET (no redirects followed) to `url`, connecting to `target` instead of resolving the
 * hostname again: the socket reaches exactly the address that was checked, so a DNS answer
 * that changes between the check and the connection (DNS rebinding) cannot redirect it.
 * TLS still verifies the certificate against the URL's hostname. No keep-alive agent is
 * shared, so no pooled socket to another address is ever reused.
 */
export function pinnedRequest(
  url: URL,
  target: PinnedTarget,
  options: { headers: Record<string, string>; signal: AbortSignal },
): Promise<PinnedResponse> {
  const lookup = ((_hostname: string, lookupOptions: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    // Node asks for every address (`all`) when it races IPv4/IPv6 (autoSelectFamily).
    if (lookupOptions?.all) {
      callback(null, [{ address: target.address, family: target.family }]);
      return;
    }
    callback(null, target.address, target.family);
  }) as unknown as LookupFunction;

  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: "GET",
        headers: options.headers,
        lookup,
        agent: false,
        signal: options.signal,
      },
      (response) => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: response,
          destroy: () => response.destroy(),
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}
