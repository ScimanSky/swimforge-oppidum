import { describe, expect, it } from "vitest";
import { formatSessionDay, parseSessionDay, planFact, sessionDayKey } from "./club-workouts";

describe("club-workouts", () => {
  it("un giorno senza ora resta quel giorno, in ogni fuso", () => {
    const date = parseSessionDay("2026-10-29")!;
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 9, 29, 0]);
    expect(sessionDayKey("2026-10-29")).toBe("2026-10-29");
  });

  it("niente data o una data non valida: nessuna chiave, «—»", () => {
    for (const value of [null, undefined, "", "domani"]) {
      expect(parseSessionDay(value)).toBeNull();
      expect(sessionDayKey(value)).toBe("");
      expect(formatSessionDay(value)).toBe("—");
    }
  });

  it("giorno della settimana nell'anno in corso, l'anno per gli altri", () => {
    const now = new Date(2026, 9, 29, 12);
    expect(formatSessionDay("2026-10-29", now)).toBe("gio 29 ott");
    expect(formatSessionDay("2025-10-29", now)).toBe("29 ott 2025");
  });

  it("i dati del piano «n/d» o vuoti non si mostrano", () => {
    expect(planFact(" 2500m ")).toBe("2500m");
    for (const value of ["n/d", "N/D", "", "  ", null, undefined, 42]) expect(planFact(value)).toBeNull();
  });
});
