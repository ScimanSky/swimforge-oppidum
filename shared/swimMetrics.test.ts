import { describe, expect, it } from "vitest";
import {
  SWIM_METRIC_DEFINITIONS,
  SWIM_METRIC_THRESHOLDS,
  SWIM_METRICS_TIMEZONE,
  TSB_BOUNDS,
  TSB_READING_DESCRIPTIONS,
  TSB_READING_LABELS,
  addDaysToKey,
  dayKey,
  isYardPool,
  poolLengthLabel,
  pacingCvReading,
  weekStartKey,
  weeklyStreak,
  weeklyStreakFromCounts,
  bestWeeklyStreakFromCounts,
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

  it("from swims counted per Rome week (Monday keys), as the database groups them", () => {
    const counts = new Map([
      ["2026-10-12", 2],
      ["2026-10-19", 3],
      ["2026-10-26", 1],
    ]);
    expect(weeklyStreakFromCounts(counts, now)).toBe(2);
    expect(weeklyStreakFromCounts({ "2026-10-19": 2, "2026-10-26": 2 }, now)).toBe(2);
    expect(weeklyStreakFromCounts(new Map(), now)).toBe(0);
  });

  it("the best streak: the longest run of consecutive weeks with 2 swims, across the years", () => {
    const counts = new Map([
      ["2025-12-22", 2], ["2025-12-29", 2], ["2026-01-05", 2], // across new year: 3
      ["2026-01-12", 1],
      ["2026-10-19", 2], ["2026-10-26", 2], // current: 2
      ["2026-11-02", 5], // a future week is not counted
    ]);
    expect(bestWeeklyStreakFromCounts(counts, now)).toBe(3);
    expect(bestWeeklyStreakFromCounts({ "2026-10-12": 3 }, now)).toBe(1);
    expect(bestWeeklyStreakFromCounts(new Map(), now)).toBe(0);
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

  it("intensity speaks the zones A1–C3, with the bounds said as our convention approved by the owner", () => {
    const intensity = SWIM_METRIC_DEFINITIONS.intensity;
    expect(intensity.formula).toContain(
      "A1 sotto 85%, A2 85–90%, B1 90–95%, B2 95–100%, C1 100–104%, C2 sopra 104%",
    );
    expect(intensity.formula).toContain("C3: un tratto di al massimo 25 m più veloce del confine C1/C2; più lungo è C2 (anche una vasca intera da 50 m)");
    expect(intensity.formula).toContain("zona A = A1 + A2, zona B = B1 + B2, zona C = C1 + C2 + C3");
    expect(intensity.conventions).toEqual(
      expect.arrayContaining([
        "I confini delle zone sono una convenzione di SwimForge, approvata dal suo ideatore: il passo soglia è il confine tra B2 e C1. Se il tuo allenatore usa altri valori, inseriscili in «Le tue zone».",
        "Le tue zone, quando le inserisci, valgono ovunque: classificazione dei giri, questo riquadro, la soglia del carico, il coach e gli allenamenti.",
        "I cinque livelli sono allineati alle zone: Facile = A1, Aerobico = A2, Medio = B1, Soglia = B2 + C1, Sopra soglia = C2 + C3.",
        "Se la zona B (B1–B2) supera circa il 35% del volume: molto lavoro in zona B. È un'indicazione basata sugli studi, non una regola.",
        "Le zone A sono aerobiche (lavoro facile e di base, potresti parlare), le B miste (aerobico sostenuto fino a ridosso della soglia, frasi brevi), le C anaerobiche (dalla soglia in su: ripetute brevi e recuperi lunghi).",
        "Limiti di sicurezza degli allenamenti del coach (convenzione nostra): in un allenamento al massimo 1600 m in C1, 600 m in C2 e 300 m in C3; in C2 il recupero è almeno lungo quanto la ripetuta, in C3 almeno 3 volte; si comincia sempre con almeno 200 m facili in A1; il totale non supera 1,5 volte la mediana delle tue ultime 6 nuotate in vasca.",
      ]),
    );
    expect(intensity.measures).toContain("zona A (aerobica), zona B (mista) e zona C (anaerobica)");
    expect(JSON.stringify(intensity)).not.toMatch(/zona media|lavoro medio/);
    expect(JSON.stringify(intensity)).not.toMatch(/\bZ[1-5]\b/);
  });

  it("load: with manual zones their B2/C1 boundary is the threshold, CSS or not", () => {
    expect(SWIM_METRIC_DEFINITIONS.load.conventions).toContain(
      "Con le tue zone, la soglia del carico è il loro confine tra B2 e C1 (fonte: zone manuali), anche se c'è un passo soglia: le tue zone valgono ovunque.",
    );
  });
});

describe("readings shared by the interface and the coach", () => {
  it("TSB labels in Italian", () => {
    expect(TSB_READING_LABELS).toEqual({
      molto_riposato: "molto riposato",
      fresco: "fresco",
      neutro: "neutro",
      in_costruzione: "in costruzione",
      carico_alto: "carico alto",
    });
  });

  it("TSB bands follow TrainingPeaks, explicit and non-overlapping", () => {
    expect(TSB_BOUNDS).toEqual({ veryRestedAbove: 25, freshAbove: 5, neutralFrom: -10, buildingFrom: -30 });
    expect(TSB_READING_DESCRIPTIONS.molto_riposato).toBe("molto riposato (rischio di perdere forma se dura)");
    expect(TSB_READING_DESCRIPTIONS.carico_alto).toBe("carico alto");
    expect(SWIM_METRIC_DEFINITIONS.load.conventions).toEqual(
      expect.arrayContaining([
        "Equilibrio sopra +25: molto riposato (rischio di perdere forma se dura).",
        "Da +5 (escluso) a +25: fresco.",
        "Da −10 a +5: neutro.",
        "Da −30 a −10 (escluso): in costruzione.",
        "Sotto −30: carico alto.",
      ]),
    );
    expect(SWIM_METRIC_DEFINITIONS.load.conventions!.join(" ")).not.toMatch(/\+15/);
  });

  it.each([
    [1.9, "molto regolare"],
    [2, "regolare"],
    [4, "regolare"],
    [4.1, "irregolare"],
  ] as const)("CV %s%% → %s", (cv, reading) => {
    expect(pacingCvReading(cv)).toBe(reading);
  });

  it("conventional thresholds", () => {
    expect(SWIM_METRIC_THRESHOLDS).toEqual({ mediumZonePct: 35, rampPerWeek: 8, pacingFadePct: 5, dpsDropPct: 5 });
    expect(SWIM_METRIC_DEFINITIONS.pacing.name).toBe("Regolarità e tenuta nelle ripetute");
    expect(SWIM_METRIC_DEFINITIONS.pacing.source).toMatch(/Craig e Pendergast, 1979; Keskinen e Komi, 1993/);
    expect(SWIM_METRIC_DEFINITIONS.pacing.conventions).toContain(
      "Distanza per bracciata che cala più del 5% nel finale: la bracciata si accorcia nel finale (convenzione nostra).",
    );
  });
});

describe("pool lengths", () => {
  it("a 22.86 m pool is 25 yards", () => {
    expect(isYardPool(23)).toBe(true);
    expect(isYardPool(22.86)).toBe(true);
    expect(isYardPool(25)).toBe(false);
    expect(isYardPool(null)).toBe(false);
    expect(poolLengthLabel(23)).toBe("25 yd");
    expect(poolLengthLabel(25)).toBe("25 m");
    expect(poolLengthLabel(50)).toBe("50 m");
    expect(poolLengthLabel(null)).toBe("vasca non indicata");
  });
});
