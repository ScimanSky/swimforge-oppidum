import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pinnedRequest } from "./pinned_http";

// pinnedRequest must connect to the vetted address it is given, never to a fresh DNS
// answer for the hostname. The hostname below does not resolve at all (.invalid), so the
// request can only reach the local server through the pinned address.

let server: Server;
let port = 0;
const seen: Array<{ host: string | undefined; url: string | undefined }> = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({ host: req.headers.host, url: req.url });
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("pinned");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function readAll(body: AsyncIterable<Buffer>) {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

describe("pinnedRequest", () => {
  it("connects to the pinned address and keeps the URL's host header", async () => {
    const controller = new AbortController();
    const response = await pinnedRequest(
      new URL(`http://pinned.invalid:${port}/page?x=1`),
      { address: "127.0.0.1", family: 4 },
      { headers: { "user-agent": "test" }, signal: controller.signal },
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/plain");
    expect(await readAll(response.body)).toBe("pinned");
    expect(seen.at(-1)).toEqual({ host: `pinned.invalid:${port}`, url: "/page?x=1" });
  });

  it("rejects once the signal aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      pinnedRequest(new URL(`http://pinned.invalid:${port}/`), { address: "127.0.0.1", family: 4 }, {
        headers: {},
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
