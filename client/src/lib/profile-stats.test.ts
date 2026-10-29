// Training days and swims must be compared as local calendar days: pin a timezone east of UTC,
// where local midnight is the previous day in UTC. Node applies TZ at runtime.
process.env.TZ = "Europe/Rome";

import { describe, expect, it } from "vitest";
import { activityDays, getStreaks, localDayKey } from "./profile-stats";

/** Local date in October 2026 (26 = Monday). */
const oct = (day: number, hour = 10, minute = 0) => new Date(2026, 9, day, hour, minute);

describe("profile stats (Europe/Rome)", () => {
  it("the timezone is applied", () => {
    expect(oct(26, 0, 30).getTimezoneOffset()).toBe(-60);
  });

  it("local day keys, also just after midnight", () => {
    expect(localDayKey(oct(26, 0, 30))).toBe("2026-10-26");
    expect(localDayKey(oct(26, 23, 30))).toBe("2026-10-26");
  });

  it("Monday, Wednesday and Friday swims make the streak", () => {
    const now = oct(28, 18);
    expect(getStreaks([oct(23), oct(26), oct(28, 7)], now)).toEqual({ current: 3, best: 3 });
  });

  it("a Monday swim at 23:30 and at 00:30 counts for Monday", () => {
    const now = oct(27, 12); // Tuesday
    expect(getStreaks([oct(26, 23, 30)], now)).toEqual({ current: 1, best: 1 });
    expect(getStreaks([oct(26, 0, 30)], now)).toEqual({ current: 1, best: 1 });
  });

  it("a Tuesday swim is not a training day", () => {
    expect(getStreaks([oct(27)], oct(28, 18))).toEqual({ current: 0, best: 0 });
  });

  it("today's training day not swum yet does not break the streak", () => {
    expect(getStreaks([oct(23), oct(26)], oct(28, 18))).toEqual({ current: 2, best: 2 });
  });

  it("current vs best: a missed Wednesday resets the current streak", () => {
    const swims = [oct(5), oct(7), oct(9), oct(19), oct(23), oct(26)];
    expect(getStreaks(swims, oct(27, 12))).toEqual({ current: 2, best: 3 });
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
});
