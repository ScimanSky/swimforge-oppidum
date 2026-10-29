import { describe, expect, it } from "vitest";
import { volumeSummary } from "./volume";

const swim = (iso: string, distanceMeters: number) => ({ date: new Date(iso), distanceMeters });

describe("volumeSummary", () => {
  // Wednesday 28/10/2026: the current week starts on Monday 26/10.
  const now = new Date("2026-10-28T12:00:00Z");
  const activities = [
    swim("2026-09-15T08:00:00Z", 4000), // week of 14/09
    swim("2026-09-28T08:00:00Z", 2000), // week of 28/09: 3 swims
    swim("2026-09-30T08:00:00Z", 2000),
    swim("2026-10-02T08:00:00Z", 2000),
    swim("2026-10-12T08:00:00Z", 2500), // week of 12/10: 2 swims
    swim("2026-10-14T08:00:00Z", 2500),
    swim("2026-10-19T08:00:00Z", 2000), // week of 19/10: 2 swims
    swim("2026-10-25T21:30:00Z", 3000), // Sunday 22:30 in Rome: still the week of 19/10
    swim("2026-10-27T08:00:00Z", 2000), // current week: 1 swim
  ];

  it("12 Monday weeks, oldest first, empty weeks included", () => {
    const { weeks } = volumeSummary(activities, now);
    expect(weeks).toHaveLength(12);
    expect(weeks[0].weekStart).toBe("2026-08-10");
    expect(weeks[11]).toEqual({ weekStart: "2026-10-26", km: 2, sessions: 1 });
    expect(weeks[10]).toEqual({ weekStart: "2026-10-19", km: 5, sessions: 2 });
    expect(weeks[8]).toEqual({ weekStart: "2026-10-05", km: 0, sessions: 0 });
    expect(weeks.reduce((sum, w) => sum + w.sessions, 0)).toBe(9);
  });

  it("averages the 4 most recent complete weeks and compares them with the 4 before", () => {
    const result = volumeSummary(activities, now);
    // 28/09 – 19/10: 6 + 0 + 5 + 5 km, 3 + 0 + 2 + 2 swims.
    expect(result.avgKm4).toBe(4);
    expect(result.avgSessions4).toBe(1.8);
    // 31/08 – 21/09: 4 km in total → 1 km a week.
    expect(result.changePct).toBe(300);
  });

  it("the current week with one swim does not break the streak", () => {
    expect(volumeSummary(activities, now).streakWeeks).toBe(2);
  });

  it("the best streak is the longest run of weeks with 2 swims over all the history", () => {
    const perWeek = new Map([
      ["2025-01-06", 2], ["2025-01-13", 3], ["2025-01-20", 2], ["2025-01-27", 2], // 4 weeks
      ["2025-02-03", 1], // breaks it
      ["2026-10-12", 2], ["2026-10-19", 2], ["2026-10-26", 1], // now: 2 weeks
    ]);
    expect(volumeSummary(activities, now, perWeek)).toMatchObject({ streakWeeks: 2, bestStreakWeeks: 4 });
    // From the dates of the activities: 28/09 (3), 12/10 (2), 19/10 (2) → best 2, as the current.
    expect(volumeSummary(activities, now)).toMatchObject({ streakWeeks: 2, bestStreakWeeks: 2 });
  });

  it("no change without previous weeks; streak from the dates given", () => {
    const result = volumeSummary([swim("2026-10-20T08:00:00Z", 1000)], now, [
      new Date("2026-10-20T08:00:00Z"),
      new Date("2026-10-21T08:00:00Z"),
    ]);
    expect(result.changePct).toBeNull();
    expect(result.avgKm4).toBe(0.25);
    expect(result.streakWeeks).toBe(1);
  });
});
