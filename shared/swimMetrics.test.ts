import { describe, expect, it } from "vitest";
import {
  SWIM_METRIC_DEFINITIONS,
  SWIM_METRICS_TIMEZONE,
  addDaysToKey,
  dayKey,
  weekStartKey,
  weeklyStreak,
} from "./swimMetrics";

describe("dayKey", () => {
  it("uses the Rome calendar day, not the UTC one", () => {
    // 23:30Z on 26/10 is 00:30 on 27/10 in Rome (CET, UTC+1).
    expect(dayKey(new Date("2026-10-26T23:30:00Z"))).toBe("2026-10-27");
    expect(dayKey(new Date("2026-10-26T22:30:00Z"))).toBe("2026-10-26");
  });

  it("follows the clock change of 25/10/2026", () => {
    // Before the change Rome is UTC+2: 22:30Z on 24/10 is already 00:30 on 25/10.
    expect(dayKey(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
    expect(dayKey(new Date("2026-10-24T21:30:00Z"))).toBe("2026-10-24");
    // After the change Rome is UTC+1: 22:30Z on 25/10 is 23:30 on 25/10.
    expect(dayKey(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-25");
    expect(dayKey(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
  });

  it("accepts another time zone", () => {
    expect(dayKey(new Date("2026-10-26T23:30:00Z"), "UTC")).toBe("2026-10-26");
    expect(SWIM_METRICS_TIMEZONE).toBe("Europe/Rome");
  });
});

describe("addDaysToKey", () => {
  it("moves across months and the clock change", () => {
    expect(addDaysToKey("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDaysToKey("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("weekStartKey", () => {
  it("starts the week on Monday", () => {
    expect(weekStartKey(new Date("2026-10-26T10:00:00Z"))).toBe("2026-10-26"); // Monday
    expect(weekStartKey(new Date("2026-10-28T10:00:00Z"))).toBe("2026-10-26"); // Wednesday
    expect(weekStartKey(new Date("2026-10-25T10:00:00Z"))).toBe("2026-10-19"); // Sunday
  });

  it("uses Rome midnight between Sunday and Monday", () => {
    // Sunday 25/10 at 23:30 in Rome: still the week of 19/10.
    expect(weekStartKey(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-19");
    // 23:30Z on Sunday is 00:30 on Monday 26/10 in Rome: the new week.
    expect(weekStartKey(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
  });
});

describe("weeklyStreak", () => {
  // Wednesday 28/10/2026: the current week starts on Monday 26/10.
  const now = new Date("2026-10-28T12:00:00Z");
  const at = (iso: string) => new Date(iso);

  it("2 + 2 + 1 swims in the last 3 weeks: the current week with 1 swim does not break it", () => {
    const dates = [
      at("2026-10-12T08:00:00Z"), at("2026-10-15T08:00:00Z"), // week of 12/10: 2
      at("2026-10-19T08:00:00Z"), at("2026-10-23T08:00:00Z"), // week of 19/10: 2
      at("2026-10-27T08:00:00Z"), // current week: 1
    ];
    expect(weeklyStreak(dates, now)).toBe(2);
  });

  it("counts the current week once it has the minimum", () => {
    const dates = [
      at("2026-10-19T08:00:00Z"), at("2026-10-23T08:00:00Z"),
      at("2026-10-26T08:00:00Z"), at("2026-10-27T08:00:00Z"),
    ];
    expect(weeklyStreak(dates, now)).toBe(2);
  });

  it("a finished week under the minimum breaks the streak", () => {
    const dates = [
      at("2026-10-05T08:00:00Z"), at("2026-10-06T08:00:00Z"), // week of 5/10: 2
      at("2026-10-13T08:00:00Z"), // week of 12/10: 1
      at("2026-10-19T08:00:00Z"), at("2026-10-23T08:00:00Z"), // week of 19/10: 2
    ];
    expect(weeklyStreak(dates, now)).toBe(1);
  });

  it("is 0 without swims and accepts another minimum", () => {
    expect(weeklyStreak([], now)).toBe(0);
    expect(weeklyStreak([at("2026-10-20T08:00:00Z")], now, 1)).toBe(1);
  });
});

describe("SWIM_METRIC_DEFINITIONS", () => {
  it("defines the six metrics with a source and how to read them", () => {
    expect(Object.keys(SWIM_METRIC_DEFINITIONS).sort()).toEqual(
      ["css", "efficiency", "intensity", "load", "pacing", "volume"],
    );
    for (const definition of Object.values(SWIM_METRIC_DEFINITIONS)) {
      expect(definition.name.length).toBeGreaterThan(0);
      expect(definition.measures.length).toBeGreaterThan(0);
      expect(definition.formula.length).toBeGreaterThan(0);
      expect(definition.source.length).toBeGreaterThan(0);
      expect(definition.howToRead.length).toBeGreaterThan(0);
    }
    expect(SWIM_METRIC_DEFINITIONS.css.name).toBe("Passo soglia");
    expect(SWIM_METRIC_DEFINITIONS.css.source).toMatch(/Wakayoshi/);
    expect(SWIM_METRIC_DEFINITIONS.efficiency.source).toMatch(/Costill/);
  });
});
