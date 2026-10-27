import { describe, expect, it } from "vitest";
import { buildTrpcHeaders } from "./trpc-headers";

describe("buildTrpcHeaders", () => {
  it("adds the csrf header on the web", () => {
    const h = buildTrpcHeaders({ isNative: false, csrfToken: "c%20t", nativeToken: null });
    expect(h.get("x-csrf-token")).toBe("c t");
    expect(h.get("authorization")).toBeNull();
    expect(h.get("x-swimforge-client")).toBeNull();
  });
  it("adds bearer and client headers on native", () => {
    const h = buildTrpcHeaders({ isNative: true, csrfToken: null, nativeToken: "jwt" });
    expect(h.get("authorization")).toBe("Bearer jwt");
    expect(h.get("x-swimforge-client")).toBe("native");
    expect(h.get("x-csrf-token")).toBeNull();
  });
  it("sends the client header on native even before login", () => {
    const h = buildTrpcHeaders({ isNative: true, csrfToken: null, nativeToken: null });
    expect(h.get("x-swimforge-client")).toBe("native");
    expect(h.get("authorization")).toBeNull();
  });
  it("keeps existing headers", () => {
    const h = buildTrpcHeaders({ isNative: false, csrfToken: null, nativeToken: null }, { "content-type": "application/json" });
    expect(h.get("content-type")).toBe("application/json");
  });
});
