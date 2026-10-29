import { beforeEach, describe, expect, it, vi } from "vitest";
import { paceZoneBoundsFromCss, paceZoneRanges, type SwimZones } from "@shared/swimMetrics";
import type { CoachWorkout, CoachWorkoutExercise } from "@shared/coachWorkout";

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("./middleware/logger", () => ({ logger: log }));

import { finalizePoolWorkout, generateZonedPoolWorkout, parseRep } from "./ai_coach_zones";
import { readRep } from "./ai_coach_reps";

// The owner's automatic zones (CSS 1:48.5): B2 1:48.5–1:54.2, C1 1:44.3–1:48.5.
const OWNER_ZONES: SwimZones = {
  source: "auto",
  ranges: paceZoneRanges(paceZoneBoundsFromCss(108.5)),
  bounds: paceZoneBoundsFromCss(108.5),
  autoBounds: paceZoneBoundsFromCss(108.5),
  manualUpdatedAt: null,
};

const pool = (exercises: CoachWorkoutExercise[], extra: Partial<CoachWorkout> = {}): CoachWorkout => ({
  type: "pool",
  title: "Soglia e velocità",
  description: "Lavoro sulla soglia",
  duration: "60 minuti",
  difficulty: "Intermedio",
  sections: [{ title: "Serie principale", exercises }],
  coachNotes: [],
  ...extra,
});

/** The same workout with a 400 m A1 warm-up first, as the safety limits want. */
const WARMUP: CoachWorkoutExercise = { name: "400 sciolto", repeats: 1, repMeters: 400, zone: "A1", stroke: "stile libero" };
const warmed = (exercises: CoachWorkoutExercise[], extra: Partial<CoachWorkout> = {}): CoachWorkout => ({
  ...pool(exercises, extra),
  sections: [
    { title: "Riscaldamento", exercises: [WARMUP] },
    { title: "Serie principale", exercises },
  ],
});
const main = (workout: CoachWorkout) => workout.sections[workout.sections.length - 1].exercises;

const tenth = (value: number | null | undefined) => (value == null ? null : Math.round(value * 10) / 10);

describe("parseRep", () => {
  it.each([
    [{ name: "x", repeats: 6, repMeters: 100 }, { repeats: 6, repMeters: 100 }],
    [{ name: "x", sets: "4x", distance: "100m" }, { repeats: 4, repMeters: 100 }],
    [{ name: "x", distance: "4x50m" }, { repeats: 4, repMeters: 50 }],
    [{ name: "8×50 m forte" }, { repeats: 8, repMeters: 50 }],
    [{ name: "Nuoto facile", distance: "400m" }, { repeats: 1, repMeters: 400 }],
    [{ name: "Nuoto facile", distance: "400 m" }, { repeats: 1, repMeters: 400 }],
    // Sets without «x»: their first number.
    [{ name: "Serie", sets: "4", distance: "300m" }, { repeats: 4, repMeters: 300 }],
    [{ name: "Serie", sets: "4 serie", distance: "300 m" }, { repeats: 4, repMeters: 300 }],
    // Numbers where the format asks for text, and numbers as text.
    [{ name: "Serie", sets: 4, distance: 300 }, { repeats: 4, repMeters: 300 }],
    [{ name: "Serie", repeats: "6", repMeters: "100" }, { repeats: 6, repMeters: 100 }],
    // Totals: «1,5 km» is 1500 m, «2x(4x50)» 400 m, «2 serie di 4x300» 2400 m.
    [{ name: "Nuoto continuo", distance: "1,5 km" }, { repeats: 1, repMeters: 1500 }],
    [{ name: "2x(4x50) progressivi" }, { repeats: 8, repMeters: 50 }],
    [{ name: "2 serie di 4x300" }, { repeats: 8, repMeters: 300 }],
    // «400m» with «4x» is 4×400 when the name does not say otherwise.
    [{ name: "4x400 A2", sets: "4x", distance: "400m" }, { repeats: 4, repMeters: 400 }],
    [{ name: "Fondo", sets: "4x", distance: "400m" }, { repeats: 4, repMeters: 400 }],
  ] as const)("%o", (exercise, rep) => {
    expect(parseRep(exercise as Partial<CoachWorkoutExercise>)).toEqual(rep);
  });

  it("a rep without metres (dry-land, time) has none, and odd fields never throw", () => {
    expect(parseRep({ name: "Plank", sets: "3x", duration: "45 sec" })).toBeNull();
    expect(parseRep({ name: "10 minuti di nuoto libero" })).toBeNull();
    expect(() => parseRep({ name: 42, sets: null, distance: undefined, repeats: {} } as any)).not.toThrow();
    expect(parseRep({ name: 42 } as any)).toBeNull();
  });

  it("the name and the fields disagree: a conflict, and the reading with fewer metres", () => {
    expect(readRep({ name: "4x100 B2", sets: "4x", distance: "400m" })).toMatchObject({
      rep: { repeats: 4, repMeters: 100 },
      conflict: "i dettagli dicono 4×400 m, il nome dice 4×100 m",
    });
    // «400m» without sets is the total of 4×100: no conflict.
    expect(readRep({ name: "4x100 B2", distance: "400m" }).conflict).toBeNull();
    // A name with several parts is not compared.
    expect(readRep({ name: "200 stile + 100 dorso", repeats: 1, repMeters: 300 }).conflict).toBeNull();
  });
});

describe("finalizePoolWorkout", () => {
  it("adds the level as intensity and the target pace from the athlete's zones; recomputes the total", () => {
    const { workout, violations } = finalizePoolWorkout(
      pool([
        { name: "6x100 a soglia", repeats: 6, repMeters: 100, rest: "a 2:10", zone: "B2", stroke: "stile libero", intensity: "RPE 7" },
        { name: "4x100 dorso", repeats: 4, repMeters: 100, zone: "B1", stroke: "dorso" },
      ], { totalMeters: 99999 }),
      OWNER_ZONES,
    );
    const [b2, back] = workout.sections[0].exercises;
    expect(b2).toMatchObject({ zone: "B2", level: "Soglia", intensity: "Soglia" });
    expect([tenth(b2.targetPace!.fastPace), tenth(b2.targetPace!.slowPace)]).toEqual([108.5, 114.2]);
    // The zone paces hold for freestyle: another stroke keeps zone and level as effort, no pace.
    expect(back).toMatchObject({ zone: "B1", level: "Medio", intensity: "Medio", targetPace: null });
    expect(workout.totalMeters).toBe(1000);
    expect(workout.zoneSource).toBe("auto");
    expect(violations).toEqual([]);
  });

  it("splits a rep longer than the zone allows, keeping a rest: 4×300 C1 becomes 8×150 C1", () => {
    const { workout, violations } = finalizePoolWorkout(
      pool([{ name: "4x300 C1 a ritmo gara", sets: "4x", distance: "300m", rest: "30 sec", zone: "C1" }]),
      OWNER_ZONES,
    );
    expect(workout.sections[0].exercises[0]).toMatchObject({
      name: "8×150 C1 a ritmo gara",
      sets: "8x",
      distance: "150m",
      repeats: 8,
      repMeters: 150,
      rest: "30 sec",
      zone: "C1",
      level: "Soglia",
      zoneNote: "Spezzato in 8×150 m: in C1 la ripetuta più lunga è 200 m.",
    });
    expect(workout.totalMeters).toBe(1200);
    expect(violations).toEqual([
      { section: "Serie principale", exercise: "4x300 C1 a ritmo gara", kind: "distance", problem: "4×300 m oltre i 200 m di C1", fixed: true },
    ]);
  });

  it.each(["r20", "20″", "1′"])("a rest («%s») stays the same after a split", (rest) => {
    const { workout } = finalizePoolWorkout(pool([{ name: "4x300", repeats: 4, repMeters: 300, rest, zone: "C1" }]), OWNER_ZONES);
    expect(workout.sections[0].exercises[0]).toMatchObject({ repeats: 8, repMeters: 150, rest });
  });

  it("a send-off shrinks with the rep: 4×300 C1 «a 5:00» becomes 8×150 «a 2:30»", () => {
    const { workout } = finalizePoolWorkout(
      pool([{ name: "4x300 C1", repeats: 4, repMeters: 300, rest: "a 5:00", zone: "C1" }]),
      OWNER_ZONES,
    );
    expect(workout.sections[0].exercises[0]).toMatchObject({
      name: "8×150 C1",
      rest: "a 2:30",
      zoneNote: "Spezzato in 8×150 m: in C1 la ripetuta più lunga è 200 m. Ripartenza riportata ai 150 m: a 2:30.",
    });
  });

  it("a scaled send-off is rounded to 5 s: 3×200 C2 «a 3:25» becomes 6×100 «a 1:45» (102,5 s)", () => {
    const { workout } = finalizePoolWorkout(
      pool([{ name: "3x200 forte", repeats: 3, repMeters: 200, rest: "a 3:25", zone: "C2" }]),
      OWNER_ZONES,
    );
    expect(workout.sections[0].exercises[0]).toMatchObject({ name: "6×100 forte", repeats: 6, repMeters: 100, rest: "a 1:45" });
  });

  it.each([
    ["C3", 4, 50, 8, 25],
    ["C2", 3, 200, 6, 100],
    ["C1", 1, 400, 2, 200],
    ["C1", 2, 250, 10, 50], // 125 would end at the far wall: there and back (50 m) first
  ] as const)("%s %i×%i becomes %i×%i", (zone, repeats, repMeters, newRepeats, newMeters) => {
    const { workout } = finalizePoolWorkout(pool([{ name: "Serie", repeats, repMeters, zone }]), OWNER_ZONES);
    expect(workout.sections[0].exercises[0]).toMatchObject({ repeats: newRepeats, repMeters: newMeters });
  });

  it("a rep that cannot be split in whole lengths is reported, not fixed", () => {
    const { violations } = finalizePoolWorkout(pool([{ name: "2x210", repeats: 2, repMeters: 210, zone: "C1" }]), OWNER_ZONES);
    expect(violations).toEqual([
      { section: "Serie principale", exercise: "2x210", kind: "distance", problem: "2×210 m oltre i 200 m di C1", fixed: false },
    ]);
  });

  it("zone codes: lower case and a code inside a label are read, an unknown code or a missing zone is reported", () => {
    const { workout, violations } = finalizePoolWorkout(
      pool([
        { name: "a", repeats: 4, repMeters: 50, zone: "b2" as any },
        { name: "b", repeats: 4, repMeters: 50, zone: "Z4" as any },
        { name: "c", repeats: 4, repMeters: 50 },
        { name: "d", repeats: 4, repMeters: 50, zone: "B2 · Soglia" as any },
        { name: "e", repeats: 4, repMeters: 50, zone: "zona c1" as any },
      ]),
      OWNER_ZONES,
    );
    expect(workout.sections[0].exercises.map((e) => e.zone ?? null)).toEqual(["B2", null, null, "B2", "C1"]);
    expect(violations).toEqual([
      { section: "Serie principale", exercise: "b", kind: "unknown_zone", problem: "zona «Z4» sconosciuta", fixed: false },
      { section: "Serie principale", exercise: "c", kind: "missing_zone", problem: "zona mancante", fixed: false },
    ]);
  });

  it("a name that disagrees with the fields is reported and rewritten to the reading with fewer metres", () => {
    const { workout, violations } = finalizePoolWorkout(
      pool([{ name: "4x100 B2", sets: "4x", distance: "400m", zone: "B2" }]),
      OWNER_ZONES,
    );
    expect(violations).toEqual([
      {
        section: "Serie principale",
        exercise: "4x100 B2",
        kind: "rep_mismatch",
        problem: "i dettagli dicono 4×400 m, il nome dice 4×100 m: scrivi lo stesso numero di ripetute e di metri nel nome e nei campi",
        fixed: false,
      },
    ]);
    expect(workout.sections[0].exercises[0]).toMatchObject({ name: "4×100 B2", sets: "4x", distance: "100m", repeats: 4, repMeters: 100 });
    expect(workout.totalMeters).toBe(400);
  });

  it("totals from «1,5 km», «2x(4x50)» and «2 serie di 4x300»", () => {
    const { workout } = finalizePoolWorkout(
      pool([
        { name: "Nuoto continuo", distance: "1,5 km", zone: "A2" },
        { name: "2x(4x50) progressivi", zone: "B1" },
        { name: "2 serie di 4x300", zone: "A2" },
      ]),
      OWNER_ZONES,
    );
    expect(workout.totalMeters).toBe(1500 + 400 + 2400);
  });

  it.each([
    ["con palette", { name: "6x100 con palette", stroke: "stile libero" }],
    ["pull", { name: "6x100 pull", stroke: "stile libero" }],
    ["pull-buoy", { name: "6x100 con pull-buoy" }],
    ["pinne in attrezzi", { name: "6x100", stroke: "stile libero", equipment: "Pinne" }],
    ["tavoletta", { name: "6x100 tavoletta" }],
    ["gambe", { name: "6x100 gambe" }],
    ["dorso", { name: "6x100 dorso" }],
    ["back", { name: "6x100 back" }],
    ["fly", { name: "6x100 fly" }],
    ["IM", { name: "6x100 IM" }],
    ["delfino", { name: "6x100 delfino" }],
  ] as const)("no target pace when the rep says «%s»", (_label, exercise) => {
    const { workout } = finalizePoolWorkout(pool([{ ...exercise, repeats: 6, repMeters: 100, zone: "B1" }]), OWNER_ZONES);
    expect(workout.sections[0].exercises[0].targetPace).toBeNull();
  });

  it("stroke words count only as whole words: «feedback» is still freestyle", () => {
    const { workout } = finalizePoolWorkout(
      pool([{ name: "6x100 con feedback sul ritmo", repeats: 6, repMeters: 100, zone: "B1" }]),
      OWNER_ZONES,
    );
    expect(workout.sections[0].exercises[0].targetPace).not.toBeNull();
  });

  it("in a 50 m pool C3 is one length, 25 m sprint + 25 m easy; other splits end at a wall", () => {
    const { workout, violations } = finalizePoolWorkout(
      pool([
        { name: "8x25 sprint", repeats: 8, repMeters: 25, rest: "1′30″", zone: "C3" },
        { name: "6x50 veloci", repeats: 6, repMeters: 50, rest: "1′30″", zone: "C3" },
        { name: "4x300 C1", repeats: 4, repMeters: 300, zone: "C1" },
      ]),
      OWNER_ZONES,
      { poolLengthMeters: 50 },
    );
    const [eight, six, c1] = workout.sections[0].exercises;
    expect(eight).toMatchObject({
      name: "8×50 sprint (25 m sprint + 25 m facile)",
      repeats: 8,
      repMeters: 50,
      sprintMeters: 25,
      zoneNote: "In vasca da 50 m il C3 è 25 m sprint + 25 m facile: parti a tutta e finisci la vasca piano.",
    });
    expect(six).toMatchObject({ name: "6x50 veloci (25 m sprint + 25 m facile)", repeats: 6, repMeters: 50, sprintMeters: 25 });
    expect(c1).toMatchObject({ repeats: 12, repMeters: 100 });
    expect(violations.map((v) => [v.exercise, v.kind, v.fixed])).toEqual([
      ["8x25 sprint", "distance", true],
      ["4x300 C1", "distance", true],
    ]);
  });

  it("without zones (no CSS, no manual zones): level but no pace", () => {
    const none: SwimZones = { source: null, ranges: [], bounds: null, autoBounds: null, manualUpdatedAt: null };
    const { workout } = finalizePoolWorkout(pool([{ name: "6x100", repeats: 6, repMeters: 100, zone: "B1" }]), none);
    expect(workout.sections[0].exercises[0]).toMatchObject({ zone: "B1", level: "Medio", targetPace: null });
    expect(workout.zoneSource).toBeNull();
  });
});

describe("generateZonedPoolWorkout", () => {
  const FALLBACK = pool([{ name: "400 facile", repeats: 1, repMeters: 400, zone: "A1" }], { title: "Fallback" });
  const ok = JSON.stringify(warmed([{ name: "6x100", repeats: 6, repMeters: 100, zone: "B2" }]));
  const tooLong = JSON.stringify(warmed([{ name: "4x300", repeats: 4, repMeters: 300, zone: "C1" }]));
  const unknownZone = JSON.stringify(warmed([{ name: "6x100", repeats: 6, repMeters: 100, zone: "Z4" as any }]));
  const unfixable = JSON.stringify(warmed([{ name: "2x210", repeats: 2, repMeters: 210, zone: "C1" }]));
  const noZone = JSON.stringify(warmed([{ name: "6x100", repeats: 6, repMeters: 100 }]));
  const mismatch = JSON.stringify(warmed([{ name: "4x100 B2", sets: "4x", distance: "400m", zone: "B2" }]));
  const tooMuchC2 = JSON.stringify(warmed([{ name: "40x150 C2", repeats: 40, repMeters: 150, rest: "3′", zone: "C2" }]));

  beforeEach(() => vi.clearAllMocks());

  const run = (...responses: string[]) => {
    const generate = vi.fn();
    for (const response of responses) generate.mockResolvedValueOnce(response);
    return { generate, result: generateZonedPoolWorkout({ prompt: "PROMPT", generate, zones: OWNER_ZONES, fallback: FALLBACK }) };
  };

  it("a valid workout is kept as it is, with paces", async () => {
    const { generate, result } = run(ok);
    const workout = await result;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(main(workout)[0]).toMatchObject({ zone: "B2", level: "Soglia" });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("a rep that can be split is fixed without asking again, and the fix is logged", async () => {
    const { generate, result } = run(tooLong);
    const workout = await result;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(main(workout)[0]).toMatchObject({ repeats: 8, repMeters: 150 });
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("zone"),
      expect.objectContaining({ event: "ai_coach:zone_violations", attempt: 1, violations: [expect.objectContaining({ fixed: true })] }),
    );
  });

  it("an unknown zone asks once more, telling the model what was wrong", async () => {
    const { generate, result } = run(unknownZone, ok);
    const workout = await result;
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain("PROMPT");
    expect(generate.mock.calls[1][0]).toContain("zona «Z4» sconosciuta");
    expect(main(workout)[0].zone).toBe("B2");
  });

  it("a name that disagrees with the fields asks once more; the second time the safer reading is kept", async () => {
    const { generate, result } = run(mismatch, mismatch);
    const workout = await result;
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain("i dettagli dicono 4×400 m, il nome dice 4×100 m");
    expect(main(workout)[0]).toMatchObject({ name: "4×100 B2", repeats: 4, repMeters: 100 });
  });

  it("still wrong the second time: an unfixable rep falls back, a missing zone is accepted without chip", async () => {
    const twice = run(unfixable, unfixable);
    expect((await twice.result).title).toBe("Fallback");
    expect(twice.generate).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ event: "ai_coach:zone_rejected" }),
    );

    const missing = run(noZone, noZone);
    const workout = await missing.result;
    expect(workout.title).toBe("Soglia e velocità");
    expect(main(workout)[0].zone).toBeUndefined();
  });

  it("over the safety limits: asks once more with the list, then trims and says what changed", async () => {
    const { generate, result } = run(tooMuchC2, tooMuchC2);
    const workout = await result;
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain("6000 m in C2 in tutto: al massimo 600 m in un allenamento");
    expect(generate.mock.calls[1][0]).toContain("limiti di sicurezza");
    expect(main(workout)[0]).toMatchObject({
      name: "4×150 C2",
      repeats: 4,
      zoneNote: "Ridotto da 40×150 m a 4×150 m: in un allenamento al massimo 600 m in C2.",
    });
    expect(workout.totalMeters).toBe(1000);
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ event: "ai_coach:safety_trimmed" }));
  });

  it("an answer that is not a workout asks once more, then falls back", async () => {
    const { generate, result } = run("non è JSON", "neanche questo");
    expect((await result).title).toBe("Fallback");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("reads a workout inside a ```json block", async () => {
    const { result } = run("```json\n" + ok + "\n```");
    expect(main(await result)[0].zone).toBe("B2");
  });
});
