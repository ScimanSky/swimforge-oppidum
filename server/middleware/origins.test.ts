import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ALLOWED_ORIGINS,
  createOriginGuard,
  isOriginAllowed,
  parseAllowedOrigins,
} from "./origins";

describe("parseAllowedOrigins", () => {
  it("falls back to the default list when the env value is missing or blank", () => {
    expect(parseAllowedOrigins(undefined)).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(parseAllowedOrigins("   ")).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });

  it("trims entries and drops empty ones", () => {
    expect(parseAllowedOrigins(" https://swimforge.it , https://app.swimforge.it ,,")).toEqual([
      "https://swimforge.it",
      "https://app.swimforge.it",
    ]);
  });

  it("includes the app origin and no longer the localhost capacitor origins by default", () => {
    expect(DEFAULT_ALLOWED_ORIGINS).toContain("https://app.swimforge.it");
    expect(DEFAULT_ALLOWED_ORIGINS).toContain("https://swimforge.it");
    expect(DEFAULT_ALLOWED_ORIGINS).toContain("https://www.swimforge.it");
    expect(DEFAULT_ALLOWED_ORIGINS).not.toContain("https://localhost");
    expect(DEFAULT_ALLOWED_ORIGINS).not.toContain("capacitor://localhost");
  });
});

describe("isOriginAllowed", () => {
  const list = ["https://swimforge.it", "https://app.swimforge.it"];

  it("allows a listed origin", () => {
    expect(isOriginAllowed("https://app.swimforge.it", list, true)).toBe(true);
  });

  it("rejects an unlisted origin", () => {
    expect(isOriginAllowed("https://evil.example", list, true)).toBe(false);
    expect(isOriginAllowed("https://swimforge.it.evil.example", list, false)).toBe(false);
  });

  it("allows a missing origin only outside production", () => {
    expect(isOriginAllowed(undefined, list, true)).toBe(false);
    expect(isOriginAllowed(undefined, list, false)).toBe(true);
  });

  it("matches entries that came from an env list with spaces", () => {
    const fromEnv = parseAllowedOrigins("https://swimforge.it,  https://app.swimforge.it  ");
    expect(isOriginAllowed("https://app.swimforge.it", fromEnv, true)).toBe(true);
  });
});

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      res.body = body;
      return res;
    }),
  };
  return res;
}

describe("createOriginGuard", () => {
  const guard = (warn = vi.fn()) =>
    createOriginGuard({
      getAllowedOrigins: () => ["https://swimforge.it", "https://app.swimforge.it"],
      onReject: warn,
    });

  it("answers 403 JSON to a disallowed origin without calling next", () => {
    const warn = vi.fn();
    const res = fakeRes();
    const next = vi.fn();
    guard(warn)({ headers: { origin: "https://evil.example" }, method: "POST", path: "/api/trpc/x" } as any, res as any, next);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "origin_not_allowed" });
    expect(next).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ origin: "https://evil.example" }));
  });

  it("answers 403 to a disallowed preflight as well", () => {
    const res = fakeRes();
    const next = vi.fn();
    guard()({ headers: { origin: "https://evil.example" }, method: "OPTIONS", path: "/api/trpc/x" } as any, res as any, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("lets an allowed origin through", () => {
    const res = fakeRes();
    const next = vi.fn();
    guard()({ headers: { origin: "https://app.swimforge.it" }, method: "POST", path: "/" } as any, res as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("lets requests without an Origin header through (navigation, curl, health checks)", () => {
    const res = fakeRes();
    const next = vi.fn();
    guard()({ headers: {}, method: "GET", path: "/" } as any, res as any, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
