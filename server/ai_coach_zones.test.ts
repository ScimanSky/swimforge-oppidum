import { beforeEach, describe, expect, it, vi } from "vitest";
import { paceZoneBoundsFromCss, paceZoneRanges, type SwimZones } from "@shared/swimMetrics";
import type { CoachWorkout } from "@shared/coachWorkout";

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock("./middleware/logger", () => ({ logger: log }));

import { finalizePoolWorkout, generateZonedPoolWorkout, parseRep } from "./ai_coach_zones";

// The owner's automatic zones (CSS 1:48.5): B2 1:48.5–1:54.2, C1 1:44.3–1:48.5.
const OWNER_ZONES: SwimZones = {
  source: "auto",
  ranges: paceZoneRanges(paceZoneBoundsFromCss(108.5)),
  bounds: paceZoneBoundsFromCss(108.5),
  autoBounds: paceZoneBoundsFromCss(108.5),
  manualUpdatedAt: null,
};

const pool = (exercises: CoachWorkout["sections"][number]["exercises"], extra: Partial<CoachWorkout> = {}): CoachWorkout => ({
  type: "pool",
  title: "Soglia e velocità",
  description: "Lavoro sulla soglia",
  duration: "60 minuti",
  difficulty: "Intermedio",
  sections: [{ title: "Serie principale", exercises }],
  coachNotes: [],
  ...extra,
});

const tenth = (value: number | null | undefined) => (value == null ? null : Math.round(value * 10) / 10);

describe("parseRep", () => {
  it.each([
    [{ name: "x", repeats: 6, repMeters: 100 }, { repeats: 6, repMeters: 100 }],
    [{ name: "x", sets: "4x", distance: "100m" }, { repeats: 4, repMeters: 100 }],
    [{ name: "x", distance: "4x50m" }, { repeats: 4, repMeters: 50 }],
    [{ name: "8×50 m forte" }, { repeats: 8, repMeters: 50 }],
    [{ name: "Nuoto facile", distance: "400m" }, { repeats: 1, repMeters: 400 }],
    [{ name: "Nuoto facile", distance: "400 m" }, { repeats: 1, repMeters: 400 }],
  ] as const)("%o", (exercise, rep) => {
    expect(parseRep(exercise)).toEqual(rep);
  });

  it("a rep without metres (dry-land, time) has none", () => {
    expect(parseRep({ name: "Plank", sets: "3x", duration: "45 sec" })).toBeNull();
  });
});

describe("finalizePoolWorkout", () => {
  it("adds the level and the target pace from the athlete's zones; recomputes the total", () => {
    const { workout, violations } = finalizePoolWorkout(
      pool([
        { name: "6x100 a soglia", repeats: 6, repMeters: 100, rest: "a 2:10", zone: "B2", stroke: "stile libero" },
        { name: "4x100 dorso", repeats: 4, repMeters: 100, zone: "B1", stroke: "dorso" },
      ], { totalMeters: 99999 }),
      OWNER_ZONES,
    );
    const [b2, back] = workout.sections[0].exercises;
    expect(b2).toMatchObject({ zone: "B2", level: "Soglia" });
    expect([tenth(b2.targetPace!.fastPace), tenth(b2.targetPace!.slowPace)]).toEqual([108.5, 114.2]);
    // The zone paces hold for freestyle: another stroke keeps zone and level as effort, no pace.
    expect(back).toMatchObject({ zone: "B1", level: "Medio", targetPace: null });
    expect(workout.totalMeters).toBe(1000);
    expect(workout.zoneSource).toBe("auto");
    expect(violations).toEqual([]);
  });

  it("splits a rep longer than the zone allows, with the same rest: 4×300 C1 becomes 8×150 C1", () => {
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

  it("zone codes: lower case is accepted, an unknown code or a missing zone is reported", () => {
    const { workout, violations } = finalizePoolWorkout(
      pool([
        { name: "a", repeats: 4, repMeters: 50, zone: "b2" as any },
        { name: "b", repeats: 4, repMeters: 50, zone: "Z4" as any },
        { name: "c", repeats: 4, repMeters: 50 },
      ]),
      OWNER_ZONES,
    );
    expect(workout.sections[0].exercises.map((e) => e.zone ?? null)).toEqual(["B2", null, null]);
    expect(violations).toEqual([
      { section: "Serie principale", exercise: "b", kind: "unknown_zone", problem: "zona «Z4» sconosciuta", fixed: false },
      { section: "Serie principale", exercise: "c", kind: "missing_zone", problem: "zona mancante", fixed: false },
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
  const ok = JSON.stringify(pool([{ name: "6x100", repeats: 6, repMeters: 100, zone: "B2" }]));
  const tooLong = JSON.stringify(pool([{ name: "4x300", repeats: 4, repMeters: 300, zone: "C1" }]));
  const unknownZone = JSON.stringify(pool([{ name: "6x100", repeats: 6, repMeters: 100, zone: "Z4" as any }]));
  const unfixable = JSON.stringify(pool([{ name: "2x210", repeats: 2, repMeters: 210, zone: "C1" }]));
  const noZone = JSON.stringify(pool([{ name: "6x100", repeats: 6, repMeters: 100 }]));

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
    expect(workout.sections[0].exercises[0]).toMatchObject({ zone: "B2", level: "Soglia" });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("a rep that can be split is fixed without asking again, and the fix is logged", async () => {
    const { generate, result } = run(tooLong);
    const workout = await result;
    expect(generate).toHaveBeenCalledTimes(1);
    expect(workout.sections[0].exercises[0]).toMatchObject({ repeats: 8, repMeters: 150 });
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
    expect(workout.sections[0].exercises[0].zone).toBe("B2");
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
    expect(workout.sections[0].exercises[0].zone).toBeUndefined();
  });

  it("an answer that is not a workout asks once more, then falls back", async () => {
    const { generate, result } = run("non è JSON", "neanche questo");
    expect((await result).title).toBe("Fallback");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("reads a workout inside a ```json block", async () => {
    const { result } = run("```json\n" + ok + "\n```");
    expect((await result).sections[0].exercises[0].zone).toBe("B2");
  });
});
