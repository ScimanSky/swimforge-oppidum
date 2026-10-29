// Swims are grouped by Rome calendar weeks: pin a timezone east of UTC, where local midnight is
// the previous day in UTC. Node applies TZ at runtime.
process.env.TZ = "Europe/Rome";

import { describe, expect, it } from "vitest";
import {
  activityDays,
  getActivityAvgSwolf,
  getStreaks,
  localDayKey,
  primaryStrokeLabel,
} from "./profile-stats";

/** Local date in October 2026 (26 = Monday). */
const oct = (day: number, hour = 10, minute = 0) => new Date(2026, 9, day, hour, minute);

describe("profile stats (Europe/Rome)", () => {
  it("the timezone is applied", () => {
    expect(oct(26, 0, 30).getTimezoneOffset()).toBe(-60);
  });

  it("SWOLF from a number or a numeric string, camelCase or snake_case; 0 otherwise", () => {
    expect(getActivityAvgSwolf({ avgSwolf: 38 })).toBe(38);
    expect(getActivityAvgSwolf({ avg_swolf: "41" })).toBe(41);
    expect(getActivityAvgSwolf({ avgSwolf: "" })).toBe(0);
    expect(getActivityAvgSwolf({ avgSwolf: null })).toBe(0);
    expect(getActivityAvgSwolf({})).toBe(0);
  });

  it("local day keys, also just after midnight", () => {
    expect(localDayKey(oct(26, 0, 30))).toBe("2026-10-26");
    expect(localDayKey(oct(26, 23, 30))).toBe("2026-10-26");
  });

  it("weeks with at least two swims make the streak, counted in weeks", () => {
    // Weeks of 12 and 19 October with two swims each; the current week (26) has none yet.
    const swims = [oct(13), oct(15), oct(19), oct(22)];
    expect(getStreaks(swims, oct(28, 18))).toEqual({ current: 2, best: 2 });
  });

  it("the current week counts once it has two swims; with one it does not break the streak", () => {
    const twoWeeks = [oct(13), oct(15), oct(19), oct(22)];
    expect(getStreaks([...twoWeeks, oct(26)], oct(28, 18))).toEqual({ current: 2, best: 2 });
    expect(getStreaks([...twoWeeks, oct(26), oct(28, 7)], oct(28, 18))).toEqual({ current: 3, best: 3 });
  });

  it("a week with a single swim breaks the streak; the best run is kept", () => {
    // Weeks of 5 and 12 October with two swims, 19 October with one, 26 October with two.
    const swims = [oct(5), oct(7), oct(12), oct(14), oct(21), oct(26), oct(27)];
    expect(getStreaks(swims, oct(28, 18))).toEqual({ current: 1, best: 2 });
  });

  it("Sunday 23:30 belongs to its own week, Monday 00:30 to the next", () => {
    const now = oct(28, 18); // Wednesday, no swims this week yet
    expect(getStreaks([oct(19), oct(25, 23, 30)], now)).toEqual({ current: 1, best: 1 });
    expect(getStreaks([oct(19), oct(26, 0, 30)], now)).toEqual({ current: 0, best: 0 });
  });

  it("no swims, no streak", () => {
    expect(getStreaks([], oct(28))).toEqual({ current: 0, best: 0 });
  });

  it("activity days from the date fields, skipping invalid ones", () => {
    const days = activityDays([
      { activityDate: "2026-10-26 23:30:00" },
      { activity_date: oct(28) },
      { createdAt: "not a date" },
      {},
    ]);
    expect(days.map(localDayKey)).toEqual(["2026-10-26", "2026-10-28"]);
  });

  it("primary stroke: the most frequent known one, null when unknown", () => {
    expect(
      primaryStrokeLabel([{ strokeType: "backstroke" }, { stroke_type: "backstroke" }, { strokeType: "freestyle" }])
    ).toBe("Dorso");
    expect(primaryStrokeLabel([{}])).toBe("Misti");
    expect(primaryStrokeLabel([{ strokeType: "doggy" }])).toBeNull();
    expect(primaryStrokeLabel([])).toBeNull();
  });
});
