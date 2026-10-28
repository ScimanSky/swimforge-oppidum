import { describe, expect, it } from "vitest";
import { buildPublicSiteUrl, publicSiteUrl } from "./public-url";

describe("public site urls", () => {
  it("uses the page origin on the web", () => {
    expect(
      buildPublicSiteUrl("/post/7", { isNative: false, nativeBase: "https://swimforge.it", webOrigin: "https://staging.example" }),
    ).toBe("https://staging.example/post/7");
  });

  it("uses the public site on native, not the WebView origin", () => {
    expect(
      buildPublicSiteUrl("/auth/callback", {
        isNative: true,
        nativeBase: "https://swimforge.it/",
        webOrigin: "https://app.swimforge.it",
      }),
    ).toBe("https://swimforge.it/auth/callback");
  });

  it("normalises the slash between base and path", () => {
    expect(
      buildPublicSiteUrl("community/invite/abc", { isNative: true, nativeBase: "https://swimforge.it", webOrigin: "" }),
    ).toBe("https://swimforge.it/community/invite/abc");
  });

  it("falls back to window.location.origin in the browser", () => {
    expect(publicSiteUrl("/reset-password")).toBe(`${window.location.origin}/reset-password`);
  });
});
