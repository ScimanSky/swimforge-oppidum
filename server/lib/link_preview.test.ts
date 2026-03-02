import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetchWithTimeout = vi.hoisted(() => vi.fn());
const mockDnsLookup = vi.hoisted(() => vi.fn());

vi.mock("./fetchWithTimeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: (...args: unknown[]) => mockDnsLookup(...args),
  },
}));

import {
  LinkPreviewInputError,
  buildLinkPreviewImageProxyUrl,
  fetchLinkPreviewMetadata,
  normalizeAndValidateExternalPreviewUrl,
} from "./link_preview";

describe("link preview helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("normalizes bare domains to https", async () => {
    await expect(normalizeAndValidateExternalPreviewUrl("eamasters26.com/news")).resolves.toBe(
      "https://eamasters26.com/news",
    );
  });

  it("blocks localhost/private hosts", async () => {
    await expect(normalizeAndValidateExternalPreviewUrl("http://localhost:3000")).rejects.toBeInstanceOf(
      LinkPreviewInputError,
    );
    await expect(normalizeAndValidateExternalPreviewUrl("http://127.0.0.1")).rejects.toBeInstanceOf(
      LinkPreviewInputError,
    );
  });

  it("extracts og metadata and resolves relative image url", async () => {
    const html = `
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

    mockFetchWithTimeout.mockResolvedValue(
      new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
      }),
    );

    const metadata = await fetchLinkPreviewMetadata("https://example.com/path");

    expect(metadata.title).toBe("EA Masters 26");
    expect(metadata.description).toBe("Team di nuoto master.");
    expect(metadata.siteName).toBe("EA Masters");
    expect(metadata.imageUrl).toBe("https://example.com/cover.jpg");
    expect(metadata.host).toBe("example.com");
  });

  it("falls back to host metadata when upstream response is not html", async () => {
    mockFetchWithTimeout.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    const metadata = await fetchLinkPreviewMetadata("https://example.com/api");
    expect(metadata.title).toBeNull();
    expect(metadata.description).toBeNull();
    expect(metadata.siteName).toBe("example.com");
  });

  it("builds image proxy url", () => {
    const proxyUrl = buildLinkPreviewImageProxyUrl("https://example.com/cover.png?size=1");
    expect(proxyUrl).toBe("/api/link-preview/image?url=https%3A%2F%2Fexample.com%2Fcover.png%3Fsize%3D1");
  });
});
