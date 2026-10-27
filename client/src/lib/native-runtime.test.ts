import { describe, expect, it, vi } from "vitest";
import { createDeepLinkHandler, shouldExitOnBack } from "./native-runtime";

describe("shouldExitOnBack", () => {
  it("goes back when there is history and we are not on the home", () => {
    expect(shouldExitOnBack("/post/7", true)).toBe(false);
    expect(shouldExitOnBack("/home/messages", true)).toBe(false);
  });
  it("exits on the home even with history", () => {
    expect(shouldExitOnBack("/home", true)).toBe(true);
    expect(shouldExitOnBack("/home/", true)).toBe(true);
  });
  it("exits when there is nowhere to go back to", () => {
    expect(shouldExitOnBack("/post/7", false)).toBe(true);
  });
});

describe("createDeepLinkHandler", () => {
  const setup = () => {
    let clock = 0;
    const navigate = vi.fn();
    const onAuthCallback = vi.fn();
    const handle = createDeepLinkHandler({ navigate, onAuthCallback }, () => clock);
    return { handle, navigate, onAuthCallback, advance: (ms: number) => (clock += ms) };
  };

  it("sends the OAuth return to the auth callback", () => {
    const { handle, navigate, onAuthCallback } = setup();
    expect(handle("swimforge://auth/callback?code=abc")).toBe(true);
    expect(onAuthCallback).toHaveBeenCalledWith({ code: "abc", error: null });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates to website links", () => {
    const { handle, navigate } = setup();
    expect(handle("https://www.swimforge.it/post/7?c=1")).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/post/7?c=1");
  });

  it("ignores unknown and empty URLs", () => {
    const { handle, navigate, onAuthCallback } = setup();
    expect(handle("https://example.com/x")).toBe(false);
    expect(handle(undefined)).toBe(false);
    expect(handle("")).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(onAuthCallback).not.toHaveBeenCalled();
  });

  it("ignores the same URL delivered twice in a row (cold start), not later repeats", () => {
    const { handle, navigate, advance } = setup();
    handle("https://swimforge.it/home");
    advance(100);
    expect(handle("https://swimforge.it/home")).toBe(false);
    advance(5000);
    expect(handle("https://swimforge.it/home")).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
