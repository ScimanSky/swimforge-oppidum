import { describe, expect, it } from "vitest";
import { shouldEnforceCsrf } from "./csrf";

describe("shouldEnforceCsrf", () => {
  const base = { type: "mutation" as const, hasSessionCookie: true, hasBearer: false, env: "production", disabled: false };
  it("enforces for cookie-authenticated mutations", () => expect(shouldEnforceCsrf(base)).toBe(true));
  it("skips queries", () => expect(shouldEnforceCsrf({ ...base, type: "query" })).toBe(false));
  it("skips anonymous requests", () => expect(shouldEnforceCsrf({ ...base, hasSessionCookie: false })).toBe(false));
  it("skips bearer-authenticated requests even with a cookie", () => expect(shouldEnforceCsrf({ ...base, hasBearer: true })).toBe(false));
  it("skips in test env or when disabled", () => {
    expect(shouldEnforceCsrf({ ...base, env: "test" })).toBe(false);
    expect(shouldEnforceCsrf({ ...base, disabled: true })).toBe(false);
  });
});
