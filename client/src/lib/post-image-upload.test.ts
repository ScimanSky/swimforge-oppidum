import { afterEach, describe, expect, it, vi } from "vitest";

const { fileToBase64Mock } = vi.hoisted(() => ({
  fileToBase64Mock: vi.fn(),
}));

vi.mock("@/lib/file-base64", () => ({
  fileToBase64: fileToBase64Mock,
}));

import { uploadPostImageWithFallback, type ImageKitPostAuth } from "./post-image-upload";

const AUTH: ImageKitPostAuth = {
  publicKey: "pk",
  token: "token",
  signature: "signature",
  expire: 1712345678,
  folder: "/posts/42",
};

function makeFile() {
  return new File(["abc"], "pool photo.jpg", { type: "image/jpeg" });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("uploadPostImageWithFallback", () => {
  it("returns ImageKit URL when direct upload succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://ik.imagekit.io/swimforge/post.jpg" }),
    });

    const fallbackMock = vi.fn();
    const result = await uploadPostImageWithFallback({
      file: makeFile(),
      auth: AUTH,
      fetchImpl: fetchMock,
      uploadFallback: fallbackMock,
    });

    expect(result).toBe("https://ik.imagekit.io/swimforge/post.jpg");
    expect(fallbackMock).not.toHaveBeenCalled();
    expect(fileToBase64Mock).not.toHaveBeenCalled();
  });

  it("falls back to server upload when ImageKit upload fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "ImageKit error" }),
      text: async () => "",
    });
    fileToBase64Mock.mockResolvedValue("YmFzZTY0");
    const fallbackMock = vi.fn().mockResolvedValue({ url: "https://supabase.example.com/post.jpg" });
    const onFallbackUsed = vi.fn();

    const result = await uploadPostImageWithFallback({
      file: makeFile(),
      auth: AUTH,
      fetchImpl: fetchMock,
      uploadFallback: fallbackMock,
      onFallbackUsed,
    });

    expect(result).toBe("https://supabase.example.com/post.jpg");
    expect(fileToBase64Mock).toHaveBeenCalledTimes(1);
    expect(fallbackMock).toHaveBeenCalledWith({
      fileBase64: "YmFzZTY0",
      mimeType: "image/jpeg",
    });
    expect(onFallbackUsed).toHaveBeenCalledTimes(1);
  });

  it("falls back when ImageKit responds without URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "missing-url" }),
    });
    fileToBase64Mock.mockResolvedValue("YmFzZTY0");
    const fallbackMock = vi.fn().mockResolvedValue({ url: "https://fallback.example.com/post.jpg" });

    const result = await uploadPostImageWithFallback({
      file: makeFile(),
      auth: AUTH,
      fetchImpl: fetchMock,
      uploadFallback: fallbackMock,
    });

    expect(result).toBe("https://fallback.example.com/post.jpg");
    expect(fileToBase64Mock).toHaveBeenCalledTimes(1);
  });

  it("throws fallback error when fallback upload also fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network fail"));
    fileToBase64Mock.mockResolvedValue("YmFzZTY0");
    const fallbackMock = vi.fn().mockRejectedValue(new Error("server fallback fail"));

    await expect(
      uploadPostImageWithFallback({
        file: makeFile(),
        auth: AUTH,
        fetchImpl: fetchMock,
        uploadFallback: fallbackMock,
      })
    ).rejects.toThrow("server fallback fail");
  });

  it("sends expected multipart auth fields to ImageKit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://ik.imagekit.io/swimforge/post.jpg" }),
    });

    await uploadPostImageWithFallback({
      file: makeFile(),
      auth: AUTH,
      fetchImpl: fetchMock,
      uploadFallback: vi.fn(),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://upload.imagekit.io/api/v1/files/upload");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    expect(body.get("publicKey")).toBe("pk");
    expect(body.get("token")).toBe("token");
    expect(body.get("signature")).toBe("signature");
    expect(body.get("expire")).toBe(String(AUTH.expire));
    expect(body.get("folder")).toBe("/posts/42");
    expect(body.get("tags")).toBe("post,swimforge");
  });
});
