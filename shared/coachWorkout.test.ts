import { describe, expect, it } from "vitest";
import { formatRestSeconds, formatSendoff, isFreestyleRep, parseRest, withSendoff } from "./coachWorkout";

describe("parseRest", () => {
  it.each([
    ["a 2:10", { kind: "sendoff", seconds: 130 }],
    ["@1:50", { kind: "sendoff", seconds: 110 }],
    ["partenza ogni 1:45", { kind: "sendoff", seconds: 105 }],
    // A clock time alone is a send-off: the safer reading, the rep is inside it.
    ["2:10", { kind: "sendoff", seconds: 130 }],
    ["rec. 1:00", { kind: "rest", seconds: 60 }],
    ["recupero 0:45", { kind: "rest", seconds: 45 }],
    ["30 sec", { kind: "rest", seconds: 30 }],
    ["20″", { kind: "rest", seconds: 20 }],
    ['20"', { kind: "rest", seconds: 20 }],
    ["20''", { kind: "rest", seconds: 20 }],
    ["20s", { kind: "rest", seconds: 20 }],
    ["90 secondi", { kind: "rest", seconds: 90 }],
    ["r20", { kind: "rest", seconds: 20 }],
    ["rec 15", { kind: "rest", seconds: 15 }],
    ["1′", { kind: "rest", seconds: 60 }],
    ["1 min", { kind: "rest", seconds: 60 }],
    ["2 minuti", { kind: "rest", seconds: 120 }],
    ["1′30″", { kind: "rest", seconds: 90 }],
    ["1'30", { kind: "rest", seconds: 90 }],
    // A range: the shorter rest.
    ["20-30s", { kind: "rest", seconds: 20 }],
    ["0-20s", { kind: "rest", seconds: 0 }],
    ["15", { kind: "rest", seconds: 15 }],
  ] as const)("«%s»", (rest, spec) => {
    expect(parseRest(rest)).toEqual(spec);
  });

  it("nothing readable: null", () => {
    expect(parseRest(undefined)).toBeNull();
    expect(parseRest("")).toBeNull();
    expect(parseRest("a piacere")).toBeNull();
  });
});

describe("rest texts", () => {
  it("formats rests and send-offs, and replaces the time of a send-off", () => {
    expect([45, 60, 90, 125].map(formatRestSeconds)).toEqual(["45″", "1′", "1′30″", "2′05″"]);
    expect(formatSendoff(150)).toBe("a 2:30");
    expect(withSendoff("partenza a 5:00", 150)).toBe("partenza a 2:30");
  });
});

describe("isFreestyleRep", () => {
  it.each([
    [{ name: "6x100", stroke: "stile libero" }, true],
    [{ name: "6x100 progressivi" }, true],
    [{ name: "6x100 con feedback" }, true],
    [{ name: "6x100", stroke: "dorso" }, false],
    [{ name: "6x100 rana" }, false],
    [{ name: "6x100 farfalla" }, false],
    [{ name: "6x100 IM" }, false],
    [{ name: "6x100 breast" }, false],
    [{ name: "6x100 con palette", stroke: "stile libero" }, false],
    [{ name: "6x100", stroke: "stile libero", equipment: "Pull buoy" }, false],
    [{ name: "6x50 gambe con tavoletta" }, false],
    [{ name: "6x100 pinne" }, false],
  ])("%o → %s", (exercise, expected) => {
    expect(isFreestyleRep(exercise)).toBe(expected);
  });
});
