import { describe, expect, it } from "vitest";
import { buildApiUrl } from "./api-base";

describe("buildApiUrl", () => {
  it("returns the path unchanged when the base is empty (web)", () => {
    expect(buildApiUrl("", "/api/trpc")).toBe("/api/trpc");
  });
  it("prefixes the base when set (native)", () => {
    expect(buildApiUrl("https://swimforge.it", "/api/trpc")).toBe("https://swimforge.it/api/trpc");
  });
  it("does not double the slash when the base has a trailing slash", () => {
    expect(buildApiUrl("https://swimforge.it/", "/api/trpc")).toBe("https://swimforge.it/api/trpc");
  });
  it("adds the slash when the path has no leading slash", () => {
    expect(buildApiUrl("https://swimforge.it", "api/link-preview?url=x")).toBe(
      "https://swimforge.it/api/link-preview?url=x",
    );
  });
  it("returns absolute, protocol-relative and empty values unchanged", () => {
    expect(buildApiUrl("https://swimforge.it", "https://cdn.example.com/a.png")).toBe("https://cdn.example.com/a.png");
    expect(buildApiUrl("https://swimforge.it", "//cdn.example.com/a.png")).toBe("//cdn.example.com/a.png");
    expect(buildApiUrl("https://swimforge.it", "")).toBe("");
  });
  it("returns data: and blob: URLs unchanged", () => {
    expect(buildApiUrl("https://swimforge.it", "data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(buildApiUrl("https://swimforge.it", "blob:https://app.swimforge.it/123")).toBe("blob:https://app.swimforge.it/123");
  });
});
