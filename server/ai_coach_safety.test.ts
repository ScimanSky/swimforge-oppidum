import { describe, expect, it } from "vitest";
import { paceZoneBoundsFromCss, paceZoneRanges, type SwimZones } from "@shared/swimMetrics";
import type { CoachWorkout, CoachWorkoutExercise } from "@shared/coachWorkout";
import { finalizePoolWorkout } from "./ai_coach_zones";
import {
  checkSafety,
  enforceSafety,
  minRestSeconds,
  poolHistoryOf,
  safetyRulesText,
  totalCapMeters,
  type PoolHistory,
  type SafetyContext,
} from "./ai_coach_safety";

// The owner's automatic zones (CSS 1:48.5): C1/C2 boundary 108.5 / 1.04 = 104.33 s/100 m.
const OWNER_ZONES: SwimZones = {
  source: "auto",
  ranges: paceZoneRanges(paceZoneBoundsFromCss(108.5)),
  bounds: paceZoneBoundsFromCss(108.5),
  autoBounds: paceZoneBoundsFromCss(108.5),
  manualUpdatedAt: null,
};
const OWNER: SafetyContext = { zones: OWNER_ZONES, history: null };

const WARMUP: CoachWorkoutExercise = { name: "400 sciolto", repeats: 1, repMeters: 400, zone: "A1" };

/** A finalized workout: warm-up section (unless `warmup` is false) and the main set. */
function workout(exercises: CoachWorkoutExercise[], warmup = true): CoachWorkout {
  return finalizePoolWorkout(
    {
      type: "pool",
      title: "Prova",
      description: "",
      duration: "60 minuti",
      difficulty: "Intermedio",
      sections: [
        ...(warmup ? [{ title: "Riscaldamento", exercises: [WARMUP] }] : []),
        { title: "Serie principale", exercises },
      ],
      coachNotes: ["Nota del coach"],
    },
    OWNER_ZONES,
  ).workout;
}
const main = (w: CoachWorkout) => w.sections[w.sections.length - 1].exercises;

describe("poolHistoryOf", () => {
  it("median of the last 6 pool swims (open water left out) and the most frequent pool length", () => {
    const swims = [
      { distanceMeters: 1000, isOpenWater: false, poolLengthMeters: 25 },
      { distanceMeters: 3000, isOpenWater: true, poolLengthMeters: null },
      { distanceMeters: 1200, isOpenWater: false, poolLengthMeters: 50 },
      { distanceMeters: 1100, isOpenWater: false, poolLengthMeters: 25 },
      { distanceMeters: 900, isOpenWater: false, poolLengthMeters: 25 },
      { distanceMeters: 1000, isOpenWater: false, poolLengthMeters: 50 },
      { distanceMeters: 1300, isOpenWater: false, poolLengthMeters: 25 },
      { distanceMeters: 5000, isOpenWater: false, poolLengthMeters: 25 }, // the 7th pool swim: out
    ];
    // 900, 1000, 1000, 1100, 1200, 1300 → (1000 + 1100) / 2.
    expect(poolHistoryOf(swims)).toEqual({ medianMeters: 1050, swims: 6, usualPoolLengthMeters: 25 });
    expect(totalCapMeters(poolHistoryOf(swims))).toBe(1575);
  });

  it("a tie between pool lengths goes to the most recent; no pool swims, no cap", () => {
    const tie = [
      { distanceMeters: 1000, poolLengthMeters: 50 },
      { distanceMeters: 1000, poolLengthMeters: 25 },
    ];
    expect(poolHistoryOf(tie).usualPoolLengthMeters).toBe(50);
    const none = poolHistoryOf([{ distanceMeters: 2000, isOpenWater: true }]);
    expect(none).toEqual({ medianMeters: null, swims: 0, usualPoolLengthMeters: null });
    expect(totalCapMeters(none)).toBeNull();
  });
});

describe("minRestSeconds", () => {
  it("C2: as long as the rep at the C1/C2 pace; C3: three times; other zones: none", () => {
    // 150 m at 104.33 s/100 m = 156.5 s → 160 s; 25 m = 26.1 s × 3 = 78.2 s → 80 s.
    expect(minRestSeconds("C2", { name: "", repMeters: 150 }, OWNER)).toBe(160);
    expect(minRestSeconds("C3", { name: "", repMeters: 25 }, OWNER)).toBe(80);
    expect(minRestSeconds("C1", { name: "", repMeters: 200 }, OWNER)).toBeNull();
    // Without zones: 2:30/100 m, slow on purpose; 50 m = 75 s.
    expect(minRestSeconds("C2", { name: "", repMeters: 50 }, { zones: null, history: null })).toBe(75);
  });
});

describe("checkSafety and enforceSafety", () => {
  it("40×150 C2: 6000 m over the 600 m of a session, trimmed to 4×150", () => {
    const w = workout([{ name: "40x150 C2", repeats: 40, repMeters: 150, rest: "3′", zone: "C2" }]);
    expect(checkSafety(w, OWNER)).toEqual([
      {
        section: "Allenamento",
        exercise: "C2",
        kind: "safety_volume",
        problem: "6000 m in C2 in tutto: al massimo 600 m in un allenamento",
        fixed: false,
      },
    ]);
    const { workout: trimmed } = enforceSafety(w, OWNER);
    expect(main(trimmed)[0]).toMatchObject({
      name: "4×150 C2",
      repeats: 4,
      repMeters: 150,
      zoneNote: "Ridotto da 40×150 m a 4×150 m: in un allenamento al massimo 600 m in C2.",
    });
    expect(trimmed.totalMeters).toBe(1000);
    expect(trimmed.coachNotes).toEqual([
      "Allenamento adattato ai limiti di sicurezza di SwimForge: sotto ogni serie cambiata trovi cosa è cambiato e perché.",
      "Nota del coach",
    ]);
    expect(checkSafety(trimmed, OWNER)).toEqual([]);
  });

  it("20×25 C3 «a 0:20»: too many metres and no rest; trimmed to 12×25 «a 1:50»", () => {
    const w = workout([{ name: "20x25 sprint", repeats: 20, repMeters: 25, rest: "a 0:20", zone: "C3" }]);
    expect(checkSafety(w, OWNER).map((v) => v.problem)).toEqual([
      "500 m in C3 in tutto: al massimo 300 m in un allenamento",
      // 25 m at 104.33 s/100 m = 26.1 s: a 0:20 leaves nothing.
      "la ripartenza «a 0:20» lascia circa 0″ di recupero: serve almeno 1′20″ (in C3 il recupero è almeno 3 volte la ripetuta)",
    ]);
    const { workout: trimmed } = enforceSafety(w, OWNER);
    // 26.1 s + 80 s = 106.1 s → a 1:50, which leaves 83.9 s ≈ 1′25″.
    expect(main(trimmed)[0]).toMatchObject({
      name: "12×25 sprint",
      repeats: 12,
      rest: "a 1:50",
      zoneNote:
        "Ridotto da 20×25 m a 12×25 m: in un allenamento al massimo 300 m in C3. Ripartenza portata a 1:50, circa 1′25″ di recupero: in C3 il recupero è almeno 3 volte la ripetuta.",
    });
    expect(checkSafety(trimmed, OWNER)).toEqual([]);
  });

  it("a C2 rest too short is lengthened; a missing rest is set", () => {
    const w = workout([
      { name: "4x100 C2", repeats: 4, repMeters: 100, rest: "20″", zone: "C2" },
      { name: "4x50 C2", repeats: 4, repMeters: 50, zone: "C2" },
    ]);
    const { workout: trimmed } = enforceSafety(w, OWNER);
    // 100 m = 104.3 s → 1′45″; 50 m = 52.2 s → 55″.
    expect(main(trimmed).map((e) => [e.rest, e.zoneNote])).toEqual([
      ["1′45″", "Recupero portato a 1′45″: in C2 il recupero è almeno lungo quanto la ripetuta."],
      ["55″", "Recupero fissato a 55″: in C2 il recupero è almeno lungo quanto la ripetuta."],
    ]);
  });

  it("no warm-up: 200 m easy in A1 added first, with the A1 pace", () => {
    const w = workout([{ name: "6x100 B2", repeats: 6, repMeters: 100, rest: "a 2:10", zone: "B2" }], false);
    expect(checkSafety(w, OWNER)).toEqual([
      {
        section: "Serie principale",
        exercise: "Riscaldamento",
        kind: "safety_warmup",
        problem: "0 m facili in A1 all'inizio: servono almeno 200 m di riscaldamento in A1",
        fixed: false,
      },
    ]);
    const { workout: trimmed } = enforceSafety(w, OWNER);
    expect(trimmed.sections.map((s) => s.title)).toEqual(["Riscaldamento", "Serie principale"]);
    expect(trimmed.sections[0].exercises[0]).toMatchObject({
      name: "200 stile libero sciolto",
      repeats: 1,
      repMeters: 200,
      zone: "A1",
      level: "Facile",
      zoneNote: "Aggiunto: ogni allenamento comincia con almeno 200 m facili in A1, per scaldarti.",
    });
    expect(trimmed.sections[0].exercises[0].targetPace?.slowPace).toBeNull();
    expect(Math.round(trimmed.sections[0].exercises[0].targetPace!.fastPace! * 10) / 10).toBe(127.6);
    expect(trimmed.totalMeters).toBe(800);
  });

  it("a short warm-up is completed to 200 m (rounded up to 50 m)", () => {
    const w = finalizePoolWorkout(
      {
        type: "pool", title: "Prova", description: "", duration: "", difficulty: "", coachNotes: [],
        sections: [{ title: "Riscaldamento", exercises: [{ name: "50 sciolto", repeats: 1, repMeters: 50, zone: "A1" }] }],
      },
      OWNER_ZONES,
    ).workout;
    const { workout: trimmed } = enforceSafety(w, OWNER);
    expect(trimmed.sections[0].exercises.map((e) => [e.name, e.repMeters])).toEqual([
      ["150 stile libero sciolto", 150],
      ["50 sciolto", 50],
    ]);
  });

  it("over 1,5 × the median of the last pool swims: the hardest sets lose reps first", () => {
    // Median 1000 m → at most 1500 m.
    const history: PoolHistory = { medianMeters: 1000, swims: 3, usualPoolLengthMeters: 25 };
    const ctx: SafetyContext = { zones: OWNER_ZONES, history };
    const w = workout([
      { name: "6x100 B2", repeats: 6, repMeters: 100, rest: "a 2:10", zone: "B2" },
      { name: "4x50 forte", repeats: 4, repMeters: 50, rest: "1′", zone: "C2" },
      { name: "400 fondo", repeats: 1, repMeters: 400, zone: "A2" },
      { name: "200 sciolto", repeats: 1, repMeters: 200, zone: "A1" },
    ]);
    expect(w.totalMeters).toBe(1800);
    expect(checkSafety(w, ctx)).toEqual([
      {
        section: "Allenamento",
        exercise: "Totale",
        kind: "safety_total",
        problem: "1800 m in tutto: al massimo 1500 m, 1,5 volte la mediana delle tue ultime 3 nuotate in vasca (1000 m)",
        fixed: false,
      },
    ]);
    const { workout: trimmed } = enforceSafety(w, ctx);
    // C2 first: 4×50 down to nothing (1600 m), then B2: 6×100 → 5×100 (1500 m).
    expect(main(trimmed).map((e) => e.name)).toEqual(["5×100 B2", "400 fondo", "200 sciolto"]);
    expect(main(trimmed)[0].zoneNote).toBe(
      "Ridotto da 6×100 m a 5×100 m: il totale resta entro 1500 m, 1,5 volte la mediana delle tue ultime 3 nuotate in vasca (1000 m).",
    );
    expect(trimmed.coachNotes).toContain(
      "Tolta la serie «4x50 forte» (4×50 m): il totale resta entro 1500 m, 1,5 volte la mediana delle tue ultime 3 nuotate in vasca (1000 m).",
    );
    expect(trimmed.totalMeters).toBe(1500);
    expect(checkSafety(trimmed, ctx)).toEqual([]);
  });

  it("without pool swims there is no cap on the total", () => {
    const w = workout([{ name: "10x400 A2", repeats: 10, repMeters: 400, rest: "30″", zone: "A2" }]);
    expect(checkSafety(w, OWNER)).toEqual([]);
  });

  it("C3 in a 50 m pool counts its 25 m sprints and rests on the sprint", () => {
    const w = finalizePoolWorkout(
      {
        type: "pool", title: "Prova", description: "", duration: "", difficulty: "", coachNotes: [],
        sections: [
          { title: "Riscaldamento", exercises: [WARMUP] },
          { title: "Velocità", exercises: [{ name: "10x50 sprint", repeats: 10, repMeters: 50, rest: "1′30″", zone: "C3" }] },
        ],
      },
      OWNER_ZONES,
      { poolLengthMeters: 50 },
    ).workout;
    // 10 × 25 m = 250 m of sprint (≤ 300); rest 90 s ≥ 3 × 26.1 s.
    expect(checkSafety(w, OWNER)).toEqual([]);
  });

  it("the rules for the model say the limits and the athlete's own total", () => {
    expect(safetyRulesText({ medianMeters: 1600, swims: 6, usualPoolLengthMeters: 25 })).toContain(
      "al massimo 1600 m in C1, 600 m in C2 e 300 m in C3; in C2 il recupero è almeno lungo quanto la ripetuta e in C3 almeno 3 volte",
    );
    expect(safetyRulesText({ medianMeters: 1600, swims: 6, usualPoolLengthMeters: 25 })).toContain(
      "il totale non supera 2400 m, 1,5 volte la mediana delle tue ultime 6 nuotate in vasca (1600 m)",
    );
    expect(safetyRulesText(null)).toContain("almeno 200 m facili in A1");
  });
});
