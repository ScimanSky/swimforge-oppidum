import { describe, expect, it } from "vitest";
import {
  averageChallengeProgress,
  bestChallengeProgress,
  challengeProgressParts,
  challengeProgressPercent,
  compareChallengeProgress,
  dayStreak,
} from "./challenges";

describe("challengeProgressParts", () => {
  it("formatta il progresso per obiettivo", () => {
    expect(challengeProgressParts("total_distance", 3200)).toEqual({ value: "3,2", unit: "km" });
    expect(challengeProgressParts("longest_session", 800)).toEqual({ value: "800", unit: "m" });
    expect(challengeProgressParts("total_distance", 0)).toEqual({ value: "0", unit: "km" });
    expect(challengeProgressParts("total_time", 3720)).toEqual({ value: "1:02", unit: "h" });
    expect(challengeProgressParts("total_time", null)).toEqual({ value: "0", unit: "min" });
    expect(challengeProgressParts("avg_pace", 112)).toEqual({ value: "1:52", unit: "/100 m" });
    expect(challengeProgressParts("avg_pace", 0)).toEqual({ value: "—" });
    expect(challengeProgressParts("total_sessions", 1)).toEqual({ value: "1", unit: "nuotata" });
    expect(challengeProgressParts("consistency", 12)).toEqual({ value: "12", unit: "giorni" });
    expect(challengeProgressParts("total_sessions", 1234)).toEqual({ value: "1.234", unit: "nuotate" });
  });
});

describe("progresso delle sfide: il passo migliore è il più basso", () => {
  it("miglior risultato: massimo, o il passo minimo con dati", () => {
    expect(bestChallengeProgress("total_distance", [3200, 12500, 0])).toBe(12500);
    expect(bestChallengeProgress("avg_pace", [120, 0, 98, 110])).toBe(98);
    expect(bestChallengeProgress("avg_pace", [0, 0])).toBe(0);
    expect(bestChallengeProgress("total_distance", [])).toBe(0);
  });

  it("media: per il passo solo chi ha nuotato", () => {
    expect(averageChallengeProgress("total_distance", [12500, 3200, 0])).toBeCloseTo(5233.33, 1);
    expect(averageChallengeProgress("avg_pace", [100, 120, 0])).toBe(110);
    expect(averageChallengeProgress("avg_pace", [0])).toBe(0);
  });

  it("percentuale rispetto al migliore, invertita per il passo", () => {
    expect(challengeProgressPercent("total_distance", 3200, [6400, 3200])).toBe(50);
    expect(challengeProgressPercent("total_distance", 0, [0])).toBe(0);
    expect(challengeProgressPercent("avg_pace", 100, [100, 125])).toBe(100);
    expect(challengeProgressPercent("avg_pace", 125, [100, 125])).toBe(80);
    expect(challengeProgressPercent("avg_pace", 0, [100])).toBe(0);
  });

  it("ordine: migliore prima, per il passo crescente con chi non ha dati in fondo", () => {
    expect([3, 0, 9].sort(compareChallengeProgress("total_sessions"))).toEqual([9, 3, 0]);
    expect([120, 0, 98].sort(compareChallengeProgress("avg_pace"))).toEqual([98, 120, 0]);
  });
});

describe("dayStreak", () => {
  it("giorni di fila fino a oggi, contati sui giorni locali", () => {
    const now = new Date(2026, 9, 29, 10, 0);
    const days = [
      new Date(2026, 9, 29, 0, 30), // just after local midnight: still today
      new Date(2026, 9, 28, 23, 45),
      new Date(2026, 9, 27, 7, 0),
      new Date(2026, 9, 25, 7, 0),
    ];
    expect(dayStreak(days, now)).toBe(3);
  });
  it("zero se oggi non si è nuotato", () => {
    expect(dayStreak([new Date(2026, 9, 28, 9)], new Date(2026, 9, 29, 10))).toBe(0);
    expect(dayStreak([], new Date())).toBe(0);
  });
});
