import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { canGoBackInApp, installInAppHistory, previousInAppPath } from "./in-app-history";

describe("in-app history", () => {
  beforeAll(() => {
    // An entry from before the SPA (e.g. arrival from a search engine) has no index.
    window.history.replaceState(null, "", "/");
  });

  it("before installation nothing counts as in-app history", () => {
    expect(canGoBackInApp()).toBe(false);
  });

  describe("installed", () => {
    beforeAll(() => {
      window.history.replaceState({ fromBefore: true }, "", "/arrivo");
      installInAppHistory();
      installInAppHistory(); // idempotent: a second call does not wrap twice
    });
    beforeEach(() => {
      window.history.replaceState({ sfIdx: 0 }, "", "/home");
    });

    it("the boot entry is the in-app root: back would leave the site", () => {
      expect(window.history.state).toMatchObject({ sfIdx: 0 });
      expect(canGoBackInApp()).toBe(false);
    });

    it("each push adds one, keeping the router state", () => {
      window.history.pushState({ from: "wouter" }, "", "/track");
      expect(window.history.state).toEqual({ from: "wouter", sfIdx: 1, sfPrev: "/home" });
      expect(canGoBackInApp()).toBe(true);
      window.history.pushState(null, "", "/track/4");
      expect(window.history.state).toEqual({ sfIdx: 2, sfPrev: "/track" });
    });

    it("replace keeps the current index", () => {
      window.history.pushState(null, "", "/goals");
      window.history.replaceState(null, "", "/goals?x=1");
      expect(window.history.state).toEqual({ sfIdx: 1, sfPrev: "/home" });
      expect(canGoBackInApp()).toBe(true);
    });

    it("knows the previous in-app path, also after a replace; none at the root", () => {
      expect(previousInAppPath()).toBeNull();
      window.history.pushState(null, "", "/community/club/7?tab=feed");
      window.history.pushState(null, "", "/community/club/7/event/3");
      expect(previousInAppPath()).toBe("/community/club/7?tab=feed");
      window.history.replaceState(null, "", "/community/club/7/event/4");
      expect(previousInAppPath()).toBe("/community/club/7?tab=feed");
    });
  });
});
