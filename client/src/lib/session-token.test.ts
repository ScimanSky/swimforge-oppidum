import { beforeEach, describe, expect, it } from "vitest";
import { clearNativeSessionToken, getNativeSessionToken, setNativeSessionToken } from "./session-token";

describe("session-token", () => {
  beforeEach(() => localStorage.clear());
  it("stores and reads the token", () => { setNativeSessionToken("t"); expect(getNativeSessionToken()).toBe("t"); });
  it("clears the token", () => { setNativeSessionToken("t"); clearNativeSessionToken(); expect(getNativeSessionToken()).toBeNull(); });
  it("survives a broken storage", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new Error("blocked"); };
    try { expect(getNativeSessionToken()).toBeNull(); } finally { Storage.prototype.getItem = original; }
  });
});
