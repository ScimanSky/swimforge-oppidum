import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./bearer";

describe("extractBearerToken", () => {
  it("returns the token after the Bearer prefix", () => {
    expect(extractBearerToken({ authorization: "Bearer abc.def.ghi" })).toBe("abc.def.ghi");
  });
  it("is case-insensitive on the scheme and trims spaces", () => {
    expect(extractBearerToken({ authorization: "bearer   tok " })).toBe("tok");
  });
  it("returns null for missing, empty or other schemes", () => {
    expect(extractBearerToken({})).toBeNull();
    expect(extractBearerToken({ authorization: "Basic xyz" })).toBeNull();
    expect(extractBearerToken({ authorization: "Bearer " })).toBeNull();
    expect(extractBearerToken({ authorization: ["Bearer a", "Bearer b"] })).toBe("a");
  });
});
