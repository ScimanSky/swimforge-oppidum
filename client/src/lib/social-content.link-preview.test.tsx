import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/link-preview and its image proxy need a session. The web sends the session cookie
// (same origin, also for <img>); the native app has no cookie session, it must send its
// bearer token, which an <img> tag cannot carry: the image is fetched and shown as a blob.

const mocks = vi.hoisted(() => ({ native: false, token: null as string | null }));

vi.mock("./platform", () => ({ isNativePlatform: () => mocks.native }));
vi.mock("./session-token", () => ({ getNativeSessionToken: () => mocks.token }));

import { LinkPreviewCard } from "./social-content";

const fetchMock = vi.fn();
const createObjectURL = vi.fn(() => "blob:preview-image");
const revokeObjectURL = vi.fn();

function previewPayload(url: string) {
  return {
    requestedUrl: url,
    resolvedUrl: url,
    host: "example.com",
    siteName: "Example",
    title: "Notizie dal club",
    description: null,
    imageUrl: "https://example.com/cover.png",
    imageProxyUrl: `/api/link-preview/image?url=${encodeURIComponent("https://example.com/cover.png")}`,
  };
}

function headersOf(call: unknown[]) {
  return new Headers((call[1] as RequestInit | undefined)?.headers);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input: string) => {
    if (input.startsWith("/api/link-preview/image")) {
      return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), { status: 200 });
    }
    const target = new URL(input, "https://swimforge.it").searchParams.get("url") ?? "";
    return new Response(JSON.stringify(previewPayload(target)), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.native = false;
  mocks.token = null;
});

describe("LinkPreviewCard on native", () => {
  it("sends the bearer token and shows the proxied image as a blob", async () => {
    mocks.native = true;
    mocks.token = "native-jwt";
    const { unmount } = render(<LinkPreviewCard url="https://example.com/native" />);

    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "blob:preview-image"));
    expect(screen.getByText("Notizie dal club")).toBeInTheDocument();

    const [metadataCall, imageCall] = fetchMock.mock.calls;
    expect(String(metadataCall[0])).toMatch(/^\/api\/link-preview\?url=/);
    expect(headersOf(metadataCall).get("authorization")).toBe("Bearer native-jwt");
    expect(String(imageCall[0])).toMatch(/^\/api\/link-preview\/image\?url=/);
    expect(headersOf(imageCall).get("authorization")).toBe("Bearer native-jwt");

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview-image");
  });
});

describe("LinkPreviewCard on the web", () => {
  it("relies on the session cookie: no bearer, the image loads straight from the proxy", async () => {
    render(<LinkPreviewCard url="https://example.com/web" />);

    await waitFor(() =>
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        `/api/link-preview/image?url=${encodeURIComponent("https://example.com/cover.png")}`,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [metadataCall] = fetchMock.mock.calls;
    expect((metadataCall[1] as RequestInit).credentials).toBe("include");
    expect(headersOf(metadataCall).get("authorization")).toBeNull();
  });
});
