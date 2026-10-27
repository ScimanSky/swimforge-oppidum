import { describe, expect, it } from "vitest";
import { resolveDeepLink } from "./deep-links";

describe("resolveDeepLink", () => {
  it("maps the OAuth return to an auth callback with the code", () => {
    expect(resolveDeepLink("swimforge://auth/callback?code=abc-123")).toEqual({
      kind: "auth-callback",
      code: "abc-123",
      error: null,
    });
  });

  it("reads the OAuth error, preferring error_description", () => {
    expect(
      resolveDeepLink("swimforge://auth/callback?error=access_denied&error_description=User+cancelled"),
    ).toEqual({ kind: "auth-callback", code: null, error: "User cancelled" });
    expect(resolveDeepLink("swimforge://auth/callback?error=server_error")).toEqual({
      kind: "auth-callback",
      code: null,
      error: "server_error",
    });
    expect(resolveDeepLink("swimforge://auth/callback#error=access_denied")).toEqual({
      kind: "auth-callback",
      code: null,
      error: "access_denied",
    });
  });

  it("requires the exact callback path, not a prefix", () => {
    expect(resolveDeepLink("swimforge://auth/callbackx?code=a")).toBeNull();
    expect(resolveDeepLink("swimforge://auth/callback/extra?code=a")).toBeNull();
    expect(resolveDeepLink("swimforge://other/callback?code=a")).toBeNull();
    expect(resolveDeepLink("swimforge://auth?code=a")).toBeNull();
  });

  it("maps website links to in-app routes with the query", () => {
    expect(resolveDeepLink("https://swimforge.it/home/messages?thread=42")).toEqual({
      kind: "route",
      path: "/home/messages?thread=42",
    });
    expect(resolveDeepLink("https://www.swimforge.it/post/7#comments")).toEqual({
      kind: "route",
      path: "/post/7",
    });
    expect(resolveDeepLink("https://swimforge.it")).toEqual({ kind: "route", path: "/" });
  });

  it("ignores other hosts, schemes and ports", () => {
    expect(resolveDeepLink("https://evil.example/home")).toBeNull();
    expect(resolveDeepLink("https://swimforge.it.evil.example/home")).toBeNull();
    expect(resolveDeepLink("http://swimforge.it/home")).toBeNull();
    expect(resolveDeepLink("https://swimforge.it:8443/home")).toBeNull();
    expect(resolveDeepLink("intent://swimforge.it/home")).toBeNull();
  });

  it("returns null for malformed or empty URLs", () => {
    expect(resolveDeepLink("")).toBeNull();
    expect(resolveDeepLink("not a url")).toBeNull();
    expect(resolveDeepLink("https://")).toBeNull();
  });
});
