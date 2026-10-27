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
});
