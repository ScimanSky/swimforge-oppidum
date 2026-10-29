/**
 * The Italian pace zones A1–C3 the owner trains with, from the slowest to the most explosive,
 * and the five plain-language levels aligned to them. One text for the interface, the coach and
 * the generated workouts. The bounds are shares of the threshold pace (CSS) speed: a SwimForge
 * convention approved by the owner, with the CSS at the B2/C1 boundary. A user can replace them
 * with manual bounds («Le tue zone»).
 */

export const PACE_ZONE_CODES = ["A1", "A2", "B1", "B2", "C1", "C2", "C3"] as const;
export type PaceZoneCode = (typeof PACE_ZONE_CODES)[number];

/** Metres in A1..C3. */
export type Zones7 = [number, number, number, number, number, number, number];

export const INTENSITY_LEVELS = ["Facile", "Aerobico", "Medio", "Soglia", "Sopra soglia"] as const;
export type IntensityLevel = (typeof INTENSITY_LEVELS)[number];

export const PACE_ZONE_BOUNDARY_KEYS = ["a1a2", "a2b1", "b1b2", "b2c1", "c1c2"] as const;
export type PaceZoneBoundaryKey = (typeof PACE_ZONE_BOUNDARY_KEYS)[number];
/**
 * The five boundaries in seconds per 100 m, from the slowest to the fastest (strictly
 * decreasing). A pace equal to a boundary belongs to the faster zone.
 */
export type PaceZoneBounds = Record<PaceZoneBoundaryKey, number>;

/** A boundary pace must be within these, seconds per 100 m (1:00–4:00). */
export const PACE_ZONE_PACE_LIMITS = { min: 60, max: 240 } as const;

/** Five finite paces within the limits, each faster than the previous one. */
export function arePaceZoneBoundsValid(bounds: unknown): bounds is PaceZoneBounds {
  if (typeof bounds !== "object" || bounds === null) return false;
  const values = PACE_ZONE_BOUNDARY_KEYS.map((key) => (bounds as Record<string, unknown>)[key]);
  return values.every(
    (value, index) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= PACE_ZONE_PACE_LIMITS.min &&
      value <= PACE_ZONE_PACE_LIMITS.max &&
      (index === 0 || value < (values[index - 1] as number)),
  );
}

/** Each boundary and the two zones it separates. */
export const PACE_ZONE_BOUNDARIES: readonly { key: PaceZoneBoundaryKey; slower: PaceZoneCode; faster: PaceZoneCode }[] = [
  { key: "a1a2", slower: "A1", faster: "A2" },
  { key: "a2b1", slower: "A2", faster: "B1" },
  { key: "b1b2", slower: "B1", faster: "B2" },
  { key: "b2c1", slower: "B2", faster: "C1" },
  { key: "c1c2", slower: "C1", faster: "C2" },
];

/**
 * The boundaries as a share of the CSS speed (A1 < 85% ≤ A2 < 90% ≤ B1 < 95% ≤ B2 < 100% ≤ C1 <
 * 104% ≤ C2): our convention, approved by the owner. C3 is defined by distance, not by pace.
 */
export const PACE_ZONE_SPEED_BOUNDS: PaceZoneBounds = { a1a2: 0.85, a2b1: 0.9, b1b2: 0.95, b2c1: 1, c1c2: 1.04 };

/** An active lap this long or shorter (or one pool length) faster than the C1/C2 boundary is C3. */
export const C3_MAX_LAP_METERS = 25;

export type PaceZoneDefinition = {
  code: PaceZoneCode;
  name: string;
  /** The owner's definition. */
  description: string;
  /** What it trains. */
  purpose: string;
  breathing: string;
  /** How much you could talk between two lengths. */
  talkTest: string;
  /** Perceived effort on a 1–10 scale (our convention). */
  rpe: { min: number; max: number };
  /** Longest rep the zone allows; null when there is no limit. */
  maxRepMeters: number | null;
  level: IntensityLevel;
  /** Sensation and purpose in a few words, shown next to a rep after «B2 · Soglia:». */
  explanation: string;
};

export const PACE_ZONES: readonly PaceZoneDefinition[] = [
  {
    code: "A1",
    name: "Recupero attivo",
    description: "Recupero attivo, nuoto molto rilassato, per riscaldamento e defaticamento.",
    purpose: "Scalda, fa recuperare tra le serie e scioglie a fine allenamento; è il ritmo giusto per curare la tecnica.",
    breathing: "respiro tranquillo, quasi come a riposo",
    talkTest: "potresti parlare normalmente",
    rpe: { min: 2, max: 3 },
    maxRepMeters: null,
    level: "Facile",
    explanation: "nuoto sciolto, potresti parlare normalmente; scalda e fa recuperare",
  },
  {
    code: "A2",
    name: "Fondo lento",
    description: "Fondo lento: costruisce resistenza aerobica di base, sensazione confortevole.",
    purpose: "Costruisce la base aerobica: abitua cuore e muscoli a lavorare a lungo spendendo poco.",
    breathing: "respiro regolare e comodo",
    talkTest: "riesci a dire una frase intera tra una vasca e l'altra",
    rpe: { min: 3, max: 4 },
    maxRepMeters: null,
    level: "Aerobico",
    explanation: "ritmo comodo, frasi intere tra una vasca e l'altra; costruisce la base",
  },
  {
    code: "B1",
    name: "Fondo medio",
    description: "Fondo medio: lavoro aerobico più sostenuto ma ancora gestibile.",
    purpose: "Allunga la resistenza aerobica: tieni un ritmo più sostenuto per più tempo.",
    breathing: "respiro più profondo e frequente",
    talkTest: "riesci a dire frasi brevi",
    rpe: { min: 5, max: 5 },
    maxRepMeters: null,
    level: "Medio",
    explanation: "ritmo sostenuto, solo frasi brevi; allunga la resistenza",
  },
  {
    code: "B2",
    name: "Fondo medio-alto",
    description: "Fondo medio-alto: ti avvicini alla soglia, respiro più impegnato.",
    purpose: "Alza la soglia: sposta più in alto il ritmo che riesci a tenere a lungo.",
    breathing: "respiro impegnato",
    talkTest: "poche parole tra una vasca e l'altra",
    rpe: { min: 6, max: 7 },
    maxRepMeters: null,
    level: "Soglia",
    explanation: "respiro impegnato, poche parole tra una vasca e l'altra; alza la soglia",
  },
  {
    code: "C1",
    name: "Soglia anaerobica",
    description: "Soglia anaerobica alta, ritmo gara su distanze medio-lunghe, massimo 200 m a ripetuta.",
    purpose: "Abitua al ritmo gara su distanze medio-lunghe e spinge in alto il passo soglia.",
    breathing: "respiro affannoso ma ancora controllato",
    talkTest: "una parola o due",
    rpe: { min: 7, max: 8 },
    maxRepMeters: 200,
    level: "Soglia",
    explanation: "duro ma controllato, una parola o due; ritmo gara, max 200 m",
  },
  {
    code: "C2",
    name: "Capacità anaerobica",
    description: "Capacità anaerobica molto alta, sforzo intenso, massimo 150 m a ripetuta.",
    purpose: "Insegna a reggere la fatica intensa e a mantenere la velocità quando i muscoli bruciano.",
    breathing: "fiato corto, respiro molto affannoso",
    talkTest: "non riesci a parlare",
    rpe: { min: 8, max: 9 },
    maxRepMeters: 150,
    level: "Sopra soglia",
    explanation: "molto duro, non riesci a parlare; regge la fatica intensa, max 150 m",
  },
  {
    code: "C3",
    name: "Potenza anaerobica",
    description: "Potenza anaerobica massimale, sprint puro, solo tratti brevissimi fino a 25 m.",
    purpose: "Allena la velocità pura e la potenza di bracciata e gambe.",
    breathing: "pochissimi respiri, quasi in apnea",
    talkTest: "impossibile parlare",
    rpe: { min: 10, max: 10 },
    maxRepMeters: 25,
    level: "Sopra soglia",
    explanation: "sprint a tutta, non si respira quasi; velocità pura, max 25 m",
  },
];

export const PACE_ZONE_BY_CODE = Object.fromEntries(PACE_ZONES.map((zone) => [zone.code, zone])) as Record<
  PaceZoneCode,
  PaceZoneDefinition
>;

export const isPaceZoneCode = (value: unknown): value is PaceZoneCode =>
  typeof value === "string" && (PACE_ZONE_CODES as readonly string[]).includes(value);

/** «6–7», or «5» when the range is one value. */
export const zoneRpeLabel = (zone: Pick<PaceZoneDefinition, "rpe">) =>
  zone.rpe.min === zone.rpe.max ? String(zone.rpe.min) : `${zone.rpe.min}–${zone.rpe.max}`;

/** «B2 · Soglia: respiro impegnato, poche parole tra una vasca e l'altra; alza la soglia». */
export function zoneOneLine(code: PaceZoneCode): string {
  const zone = PACE_ZONE_BY_CODE[code];
  return `${code} · ${zone.level}: ${zone.explanation}`;
}

/**
 * Safety limits of the coach's workouts, for a recreational swimmer (our convention): the metres
 * of C1, C2 and C3 in one session, the shortest rest of C2 and C3 as a multiple of the rep time
 * (with a send-off, the rest it leaves at the zone pace), the A1 warm-up and the total against
 * the median of the last pool swims. The server checks them on every generated workout.
 */
export const WORKOUT_SAFETY_LIMITS = {
  sessionMeters: { C1: 1600, C2: 600, C3: 300 } as Partial<Record<PaceZoneCode, number>>,
  restVsRep: { C2: 1, C3: 3 } as Partial<Record<PaceZoneCode, number>>,
  warmupA1Meters: 200,
  totalVsMedian: 1.5,
  lastPoolSwims: 6,
} as const;

/** The limits in one line, for the definitions, the glossary and the coach. */
export const WORKOUT_SAFETY_TEXT =
  "Limiti di sicurezza degli allenamenti del coach (convenzione nostra): in un allenamento al massimo 1600 m in C1, 600 m in C2 e 300 m in C3; in C2 il recupero è almeno lungo quanto la ripetuta, in C3 almeno 3 volte; si comincia sempre con almeno 200 m facili in A1; il totale non supera 1,5 volte la mediana delle tue ultime 6 nuotate in vasca.";

/** The zones of each of the five levels, aligned so that the two scales never contradict. */
export const LEVEL_ZONES: Record<IntensityLevel, PaceZoneCode[]> = {
  Facile: ["A1"],
  Aerobico: ["A2"],
  Medio: ["B1"],
  Soglia: ["B2", "C1"],
  "Sopra soglia": ["C2", "C3"],
};

/**
 * The split of the intensity summary by zone letter (polarized or pyramidal distribution): zone A
 * aerobic, B mixed, C anaerobic. The level words (Facile, Medio, …) stay for the five levels.
 */
export const INTENSITY_SPLIT = {
  A: ["A1", "A2"],
  B: ["B1", "B2"],
  C: ["C1", "C2", "C3"],
} as const satisfies Record<string, readonly PaceZoneCode[]>;

/** The three letters in plain words, for the glossary and the definitions. */
export const ZONE_GROUPS_TEXT =
  "Le zone A sono aerobiche (lavoro facile e di base, potresti parlare), le B miste (aerobico sostenuto fino a ridosso della soglia, frasi brevi), le C anaerobiche (dalla soglia in su: ripetute brevi e recuperi lunghi).";

const zoneIndex = (code: PaceZoneCode) => PACE_ZONE_CODES.indexOf(code);

/** Metres per level (Facile..Sopra soglia) from metres per zone. */
export function levelMeters(zones: Zones7): [number, number, number, number, number] {
  return INTENSITY_LEVELS.map((level) =>
    LEVEL_ZONES[level].reduce((sum, code) => sum + zones[zoneIndex(code)], 0),
  ) as [number, number, number, number, number];
}

export const emptyZones7 = (): Zones7 => [0, 0, 0, 0, 0, 0, 0];

// ─── Bounds and ranges ──────────────────────────────────────────────────────

/** The automatic bounds for a CSS pace (s/100 m): boundary pace = CSS pace / speed share. */
export function paceZoneBoundsFromCss(cssPaceSecondsPer100: number): PaceZoneBounds {
  return Object.fromEntries(
    PACE_ZONE_BOUNDARY_KEYS.map((key) => [key, cssPaceSecondsPer100 / PACE_ZONE_SPEED_BOUNDS[key]]),
  ) as PaceZoneBounds;
}

export type PaceZoneRange = {
  code: PaceZoneCode;
  name: string;
  level: IntensityLevel;
  /** Fast end of the zone (s/100 m); null for C2 and C3 (open-ended). */
  fastPace: number | null;
  /** Slow end (s/100 m); null for A1 (open-ended). */
  slowPace: number | null;
  maxRepMeters: number | null;
};

/** The seven zones as paces. C2 and C3 share the pace (faster than C1/C2): C3 is a sprint ≤ 25 m. */
export function paceZoneRanges(bounds: PaceZoneBounds): PaceZoneRange[] {
  const ends: Record<PaceZoneCode, [number | null, number | null]> = {
    A1: [bounds.a1a2, null],
    A2: [bounds.a2b1, bounds.a1a2],
    B1: [bounds.b1b2, bounds.a2b1],
    B2: [bounds.b2c1, bounds.b1b2],
    C1: [bounds.c1c2, bounds.b2c1],
    C2: [null, bounds.c1c2],
    C3: [null, bounds.c1c2],
  };
  return PACE_ZONES.map((zone) => ({
    code: zone.code,
    name: zone.name,
    level: zone.level,
    fastPace: ends[zone.code][0],
    slowPace: ends[zone.code][1],
    maxRepMeters: zone.maxRepMeters,
  }));
}

export type LevelRange = {
  level: IntensityLevel;
  codes: PaceZoneCode[];
  fastPace: number | null;
  slowPace: number | null;
};

/** The five levels as paces: the union of their zones' ranges. */
export function levelRanges(ranges: PaceZoneRange[]): LevelRange[] {
  return INTENSITY_LEVELS.map((level) => {
    const codes = LEVEL_ZONES[level];
    const own = ranges.filter((range) => codes.includes(range.code));
    const fast = own.map((range) => range.fastPace);
    const slow = own.map((range) => range.slowPace);
    return {
      level,
      codes,
      fastPace: fast.includes(null) ? null : Math.min(...(fast as number[])),
      slowPace: slow.includes(null) ? null : Math.max(...(slow as number[])),
    };
  });
}

/** Rounding keeps a floating-point pace like 117.64705882 from slipping past an equal boundary. */
const steady = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * Zone of an active freestyle lap from its pace (s/100 m), distance and the pool length. A pace
 * equal to a boundary goes to the faster zone; faster than C1/C2 is C3 for a lap of at most 25 m
 * or one pool length, else C2.
 */
export function paceZoneOf(
  paceSecondsPer100: number,
  lapMeters: number,
  bounds: PaceZoneBounds,
  poolLengthMeters: number | null,
): PaceZoneCode {
  const pace = steady(paceSecondsPer100);
  if (pace > steady(bounds.a1a2)) return "A1";
  if (pace > steady(bounds.a2b1)) return "A2";
  if (pace > steady(bounds.b1b2)) return "B1";
  if (pace > steady(bounds.b2c1)) return "B2";
  if (pace > steady(bounds.c1c2)) return "C1";
  const sprintMeters = Math.max(C3_MAX_LAP_METERS, poolLengthMeters ?? 0);
  return lapMeters <= sprintMeters + 0.01 ? "C3" : "C2";
}

/**
 * Midpoint of a zone against the CSS, in s/100 m (positive is slower), for workout targets as a
 * CSS offset (Garmin). Open zones extend by their neighbour's width: A1 is centred half an A2
 * slower than A1/A2, C2 half a C1 faster than C1/C2, C3 a whole C1 faster. The CSS is the B2/C1
 * boundary unless given (manual zones with a different CSS). Rounded to tenths.
 */
export function zoneCssOffsetSeconds(
  code: PaceZoneCode,
  bounds: PaceZoneBounds,
  cssPaceSecondsPer100: number = bounds.b2c1,
): number {
  const a2Width = bounds.a1a2 - bounds.a2b1;
  const c1Width = bounds.b2c1 - bounds.c1c2;
  const midpoint: Record<PaceZoneCode, number> = {
    A1: bounds.a1a2 + a2Width / 2,
    A2: (bounds.a1a2 + bounds.a2b1) / 2,
    B1: (bounds.a2b1 + bounds.b1b2) / 2,
    B2: (bounds.b1b2 + bounds.b2c1) / 2,
    C1: (bounds.b2c1 + bounds.c1c2) / 2,
    C2: bounds.c1c2 - c1Width / 2,
    C3: bounds.c1c2 - c1Width,
  };
  return Math.round((midpoint[code] - cssPaceSecondsPer100) * 10) / 10;
}
