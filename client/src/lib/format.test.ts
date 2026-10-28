import { describe, expect, it } from "vitest";
import {
  formatDayMonth,
  formatDistance,
  formatDurationParts,
  formatInteger,
  formatKm,
  formatPaceValue,
  formatSessionDate,
  formatWeekdayDayMonth,
  paceSecondsPer100m,
} from "./format";

const monday = new Date(2026, 9, 26, 10, 47); // lun 26 ott 2026, ora locale

describe("formatter Corsia", () => {
  it("data sessione", () =>
    expect(formatSessionDate(monday)).toBe("lun 26 ott · 10:47"));
  it("giorno e mese", () => expect(formatDayMonth(monday)).toBe("26 ott"));
  it("giorno della settimana, giorno e mese", () =>
    expect(formatWeekdayDayMonth(monday)).toBe("lun 26 ott"));
  it("accetta stringhe ISO", () =>
    expect(formatDayMonth(monday.toISOString())).toBe("26 ott"));
  it("km con virgola", () => {
    expect(formatKm(3200)).toBe("3,2");
    expect(formatKm(12_700)).toBe("12,7");
    expect(formatKm(0)).toBe("0");
  });
  it("distanza con virgola", () => {
    expect(formatDistance(3200)).toBe("3,2 km");
    expect(formatDistance(800)).toBe("800 m");
  });
  it("durata in parti", () => {
    expect(formatDurationParts(3720)).toEqual({ value: "1:02", unit: "h" });
    expect(formatDurationParts(3000)).toEqual({ value: "50", unit: "min" });
    expect(formatDurationParts(0)).toBeNull();
  });
  it("passo", () => {
    expect(formatPaceValue(112)).toBe("1:52");
    expect(
      paceSecondsPer100m({
        avgPacePer100m: 112,
        distanceMeters: 1000,
        durationSeconds: 1300,
      })
    ).toBe(112);
    expect(
      paceSecondsPer100m({
        avgPacePer100m: null,
        distanceMeters: 1000,
        durationSeconds: 1300,
      })
    ).toBe(130);
    expect(
      paceSecondsPer100m({ distanceMeters: 0, durationSeconds: 100 })
    ).toBeNull();
  });

  it("date non valide: «—» senza errori", () => {
    expect(formatSessionDate(null)).toBe("—");
    expect(formatSessionDate("non una data")).toBe("—");
    expect(formatDayMonth(undefined)).toBe("—");
    expect(formatDayMonth(new Date(Number.NaN))).toBe("—");
    expect(formatWeekdayDayMonth("")).toBe("—");
  });
  it("distanza: km o m dopo l'arrotondamento, «—» senza dato valido", () => {
    expect(formatDistance(999.6)).toBe("1 km");
    expect(formatDistance(999.4)).toBe("999 m");
    expect(formatDistance(1000)).toBe("1 km");
    expect(formatDistance(0)).toBe("—");
    expect(formatDistance(-50)).toBe("—");
    expect(formatDistance(Number.NaN)).toBe("—");
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatDistance(null)).toBe("—");
  });
  it("durata: mai «0 min», null se non finita", () => {
    expect(formatDurationParts(1)).toEqual({ value: "1", unit: "min" });
    expect(formatDurationParts(29)).toEqual({ value: "1", unit: "min" });
    expect(formatDurationParts(90)).toEqual({ value: "2", unit: "min" });
    expect(formatDurationParts(Number.NaN)).toBeNull();
    expect(formatDurationParts(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatDurationParts(-60)).toBeNull();
  });
  it("passo: «—» se non finito o non positivo", () => {
    expect(formatPaceValue(0)).toBe("—");
    expect(formatPaceValue(-10)).toBe("—");
    expect(formatPaceValue(Number.NaN)).toBe("—");
    expect(formatPaceValue(Number.POSITIVE_INFINITY)).toBe("—");
  });
  it("separatore delle migliaia sempre presente", () => {
    expect(formatInteger(8420)).toBe("8.420");
    expect(formatInteger(580)).toBe("580");
    expect(formatInteger(1_234_567)).toBe("1.234.567");
    expect(formatKm(1_234_500)).toBe("1.234,5");
  });
});
