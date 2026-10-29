import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// /api/link-preview fetches arbitrary URLs from the server: only a logged-in user (session
// cookie on the web, bearer token on the native app) may use it, like the tRPC API.

const m = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  fetchLinkPreviewMetadata: vi.fn(),
  fetchLinkPreviewImage: vi.fn(),
}));

vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest: m.authenticateRequest } }));
vi.mock("../lib/link_preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/link_preview")>()),
  fetchLinkPreviewMetadata: m.fetchLinkPreviewMetadata,
  fetchLinkPreviewImage: m.fetchLinkPreviewImage,
}));

import { LinkPreviewInputError } from "../lib/link_preview";
import { linkPreviewRouter } from "./link_preview";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(linkPreviewRouter);
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const TARGET = encodeURIComponent("https://example.com/news");
const user = { id: 42, name: "Viewer" };

beforeEach(() => {
  vi.clearAllMocks();
  m.authenticateRequest.mockRejectedValue(new Error("Invalid session cookie"));
  m.fetchLinkPreviewMetadata.mockResolvedValue({
    requestedUrl: "https://example.com/news",
    resolvedUrl: "https://example.com/news",
    host: "example.com",
    siteName: "Example",
    title: "Notizie",
    description: null,
    imageUrl: "https://example.com/cover.png",
  });
  m.fetchLinkPreviewImage.mockResolvedValue({ buffer: Buffer.from([1, 2, 3]), mimeType: "image/png" });
});

describe("unauthenticated requests", () => {
  it.each([`/api/link-preview?url=${TARGET}`, `/api/link-preview/image?url=${TARGET}`, "/api/link-preview"])(
    "%s answers 401 without fetching anything",
    async (path) => {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: expect.stringMatching(/accedi/i) });
      expect(m.fetchLinkPreviewMetadata).not.toHaveBeenCalled();
      expect(m.fetchLinkPreviewImage).not.toHaveBeenCalled();
    },
  );
});

describe("authenticated requests", () => {
  beforeEach(() => {
    m.authenticateRequest.mockResolvedValue(user);
  });

  it("returns the metadata and the image proxy url", async () => {
    const res = await fetch(`${baseUrl}/api/link-preview?url=${TARGET}`, {
      headers: { cookie: "app_session_id=signed" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      title: "Notizie",
      imageProxyUrl: `/api/link-preview/image?url=${encodeURIComponent("https://example.com/cover.png")}`,
    });
    expect(m.fetchLinkPreviewMetadata).toHaveBeenCalledWith("https://example.com/news");
    expect(m.authenticateRequest.mock.calls[0][0].headers.cookie).toBe("app_session_id=signed");
  });

  it("passes the native app's bearer token to the session check", async () => {
    const res = await fetch(`${baseUrl}/api/link-preview?url=${TARGET}`, {
      headers: { authorization: "Bearer native-token" },
    });

    expect(res.status).toBe(200);
    expect(m.authenticateRequest.mock.calls[0][0].headers.authorization).toBe("Bearer native-token");
  });

  it("proxies the image with a private cache policy", async () => {
    const res = await fetch(`${baseUrl}/api/link-preview/image?url=${TARGET}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
  });

  it("answers 400 when the url parameter is missing", async () => {
    const res = await fetch(`${baseUrl}/api/link-preview`);
    expect(res.status).toBe(400);
  });

  it("answers 400 for a refused url", async () => {
    m.fetchLinkPreviewMetadata.mockRejectedValue(new LinkPreviewInputError("Host non consentito per anteprima link."));
    m.fetchLinkPreviewImage.mockRejectedValue(new LinkPreviewInputError("Host non consentito per anteprima link."));

    const metadata = await fetch(`${baseUrl}/api/link-preview?url=${TARGET}`);
    expect(metadata.status).toBe(400);
    expect(await metadata.json()).toEqual({ error: "Host non consentito per anteprima link." });

    const image = await fetch(`${baseUrl}/api/link-preview/image?url=${TARGET}`);
    expect(image.status).toBe(400);
  });

  it("answers 502 when the upstream image cannot be fetched", async () => {
    m.fetchLinkPreviewImage.mockRejectedValue(new Error("Response body too large"));
    const res = await fetch(`${baseUrl}/api/link-preview/image?url=${TARGET}`);
    expect(res.status).toBe(502);
  });
});
