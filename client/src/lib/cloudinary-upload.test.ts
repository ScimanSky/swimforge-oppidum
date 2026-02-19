import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadVideoToCloudinary, type CloudinaryVideoAuth } from "./cloudinary-upload";

const AUTH: CloudinaryVideoAuth = {
  cloudName: "demo-cloud",
  apiKey: "demo-key",
  timestamp: 1712345678,
  signature: "signed-payload",
  folder: "stories/42",
};

const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1/demo-cloud/video/upload";

function mockFile() {
  return new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("uploadVideoToCloudinary", () => {
  it("sends multipart payload with expected auth fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ secure_url: "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4", public_id: "story-video-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadVideoToCloudinary(mockFile(), AUTH);

    expect(result).toEqual({
      url: "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
      publicId: "story-video-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(CLOUDINARY_UPLOAD_URL);

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(requestInit.method).toBe("POST");
    const body = requestInit.body as FormData;
    expect(body.get("api_key")).toBe(AUTH.apiKey);
    expect(body.get("timestamp")).toBe(String(AUTH.timestamp));
    expect(body.get("signature")).toBe(AUTH.signature);
    expect(body.get("folder")).toBe(AUTH.folder);
    expect(body.get("file")).toBeInstanceOf(File);
  });

  it("uses url fallback when secure_url is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: "http://res.cloudinary.com/demo/video/upload/v1/clip.mp4", public_id: "clip-id" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadVideoToCloudinary(mockFile(), AUTH);
    expect(result).toEqual({
      url: "http://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
      publicId: "clip-id",
    });
  });

  it("throws Cloudinary detail when API responds with structured error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "Invalid Signature abc123" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadVideoToCloudinary(mockFile(), AUTH)).rejects.toThrow("Invalid Signature abc123");
  });

  it("falls back to status code when error payload is not parseable JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("bad json");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadVideoToCloudinary(mockFile(), AUTH)).rejects.toThrow("Cloudinary upload failed (500)");
  });

  it("throws when response is ok but no URL is returned", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ public_id: "missing-url" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadVideoToCloudinary(mockFile(), AUTH)).rejects.toThrow(
      "Cloudinary non ha restituito un URL valido"
    );
  });
});
