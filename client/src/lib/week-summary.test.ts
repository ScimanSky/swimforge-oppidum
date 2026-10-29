import { describe, expect, it } from "vitest";
import { startOfWeek, summarizeWeek } from "./week-summary";

const wednesday = new Date(2026, 9, 28, 18, 0);
const at = (day: number, hour = 8) =>
  new Date(2026, 9, day, hour, 0).toISOString();

describe("riepilogo settimana", () => {
  it("la settimana parte lunedì alle 00:00", () => {
    expect(startOfWeek(wednesday)).toEqual(new Date(2026, 9, 26, 0, 0, 0, 0));
    expect(startOfWeek(new Date(2026, 10, 1, 9))).toEqual(
      new Date(2026, 9, 26)
    ); // domenica 1 nov
  });
  it("somma solo le attività della settimana corrente", () => {
    const summary = summarizeWeek(
      [
        { activityDate: at(25), distanceMeters: 5000, xpEarned: 300 }, // domenica precedente
        { activityDate: at(26), distanceMeters: 3200, xpEarned: 180 },
        { activityDate: at(28, 7), distanceMeters: 2400, xpEarned: 120 },
        { activityDate: at(28, 19), distanceMeters: 1000, xpEarned: null },
      ],
      wednesday
    );
    expect(summary.totalMeters).toBe(6600);
    expect(summary.sessions).toBe(3);
    expect(summary.xp).toBe(300);
    expect(summary.days.map(day => day.label)).toEqual([
      "L",
      "M",
      "M",
      "G",
      "V",
      "S",
      "D",
    ]);
    expect(summary.days.map(day => day.meters)).toEqual([
      3200, 0, 3400, 0, 0, 0, 0,
    ]);
    expect(summary.days.findIndex(day => day.isToday)).toBe(2);
  });
  it("salta le date non valide e ignora distanze non valide", () => {
    const summary = summarizeWeek(
      [
        { activityDate: "non una data", distanceMeters: 4000, xpEarned: 50 },
        { activityDate: at(27), distanceMeters: Number.NaN, xpEarned: 40 },
        { activityDate: at(27, 18), distanceMeters: -300, xpEarned: null },
        { activityDate: at(29), distanceMeters: 1500, xpEarned: 90 },
      ],
      wednesday
    );
    expect(summary.sessions).toBe(3);
    expect(summary.xp).toBe(130);
    expect(summary.totalMeters).toBe(1500);
    expect(summary.days.map(day => day.meters)).toEqual([
      0, 0, 0, 1500, 0, 0, 0,
    ]);
    expect(summary.days.every(day => Number.isFinite(day.meters))).toBe(true);
  });
});
