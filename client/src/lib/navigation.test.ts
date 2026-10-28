import { describe, expect, it } from "vitest";
import {
  activeTabForPath,
  homePathForPlatform,
  hubForPath,
  isPublicPath,
  normalizePath,
  pageTitleForPath,
  parentPathForPath,
} from "./navigation";

describe("normalizePath", () => {
  it("toglie query, hash e barra finale", () => {
    expect(normalizePath("/track/?x=1#a")).toBe("/track");
    expect(normalizePath("/track#a")).toBe("/track");
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("?x=1")).toBe("/");
    expect(normalizePath("//")).toBe("/");
    expect(normalizePath("///?x=1")).toBe("/");
  });
});

describe("activeTabForPath", () => {
  it.each([
    ["/today", "today"],
    ["/home", "feed"],
    ["/post/9", "feed"],
    ["/track", "train"],
    ["/track/4", "train"],
    ["/goals", "train"],
    ["/profile/performance", "train"],
    ["/coach", "train"],
    ["/home/community", "community"],
    ["/community/club/3", "community"],
    ["/leaderboard", "community"],
    ["/challenges/2", "community"],
    ["/profile", null],
    ["/messages", null],
    ["/settings", null],
    ["/badges", null],
  ])("%s → %s", (path, tab) => {
    expect(activeTabForPath(path)).toBe(tab);
  });

  it("ignora query e barra finale", () => {
    expect(activeTabForPath("/track/?from=today")).toBe("train");
  });

  it("non confonde prefissi simili", () => {
    expect(activeTabForPath("/homepage")).toBeNull();
    expect(activeTabForPath("/tracker")).toBeNull();
  });
});

describe("hubForPath", () => {
  it.each([
    ["/track", "train"],
    ["/goals", "train"],
    ["/coach", "train"],
    ["/track/4", null],
    ["/home/community", "community"],
    ["/leaderboard", "community"],
    ["/challenges", "community"],
    ["/challenges/2", null],
    ["/community/club/3", null],
  ])("%s → %s", (path, hub) => {
    expect(hubForPath(path)).toBe(hub);
  });
});

describe("pageTitleForPath", () => {
  it.each([
    ["/today", "Oggi"],
    ["/home", "Feed"],
    ["/track", "Allena"],
    ["/track/4", "Allena"],
    ["/home/community", "Community"],
    ["/challenges/2", "Sfida"],
    ["/community/club/3/event/5", "Evento"],
    ["/community/club/3", "Club"],
    ["/profile", "Profilo"],
    ["/settings", "Impostazioni"],
    ["/messages", "Messaggi"],
    ["/admin/reports", "Moderazione"],
    ["/home/report/post/5", "Segnala"],
  ])("%s → %s", (path, title) => {
    expect(pageTitleForPath(path)).toBe(title);
  });

  it("ricade su SwimForge per le rotte sconosciute", () => {
    expect(pageTitleForPath("/unknown")).toBe("SwimForge");
  });
});

describe("parentPathForPath", () => {
  it.each([
    ["/track/4", "/track"],
    ["/post/9", "/home"],
    ["/challenges/2", "/challenges"],
    ["/community/club/3/workouts", "/community/club/3"],
    ["/community/club/3/workouts/9", "/community/club/3/workouts"],
    ["/community/club/3/meet/4", "/community/club/3"],
    ["/community/club/3/meet/4/program", "/community/club/3/meet/4"],
    ["/community/club/3", "/home/community"],
    ["/home/report/post/5", "/post/5"],
    ["/u/8", "/home"],
    ["/badges", "/profile"],
    ["/settings", "/profile"],
    ["/home", null],
    ["/today", null],
    ["/track", null],
    ["/messages", null],
  ])("%s → %s", (path, parent) => {
    expect(parentPathForPath(path)).toBe(parent);
  });
});

describe("homePathForPlatform", () => {
  it("app nativa su Oggi, sito sul Feed", () => {
    expect(homePathForPlatform(true)).toBe("/today");
    expect(homePathForPlatform(false)).toBe("/home");
  });
});

describe("isPublicPath", () => {
  it("riconosce le pagine pubbliche (fuori dalla shell)", () => {
    for (const path of [
      "/",
      "/auth",
      "/auth/callback",
      "/strava/callback",
      "/login",
      "/login/",
      "/login?next=/today",
      "/register",
      "/signup",
      "/forgot-password",
      "/reset-password",
      "/privacy",
      "/terms",
      "/cookies",
    ]) {
      expect(isPublicPath(path), path).toBe(true);
    }
  });
  it("le pagine della shell non sono pubbliche", () => {
    for (const path of ["/today", "/home", "/post/7", "/track", "/profile", "/loginx", "/privacy/x"]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
});
