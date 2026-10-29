import { describe, expect, it } from "vitest";
import {
  C3_MAX_LAP_METERS,
  INTENSITY_LEVELS,
  INTENSITY_SPLIT,
  LEVEL_ZONES,
  PACE_ZONE_BOUNDARIES,
  PACE_ZONE_BY_CODE,
  PACE_ZONE_CODES,
  PACE_ZONE_SPEED_BOUNDS,
  PACE_ZONES,
  isPaceZoneCode,
  levelMeters,
  levelRanges,
  paceZoneBoundsFromCss,
  paceZoneOf,
  paceZoneRanges,
  zoneCssOffsetSeconds,
  zoneOneLine,
  zoneRpeLabel,
} from "./paceZones";

/** «2:07.6»: minutes, seconds and tenths, as the owner's table reads. */
const tenths = (seconds: number) => {
  const total = Math.round(seconds * 10) / 10;
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total - minutes * 60).toFixed(1).padStart(4, "0")}`;
};

/** A zone range as the owner reads it: «slower than 2:07.6», «2:00.6–2:07.6», «faster than 1:44.3». */
const rangeText = (range: { fastPace: number | null; slowPace: number | null }) =>
  range.slowPace === null
    ? `slower than ${tenths(range.fastPace!)}`
    : range.fastPace === null
      ? `faster than ${tenths(range.slowPace)}`
      : `${tenths(range.fastPace)}–${tenths(range.slowPace)}`;

describe("the seven zones A1–C3", () => {
  it("go from the slowest to the most explosive, each with its level", () => {
    expect(PACE_ZONE_CODES).toEqual(["A1", "A2", "B1", "B2", "C1", "C2", "C3"]);
    expect(PACE_ZONES.map((zone) => [zone.code, zone.name, zone.level])).toEqual([
      ["A1", "Recupero attivo", "Facile"],
      ["A2", "Fondo lento", "Aerobico"],
      ["B1", "Fondo medio", "Medio"],
      ["B2", "Fondo medio-alto", "Soglia"],
      ["C1", "Soglia anaerobica", "Soglia"],
      ["C2", "Capacità anaerobica", "Sopra soglia"],
      ["C3", "Potenza anaerobica", "Sopra soglia"],
    ]);
  });

  it("carry the owner's descriptions", () => {
    expect(PACE_ZONE_BY_CODE.A1.description).toBe(
      "Recupero attivo, nuoto molto rilassato, per riscaldamento e defaticamento.",
    );
    expect(PACE_ZONE_BY_CODE.B2.description).toBe(
      "Fondo medio-alto: ti avvicini alla soglia, respiro più impegnato.",
    );
    expect(PACE_ZONE_BY_CODE.C1.description).toBe(
      "Soglia anaerobica alta, ritmo gara su distanze medio-lunghe, massimo 200 m a ripetuta.",
    );
    expect(PACE_ZONE_BY_CODE.C3.description).toBe(
      "Potenza anaerobica massimale, sprint puro, solo tratti brevissimi fino a 25 m.",
    );
    for (const zone of PACE_ZONES) {
      expect(zone.purpose.length, zone.code).toBeGreaterThan(10);
      expect(zone.breathing.length, zone.code).toBeGreaterThan(5);
      expect(zone.talkTest.length, zone.code).toBeGreaterThan(5);
    }
  });

  it("higher zone, higher effort and shorter reps: RPE convention and maximum rep distance", () => {
    expect(PACE_ZONES.map(zoneRpeLabel)).toEqual(["2–3", "3–4", "5", "6–7", "7–8", "8–9", "10"]);
    expect(PACE_ZONES.map((zone) => zone.maxRepMeters)).toEqual([null, null, null, null, 200, 150, 25]);
    expect(C3_MAX_LAP_METERS).toBe(25);
  });

  it("one line to show next to a rep", () => {
    expect(zoneOneLine("B2")).toBe(
      "B2 · Soglia: respiro impegnato, poche parole tra una vasca e l'altra; alza la soglia",
    );
    expect(zoneOneLine("C3")).toBe("C3 · Sopra soglia: sprint a tutta, non si respira quasi; velocità pura, max 25 m");
  });

  it("five levels aligned to the zones, and the split by zone letter A/B/C", () => {
    expect(INTENSITY_LEVELS).toEqual(["Facile", "Aerobico", "Medio", "Soglia", "Sopra soglia"]);
    expect(LEVEL_ZONES).toEqual({
      Facile: ["A1"],
      Aerobico: ["A2"],
      Medio: ["B1"],
      Soglia: ["B2", "C1"],
      "Sopra soglia": ["C2", "C3"],
    });
    expect(INTENSITY_SPLIT).toEqual({ A: ["A1", "A2"], B: ["B1", "B2"], C: ["C1", "C2", "C3"] });
    expect(levelMeters([100, 200, 300, 400, 500, 600, 700])).toEqual([100, 200, 300, 900, 1300]);
  });

  it("the five boundaries, each between two zones", () => {
    expect(PACE_ZONE_BOUNDARIES.map((b) => [b.key, b.slower, b.faster])).toEqual([
      ["a1a2", "A1", "A2"],
      ["a2b1", "A2", "B1"],
      ["b1b2", "B1", "B2"],
      ["b2c1", "B2", "C1"],
      ["c1c2", "C1", "C2"],
    ]);
  });

  it("recognises a zone code", () => {
    expect(isPaceZoneCode("C2")).toBe(true);
    expect(isPaceZoneCode("Z4")).toBe(false);
    expect(isPaceZoneCode("b2")).toBe(false);
    expect(isPaceZoneCode(null)).toBe(false);
  });
});

describe("zones from the threshold pace (CSS)", () => {
  it("the bounds are shares of the CSS speed, with the CSS at the B2/C1 boundary", () => {
    expect(PACE_ZONE_SPEED_BOUNDS).toEqual({ a1a2: 0.85, a2b1: 0.9, b1b2: 0.95, b2c1: 1, c1c2: 1.04 });
    expect(paceZoneBoundsFromCss(100)).toEqual({
      a1a2: 100 / 0.85,
      a2b1: 100 / 0.9,
      b1b2: 100 / 0.95,
      b2c1: 100,
      c1c2: 100 / 1.04,
    });
  });

  it("the owner's zones with CSS 1:48.5", () => {
    const ranges = paceZoneRanges(paceZoneBoundsFromCss(108.5));
    expect(ranges.map((range) => [range.code, rangeText(range)])).toEqual([
      ["A1", "slower than 2:07.6"],
      ["A2", "2:00.6–2:07.6"],
      ["B1", "1:54.2–2:00.6"],
      ["B2", "1:48.5–1:54.2"],
      ["C1", "1:44.3–1:48.5"],
      ["C2", "faster than 1:44.3"],
      ["C3", "faster than 1:44.3"],
    ]);
    expect(ranges.map((range) => [range.name, range.level, range.maxRepMeters])).toEqual([
      ["Recupero attivo", "Facile", null],
      ["Fondo lento", "Aerobico", null],
      ["Fondo medio", "Medio", null],
      ["Fondo medio-alto", "Soglia", null],
      ["Soglia anaerobica", "Soglia", 200],
      ["Capacità anaerobica", "Sopra soglia", 150],
      ["Potenza anaerobica", "Sopra soglia", 25],
    ]);
  });

  it("the five levels as paces: Soglia spans B2 and C1, Sopra soglia C2 and C3", () => {
    const levels = levelRanges(paceZoneRanges(paceZoneBoundsFromCss(108.5)));
    expect(levels.map((level) => [level.level, level.codes.join("+"), rangeText(level)])).toEqual([
      ["Facile", "A1", "slower than 2:07.6"],
      ["Aerobico", "A2", "2:00.6–2:07.6"],
      ["Medio", "B1", "1:54.2–2:00.6"],
      ["Soglia", "B2+C1", "1:44.3–1:54.2"],
      ["Sopra soglia", "C2+C3", "faster than 1:44.3"],
    ]);
  });
});

describe("paceZoneOf", () => {
  // CSS 1:40 (1 m/s): a lap's pace is 100 / speed ratio.
  const bounds = paceZoneBoundsFromCss(100);
  const at = (ratio: number, meters = 100) => paceZoneOf(100 / ratio, meters, bounds);

  it.each([
    [0.5, "A1"],
    [0.8499, "A1"],
    [0.85, "A2"], // a boundary belongs to the upper zone
    [0.8999, "A2"],
    [0.9, "B1"],
    [0.95, "B2"],
    [0.9999, "B2"],
    [1.0, "C1"],
    [1.0399, "C1"],
    [1.04, "C2"],
    [1.3, "C2"],
  ] as const)("speed ratio %s → %s", (ratio, code) => {
    expect(at(ratio)).toBe(code);
  });

  it("C3 is a sprint of at most 25 m faster than the C1/C2 boundary, never a whole 50 m length", () => {
    expect(at(1.1, 25)).toBe("C3");
    expect(at(1.04, 25)).toBe("C3");
    expect(at(1.1, 50)).toBe("C2"); // a 50, in a 25 m pool or one length of a 50 m pool
    expect(at(1.1, 22.86)).toBe("C3"); // one length of a 25 yd pool
    expect(at(1.02, 25)).toBe("C1"); // short but not faster than the boundary
  });

  it("works with manual bounds too", () => {
    const manual = { a1a2: 130, a2b1: 122, b1b2: 116, b2c1: 110, c1c2: 105 };
    expect(paceZoneOf(131, 100, manual)).toBe("A1");
    expect(paceZoneOf(130, 100, manual)).toBe("A2");
    expect(paceZoneOf(110, 100, manual)).toBe("C1");
    expect(paceZoneOf(104, 100, manual)).toBe("C2");
  });
});

describe("zoneCssOffsetSeconds (for Garmin targets: midpoint against the CSS, s/100 m)", () => {
  const bounds = paceZoneBoundsFromCss(108.5);

  it("midpoint of a closed zone minus the CSS: positive is slower", () => {
    expect(zoneCssOffsetSeconds("B2", bounds)).toBeCloseTo((108.5 + 108.5 / 0.95) / 2 - 108.5, 1); // +2.9
    expect(zoneCssOffsetSeconds("C1", bounds)).toBeCloseTo((108.5 / 1.04 + 108.5) / 2 - 108.5, 1); // −2.1
    expect(zoneCssOffsetSeconds("A2", bounds)).toBeCloseTo(15.6, 1);
  });

  it("open zones extend by their neighbour's width: A1 half an A2 slower, C2 half a C1 faster, C3 a whole C1", () => {
    const a2 = bounds.a1a2 - bounds.a2b1;
    const c1 = bounds.b2c1 - bounds.c1c2;
    expect(zoneCssOffsetSeconds("A1", bounds)).toBeCloseTo(bounds.a1a2 + a2 / 2 - 108.5, 1);
    expect(zoneCssOffsetSeconds("C2", bounds)).toBeCloseTo(bounds.c1c2 - c1 / 2 - 108.5, 1);
    expect(zoneCssOffsetSeconds("C3", bounds)).toBeCloseTo(bounds.c1c2 - c1 - 108.5, 1);
  });

  it("against another CSS when the zones are manual", () => {
    const manual = { a1a2: 130, a2b1: 122, b1b2: 116, b2c1: 110, c1c2: 105 };
    expect(zoneCssOffsetSeconds("B2", manual)).toBe(3);
    expect(zoneCssOffsetSeconds("B2", manual, 112)).toBe(1);
  });
});
