import { describe, expect, it } from "vitest";
import { buildAssetUrl } from "./asset-base";

describe("buildAssetUrl", () => {
  it("returns the path unchanged when the base is empty (web)", () => {
    expect(buildAssetUrl("", "/images/landing-v5/hero-main.webp")).toBe("/images/landing-v5/hero-main.webp");
  });
  it("prefixes root-relative paths with the base (native)", () => {
    expect(buildAssetUrl("https://swimforge.it", "/badges_new/first_swim.png")).toBe(
      "https://swimforge.it/badges_new/first_swim.png",
    );
  });
  it("does not double the slash when the base has a trailing slash", () => {
    expect(buildAssetUrl("https://swimforge.it/", "/profile_badges/level_1_novizio.png")).toBe(
      "https://swimforge.it/profile_badges/level_1_novizio.png",
    );
  });
  it("leaves absolute, protocol-relative, data and blob URLs untouched", () => {
    const base = "https://swimforge.it";
    for (const url of [
      "https://ik.imagekit.io/x/cover.jpg",
      "//cdn.example.com/a.png",
      "data:image/png;base64,AAAA",
      "blob:https://app.swimforge.it/123",
      "",
    ]) {
      expect(buildAssetUrl(base, url)).toBe(url);
    }
  });
});
