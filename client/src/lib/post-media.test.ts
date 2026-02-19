import { describe, expect, it } from "vitest";
import {
  detectMediaKindFromFile,
  extractHashtags,
  isVideoUrl,
  MAX_POST_IMAGE_BYTES,
  MAX_POST_VIDEO_BYTES,
  validatePostMediaFile,
} from "./post-media";

describe("post-media helpers", () => {
  it("detects image kind for jpeg", () => {
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    expect(detectMediaKindFromFile(file)).toBe("image");
  });

  it("detects video kind for supported video mime", () => {
    const file = new File(["x"], "clip.any", { type: "video/mp4" });
    expect(detectMediaKindFromFile(file)).toBe("video");
  });

  it("detects video by extension when mime is generic", () => {
    const file = new File(["x"], "swim.mov", { type: "application/octet-stream" });
    expect(detectMediaKindFromFile(file)).toBe("video");
  });

  it("returns null for unsupported media", () => {
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    expect(detectMediaKindFromFile(file)).toBeNull();
  });

  it("validates image size upper bound", () => {
    const oversized = new File([new Uint8Array(MAX_POST_IMAGE_BYTES + 1)], "big.jpg", { type: "image/jpeg" });
    const result = validatePostMediaFile(oversized);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ message: "Immagine troppo grande (max 20MB)." });
  });

  it("validates video size upper bound", () => {
    const oversized = new File([new Uint8Array(MAX_POST_VIDEO_BYTES + 1)], "big.mp4", { type: "video/mp4" });
    const result = validatePostMediaFile(oversized);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ message: "Video troppo grande (max 100MB)." });
  });

  it("rejects unsupported media types", () => {
    const file = new File(["x"], "track.gpx", { type: "application/gpx+xml" });
    const result = validatePostMediaFile(file);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      message: "Formato non supportato. Usa JPG, PNG, WEBP, MP4, WEBM o MOV.",
    });
  });

  it("accepts supported image media", () => {
    const file = new File(["ok"], "pool.webp", { type: "image/webp" });
    expect(validatePostMediaFile(file)).toEqual({ ok: true, kind: "image" });
  });

  it("accepts supported video media", () => {
    const file = new File(["ok"], "turn.mp4", { type: "video/mp4" });
    expect(validatePostMediaFile(file)).toEqual({ ok: true, kind: "video" });
  });

  it("extracts normalized unique hashtags", () => {
    const text = "Oggi #Sprint e ancora #sprint poi #Tecnica_50";
    expect(extractHashtags(text)).toEqual(["sprint", "tecnica_50"]);
  });

  it("ignores too short or too long hashtags", () => {
    const tooLong = "x".repeat(41);
    const text = `#a #ok #${tooLong}`;
    expect(extractHashtags(text)).toEqual(["ok"]);
  });

  it("detects video urls even with fragments", () => {
    expect(isVideoUrl("https://cdn.example.com/clip.mp4#t=0,10")).toBe(true);
    expect(isVideoUrl("https://cdn.example.com/photo.jpg")).toBe(false);
  });
});

