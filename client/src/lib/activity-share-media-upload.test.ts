import { afterEach, describe, expect, it, vi } from "vitest";

const { uploadPostImageWithFallbackMock, uploadVideoToCloudinaryMock } = vi.hoisted(() => ({
  uploadPostImageWithFallbackMock: vi.fn(),
  uploadVideoToCloudinaryMock: vi.fn(),
}));

vi.mock("@/lib/post-image-upload", () => ({
  uploadPostImageWithFallback: uploadPostImageWithFallbackMock,
}));

vi.mock("@/lib/cloudinary-upload", () => ({
  uploadVideoToCloudinary: uploadVideoToCloudinaryMock,
}));

import { uploadActivityShareMedia } from "./activity-share-media-upload";

afterEach(() => {
  vi.clearAllMocks();
});

function makeFile() {
  return new File(["media"], "media.jpg", { type: "image/jpeg" });
}

describe("uploadActivityShareMedia", () => {
  it("uploads image using ImageKit helper and fallback callback", async () => {
    uploadPostImageWithFallbackMock.mockResolvedValue("https://ik.example.com/image.jpg");
    const getImageKitAuth = vi.fn().mockResolvedValue({
      publicKey: "pk",
      token: "token",
      signature: "sig",
      expire: 1234,
      folder: "/posts/42",
    });
    const uploadImageFallback = vi.fn().mockResolvedValue({ url: "https://sb.example.com/image.jpg" });

    const result = await uploadActivityShareMedia({
      file: makeFile(),
      kind: "image",
      getImageKitAuth,
      uploadImageFallback,
      getCloudinaryAuth: vi.fn(),
    });

    expect(result).toBe("https://ik.example.com/image.jpg");
    expect(getImageKitAuth).toHaveBeenCalledTimes(1);
    expect(uploadPostImageWithFallbackMock).toHaveBeenCalledTimes(1);
    expect(uploadVideoToCloudinaryMock).not.toHaveBeenCalled();
  });

  it("emits fallback warning when image helper triggers onFallbackUsed", async () => {
    const notifyWarning = vi.fn();
    uploadPostImageWithFallbackMock.mockImplementation(async (options: any) => {
      options.onFallbackUsed?.();
      return "https://sb.example.com/image.jpg";
    });

    const result = await uploadActivityShareMedia({
      file: makeFile(),
      kind: "image",
      getImageKitAuth: vi.fn().mockResolvedValue({
        publicKey: "pk",
        token: "token",
        signature: "sig",
        expire: 1234,
        folder: "/posts/42",
      }),
      uploadImageFallback: vi.fn().mockResolvedValue({ url: "https://sb.example.com/image.jpg" }),
      getCloudinaryAuth: vi.fn(),
      notifyWarning,
    });

    expect(result).toBe("https://sb.example.com/image.jpg");
    expect(notifyWarning).toHaveBeenCalledWith("Upload diretto non riuscito: usato fallback server.");
  });

  it("uploads video via Cloudinary and surfaces cloud warning", async () => {
    uploadVideoToCloudinaryMock.mockResolvedValue({
      url: "https://res.cloudinary.com/demo/video/upload/v1/clip.mp4",
      publicId: "clip-id",
    });
    const notifyWarning = vi.fn();
    const getCloudinaryAuth = vi.fn().mockResolvedValue({
      cloudName: "demo",
      apiKey: "key",
      timestamp: 1234,
      signature: "sig",
      folder: "posts/42",
      warning: "Attenzione quota Cloudinary",
    });

    const result = await uploadActivityShareMedia({
      file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
      kind: "video",
      getImageKitAuth: vi.fn(),
      uploadImageFallback: vi.fn(),
      getCloudinaryAuth,
      notifyWarning,
    });

    expect(result).toBe("https://res.cloudinary.com/demo/video/upload/v1/clip.mp4");
    expect(getCloudinaryAuth).toHaveBeenCalledTimes(1);
    expect(uploadVideoToCloudinaryMock).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ folder: "posts/42" })
    );
    expect(notifyWarning).toHaveBeenCalledWith("Attenzione quota Cloudinary");
  });

  it("propagates video upload errors", async () => {
    uploadVideoToCloudinaryMock.mockRejectedValue(new Error("Invalid Signature"));

    await expect(
      uploadActivityShareMedia({
        file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
        kind: "video",
        getImageKitAuth: vi.fn(),
        uploadImageFallback: vi.fn(),
        getCloudinaryAuth: vi.fn().mockResolvedValue({
          cloudName: "demo",
          apiKey: "key",
          timestamp: 1234,
          signature: "sig",
          folder: "posts/42",
        }),
      })
    ).rejects.toThrow("Invalid Signature");
  });
});
