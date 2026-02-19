import { describe, expect, it } from "vitest";
import { DEFAULT_VIDEO_CLIP_RANGE, parseVideoClipRange } from "./StoryViewer";

describe("parseVideoClipRange", () => {
  it("returns default range for null URL", () => {
    expect(parseVideoClipRange(null)).toEqual(DEFAULT_VIDEO_CLIP_RANGE);
  });

  it("returns default range when URL has no clip fragment", () => {
    expect(parseVideoClipRange("https://cdn.example.com/story.mp4")).toEqual(DEFAULT_VIDEO_CLIP_RANGE);
  });

  it("parses start-only clip fragment", () => {
    expect(parseVideoClipRange("https://cdn.example.com/story.mp4#t=12.5")).toEqual({
      start: 12.5,
      end: null,
    });
  });

  it("parses start/end clip fragment", () => {
    expect(parseVideoClipRange("https://cdn.example.com/story.mp4#t=5,19.75")).toEqual({
      start: 5,
      end: 19.75,
    });
  });

  it("returns default range for negative start", () => {
    expect(parseVideoClipRange("https://cdn.example.com/story.mp4#t=-1,3")).toEqual(DEFAULT_VIDEO_CLIP_RANGE);
  });

  it("forces end to null when end is equal or lower than start", () => {
    expect(parseVideoClipRange("https://cdn.example.com/story.mp4#t=8,8")).toEqual({
      start: 8,
      end: null,
    });
    expect(parseVideoClipRange("https://cdn.example.com/story.mp4#t=8,2")).toEqual({
      start: 8,
      end: null,
    });
  });

  it("ignores malformed fragments that do not match #t=start,end at the end", () => {
    expect(parseVideoClipRange("https://cdn.example.com/story.mp4#foo&t=1,2")).toEqual(DEFAULT_VIDEO_CLIP_RANGE);
    expect(parseVideoClipRange("https://cdn.example.com/story.mp4#t=1,2&x=3")).toEqual(DEFAULT_VIDEO_CLIP_RANGE);
  });
});
