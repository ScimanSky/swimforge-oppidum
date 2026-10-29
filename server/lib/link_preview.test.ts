import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPinnedRequest = vi.hoisted(() => vi.fn());
const mockDnsLookup = vi.hoisted(() => vi.fn());

vi.mock("./pinned_http", () => ({
  pinnedRequest: (...args: unknown[]) => mockPinnedRequest(...args),
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: (...args: unknown[]) => mockDnsLookup(...args),
  },
}));

import {
  LINK_PREVIEW_HTML_MAX_BYTES,
  LINK_PREVIEW_IMAGE_MAX_BYTES,
  LINK_PREVIEW_TIMEOUT_MS,
  LinkPreviewInputError,
  buildLinkPreviewImageProxyUrl,
  fetchLinkPreviewImage,
  fetchLinkPreviewMetadata,
  isDisallowedIp,
  normalizeAndValidateExternalPreviewUrl,
} from "./link_preview";

const PUBLIC_IP = "93.184.216.34";

type FakeResponse = { status: number; headers: Record<string, string>; body: Readable; destroy: () => void };

function response(
  status: number,
  headers: Record<string, string>,
  body: string | Buffer | Buffer[] = "",
): FakeResponse {
  const chunks = Array.isArray(body) ? body : [typeof body === "string" ? Buffer.from(body) : body];
  const stream = Readable.from(chunks);
  return { status, headers, body: stream, destroy: vi.fn(() => stream.destroy()) };
}

const HTML = `
  <html>
    <head>
      <meta property="og:title" content="EA Masters 26" />
      <meta property="og:description" content="Team di nuoto master." />
      <meta property="og:image" content="/cover.jpg" />
      <meta property="og:site_name" content="EA Masters" />
      <title>Fallback title</title>
    </head>
  </html>
`;

/** The URLs the transport was asked to fetch, in order. */
const requestedUrls = () => mockPinnedRequest.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  vi.clearAllMocks();
  mockDnsLookup.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isDisallowedIp", () => {
  it.each([
    "127.0.0.1",
    "127.8.9.10",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "169.254.0.1",
    "100.64.0.1",
    "100.127.255.254",
    "0.0.0.0",
    "224.0.0.1",
    "239.255.255.250",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "febf::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "::ffff:a9fe:a9fe",
    "::ffff:10.0.0.1",
    "::ffff:c0a8:101",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isDisallowedIp(address)).toBe(true);
  });

  it.each([PUBLIC_IP, "8.8.8.8", "100.128.0.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:93.184.216.34"])(
    "allows the public address %s",
    (address) => {
      expect(isDisallowedIp(address)).toBe(false);
    },
  );
});

describe("normalizeAndValidateExternalPreviewUrl", () => {
  it("normalizes bare domains to https", async () => {
    await expect(normalizeAndValidateExternalPreviewUrl("eamasters26.com/news")).resolves.toBe(
      "https://eamasters26.com/news",
    );
  });

  it.each([
    "http://localhost:3000",
    "http://localhost./",
    "http://printer.local/",
    "http://127.0.0.1",
    "http://2130706433/",
    "http://10.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.1.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
  ])("blocks the internal address %s without fetching it", async (url) => {
    await expect(normalizeAndValidateExternalPreviewUrl(url)).rejects.toBeInstanceOf(LinkPreviewInputError);
    expect(mockPinnedRequest).not.toHaveBeenCalled();
  });

  it("blocks a hostname that resolves to a private address", async () => {
    mockDnsLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(normalizeAndValidateExternalPreviewUrl("https://intranet.example.com/")).rejects.toBeInstanceOf(
      LinkPreviewInputError,
    );
  });

  it("blocks a hostname when any of its addresses is private", async () => {
    mockDnsLookup.mockResolvedValue([
      { address: PUBLIC_IP, family: 4 },
      { address: "::1", family: 6 },
    ]);
    await expect(normalizeAndValidateExternalPreviewUrl("https://mixed.example.com/")).rejects.toBeInstanceOf(
      LinkPreviewInputError,
    );
  });

  it.each(["ftp://example.com/file", "file:///etc/passwd", "gopher://example.com/", "javascript:alert(1)", "data:text/html,hi"])(
    "rejects the non-http scheme %s",
    async (url) => {
      await expect(normalizeAndValidateExternalPreviewUrl(url)).rejects.toBeInstanceOf(LinkPreviewInputError);
      expect(mockPinnedRequest).not.toHaveBeenCalled();
    },
  );

  it.each(["http://example.com:8080/", "https://example.com:22/", "http://example.com:6379/"])(
    "rejects the port of %s",
    async (url) => {
      await expect(normalizeAndValidateExternalPreviewUrl(url)).rejects.toBeInstanceOf(LinkPreviewInputError);
    },
  );

  it("accepts the explicit default ports", async () => {
    await expect(normalizeAndValidateExternalPreviewUrl("http://example.com:80/a")).resolves.toBe("http://example.com/a");
    await expect(normalizeAndValidateExternalPreviewUrl("https://example.com:443/a")).resolves.toBe(
      "https://example.com/a",
    );
  });

  it("rejects credentials in the URL", async () => {
    await expect(normalizeAndValidateExternalPreviewUrl("https://user:pass@example.com/")).rejects.toBeInstanceOf(
      LinkPreviewInputError,
    );
  });
});

describe("fetchLinkPreviewMetadata", () => {
  it("extracts og metadata from a public page, connecting to the vetted address", async () => {
    mockPinnedRequest.mockResolvedValue(response(200, { "content-type": "text/html; charset=utf-8" }, HTML));

    const metadata = await fetchLinkPreviewMetadata("https://example.com/path");

    expect(metadata.title).toBe("EA Masters 26");
    expect(metadata.description).toBe("Team di nuoto master.");
    expect(metadata.siteName).toBe("EA Masters");
    expect(metadata.imageUrl).toBe("https://example.com/cover.jpg");
    expect(metadata.host).toBe("example.com");
    expect(mockPinnedRequest).toHaveBeenCalledTimes(1);
    const [url, target, options] = mockPinnedRequest.mock.calls[0];
    expect(String(url)).toBe("https://example.com/path");
    // The socket goes to the address that was checked, not to a second DNS answer.
    expect(target).toEqual({ address: PUBLIC_IP, family: 4 });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back to host metadata when the upstream response is not html, without reading it", async () => {
    const json = response(200, { "content-type": "application/json" }, "{}");
    mockPinnedRequest.mockResolvedValue(json);

    const metadata = await fetchLinkPreviewMetadata("https://example.com/api");
    expect(metadata.title).toBeNull();
    expect(metadata.description).toBeNull();
    expect(metadata.siteName).toBe("example.com");
    expect(json.destroy).toHaveBeenCalled();
  });

  it("follows a redirect to another public page, vetting the new host", async () => {
    mockDnsLookup.mockImplementation(async (host: string) =>
      host === "www.example.com" ? [{ address: "93.184.216.35", family: 4 }] : [{ address: PUBLIC_IP, family: 4 }],
    );
    mockPinnedRequest
      .mockResolvedValueOnce(response(301, { location: "https://www.example.com/news" }))
      .mockResolvedValueOnce(response(200, { "content-type": "text/html" }, HTML));

    const metadata = await fetchLinkPreviewMetadata("https://example.com/news");

    expect(metadata.title).toBe("EA Masters 26");
    expect(metadata.resolvedUrl).toBe("https://www.example.com/news");
    expect(requestedUrls()).toEqual(["https://example.com/news", "https://www.example.com/news"]);
    expect(mockPinnedRequest.mock.calls[1][1]).toEqual({ address: "93.184.216.35", family: 4 });
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:80/admin",
    "http://[::1]/",
    "http://10.0.0.1/",
    "http://example.com:8080/",
    "ftp://example.com/",
  ])("never fetches a redirect to %s", async (location) => {
    mockPinnedRequest.mockResolvedValueOnce(response(302, { location }));

    const metadata = await fetchLinkPreviewMetadata("https://example.com/r");

    expect(requestedUrls()).toEqual(["https://example.com/r"]);
    expect(metadata.title).toBeNull();
    expect(metadata.host).toBe("example.com");
  });

  it("never fetches a redirect to a hostname that now resolves to a private address", async () => {
    mockDnsLookup.mockImplementation(async (host: string) =>
      host === "rebind.example.net" ? [{ address: "127.0.0.1", family: 4 }] : [{ address: PUBLIC_IP, family: 4 }],
    );
    mockPinnedRequest.mockResolvedValueOnce(response(302, { location: "http://rebind.example.net/" }));

    const metadata = await fetchLinkPreviewMetadata("https://example.com/r");

    expect(requestedUrls()).toEqual(["https://example.com/r"]);
    expect(metadata.title).toBeNull();
  });

  it("stops after 3 redirects", async () => {
    mockPinnedRequest.mockImplementation(async () => response(302, { location: "https://example.com/loop" }));

    const metadata = await fetchLinkPreviewMetadata("https://example.com/start");

    expect(mockPinnedRequest).toHaveBeenCalledTimes(4);
    expect(metadata.title).toBeNull();
  });

  it("gives up on an html body over the size cap", async () => {
    const big = response(200, { "content-type": "text/html" }, [
      Buffer.from("<html><head><title>Troppo</title>"),
      Buffer.alloc(LINK_PREVIEW_HTML_MAX_BYTES, 0x20),
    ]);
    mockPinnedRequest.mockResolvedValue(big);

    const metadata = await fetchLinkPreviewMetadata("https://example.com/big");

    expect(metadata.title).toBeNull();
    expect(big.destroy).toHaveBeenCalled();
  });

  it("gives up early when content-length announces an oversized html body", async () => {
    const big = response(
      200,
      { "content-type": "text/html", "content-length": String(LINK_PREVIEW_HTML_MAX_BYTES + 1) },
      "<html><head><title>Troppo</title></head></html>",
    );
    mockPinnedRequest.mockResolvedValue(big);

    const metadata = await fetchLinkPreviewMetadata("https://example.com/big");

    expect(metadata.title).toBeNull();
    expect(big.destroy).toHaveBeenCalled();
  });

  it("aborts a request that takes longer than the timeout", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    mockPinnedRequest.mockImplementation(
      (_url: URL, _target: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.signal;
          options.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const pending = fetchLinkPreviewMetadata("https://example.com/slow");
    await vi.advanceTimersByTimeAsync(LINK_PREVIEW_TIMEOUT_MS + 1);
    const metadata = await pending;

    expect(signal?.aborted).toBe(true);
    expect(metadata.title).toBeNull();
  });
});

describe("fetchLinkPreviewImage", () => {
  it("returns a public image", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    mockPinnedRequest.mockResolvedValue(response(200, { "content-type": "image/png" }, png));

    const image = await fetchLinkPreviewImage("https://example.com/cover.png");

    expect(image.mimeType).toBe("image/png");
    expect(image.buffer.equals(png)).toBe(true);
  });

  it("refuses a redirect to an internal address", async () => {
    mockPinnedRequest.mockResolvedValueOnce(response(302, { location: "http://169.254.169.254/latest/meta-data/" }));

    await expect(fetchLinkPreviewImage("https://example.com/cover.png")).rejects.toBeInstanceOf(LinkPreviewInputError);
    expect(requestedUrls()).toEqual(["https://example.com/cover.png"]);
  });

  it.each(["text/html", "application/octet-stream", "image/svg+xml", ""])(
    "refuses the content type %j",
    async (contentType) => {
      const upstream = response(200, contentType ? { "content-type": contentType } : {}, "<svg/>");
      mockPinnedRequest.mockResolvedValue(upstream);

      await expect(fetchLinkPreviewImage("https://example.com/cover")).rejects.toThrow();
      expect(upstream.destroy).toHaveBeenCalled();
    },
  );

  it("refuses an image over the size cap", async () => {
    const big = response(200, { "content-type": "image/jpeg" }, [
      Buffer.alloc(LINK_PREVIEW_IMAGE_MAX_BYTES, 1),
      Buffer.alloc(1, 1),
    ]);
    mockPinnedRequest.mockResolvedValue(big);

    await expect(fetchLinkPreviewImage("https://example.com/huge.jpg")).rejects.toThrow(/too large/i);
    expect(big.destroy).toHaveBeenCalled();
  });

  it("refuses an upstream error status", async () => {
    mockPinnedRequest.mockResolvedValue(response(404, { "content-type": "image/png" }));
    await expect(fetchLinkPreviewImage("https://example.com/missing.png")).rejects.toThrow();
  });
});

describe("buildLinkPreviewImageProxyUrl", () => {
  it("builds the image proxy url", () => {
    const proxyUrl = buildLinkPreviewImageProxyUrl("https://example.com/cover.png?size=1");
    expect(proxyUrl).toBe("/api/link-preview/image?url=https%3A%2F%2Fexample.com%2Fcover.png%3Fsize%3D1");
  });
});
