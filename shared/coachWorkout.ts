/**
 * The AI coach's generated workouts (pool and dry-land) as the server stores them and the client
 * shows them. Pool reps carry a pace zone A1–C3: the model writes the zone, the server checks the
 * maximum rep and the safety limits, splits a rep that is too long, adds the level and the target
 * pace from the athlete's zones and recomputes the total. Workouts stored before the zones have
 * none of these fields.
 */
import type { IntensityLevel, PaceZoneCode } from "./paceZones";

export type CoachWorkoutExercise = {
  name: string;
  sets?: string;
  reps?: string;
  distance?: string;
  duration?: string;
  rest?: string;
  intensity?: string;
  equipment?: string;
  notes?: string;
  /** Pool: how many reps and how long each (m). */
  repeats?: number;
  repMeters?: number;
  /** Pool: the stroke in Italian («stile libero», «dorso», «tecnica», …). */
  stroke?: string;
  /** Pool: the pace zone of the rep. */
  zone?: PaceZoneCode;
  /** The level of the zone (Facile..Sopra soglia), added by the server. */
  level?: IntensityLevel;
  /**
   * Target pace from the athlete's zones when the workout was generated (s/100 m; null at the
   * open end of A1, C2 and C3), freestyle only; added by the server. The page shows the pace of
   * the zones in effect today and keeps this one as history.
   */
  targetPace?: { fastPace: number | null; slowPace: number | null } | null;
  /**
   * C3 in a 50 m pool: the metres of each rep swum as a sprint (25), the rest of the length is
   * easy. Absent elsewhere: the whole rep is in its zone.
   */
  sprintMeters?: number;
  /** What the server changed in the rep and why («Spezzato in 8×150 m: …»). */
  zoneNote?: string;
};

export type CoachWorkoutSection = {
  title: string;
  exercises: CoachWorkoutExercise[];
  notes?: string;
};

export type CoachWorkout = {
  type: "pool" | "dryland";
  title: string;
  description: string;
  duration: string;
  difficulty: string;
  sections: CoachWorkoutSection[];
  coachNotes: string[];
  /** Pool: metres of the reps, recomputed by the server (the model's totals are not trusted). */
  totalMeters?: number;
  /** Pool: the zones the target paces come from; null without zones. */
  zoneSource?: "auto" | "manuali" | null;
};

// ─── Rests ──────────────────────────────────────────────────────────────────

/**
 * What follows a rep: a send-off («a 2:10», «@ 2:10»: the clock time to leave again, rep
 * included) or a rest («20″», «30 sec», «r20», «1′30″», «rec. 1:00»: the pause alone).
 */
export type RestSpec = { kind: "sendoff" | "rest"; seconds: number };

const CLOCK = /(\d{1,2}):([0-5]\d)/;
const clockSeconds = (m: RegExpMatchArray, from = 1) => Number(m[from]) * 60 + Number(m[from + 1]);
/** «rec. 1:00», «recupero 1:30», «pausa 0:45»: a clock time that is a rest. */
const REST_CLOCK = /\b(?:rec(?:upero)?|pausa|riposo|r)\.?\s*(\d{1,2}):([0-5]\d)/i;

const SECONDS_UNIT = String.raw`(?:″|"|''|s\b|sec\b|secondi\b)`;
const MINUTES_UNIT = String.raw`(?:′|'|min\b|minut[oi]\b)`;
const REST_PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => number]> = [
  // «1′30″», «1'30», «1 min 30 s».
  [new RegExp(String.raw`(\d+)\s*(?:′|'|min)\s*(\d{1,2})(?!\d)`, "i"), (m) => Number(m[1]) * 60 + Number(m[2])],
  // «20″», «30 sec», «20s», «20-30s» (a range: the shorter rest).
  [new RegExp(String.raw`(\d+)\s*(?:[-–]\s*\d+\s*)?${SECONDS_UNIT}`, "i"), (m) => Number(m[1])],
  // «1′», «1 min», «2 minuti», «1-2 min».
  [new RegExp(String.raw`(\d+)\s*(?:[-–]\s*\d+\s*)?${MINUTES_UNIT}`, "i"), (m) => Number(m[1]) * 60],
  // «r20», «rec 20», «rec. 20».
  [/\br(?:ec)?\.?\s*(\d+)\b/i, (m) => Number(m[1])],
  // «20»: seconds.
  [/^\s*(\d+)\s*$/, (m) => Number(m[1])],
];

/**
 * The rest of a rep as written by the coach; null when there is none or it cannot be read. A
 * clock time is a send-off («a 2:10», or «2:10» alone: the safer reading, since the rep is in
 * it) unless it says it is a rest («rec. 1:00»).
 */
export function parseRest(rest: unknown): RestSpec | null {
  const text = String(rest ?? "").trim();
  if (!text) return null;
  const restClock = text.match(REST_CLOCK);
  if (restClock) return { kind: "rest", seconds: clockSeconds(restClock) };
  const clock = text.match(CLOCK);
  if (clock) return { kind: "sendoff", seconds: clockSeconds(clock) };
  for (const [pattern, seconds] of REST_PATTERNS) {
    const match = text.match(pattern);
    if (match) return { kind: "rest", seconds: seconds(match) };
  }
  return null;
}

/** The same rest text with another send-off time: «a 5:00» → «a 2:30». */
export const withSendoff = (rest: string, seconds: number) => rest.replace(CLOCK, clockText(seconds));

/** m:ss («2:30»). */
export const clockText = (seconds: number) => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** A rest in seconds: «45″», «1′», «1′30″». */
export function formatRestSeconds(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total}″`;
  const rest = total % 60;
  return `${Math.floor(total / 60)}′${rest ? `${String(rest).padStart(2, "0")}″` : ""}`;
}

/** A send-off: «a 2:30». */
export const formatSendoff = (seconds: number) => `a ${clockText(seconds)}`;

// ─── Stroke ─────────────────────────────────────────────────────────────────

/** Strokes and drills the zone paces do not hold for (whole words; «IM» only in capitals). */
const OTHER_STROKE = /\b(?:dorso|rana|delfino|farfalla|misti|back(?:stroke)?|breast(?:stroke)?|fly|medley|gambe|tecnica|drill|kick)\b/i;
const MEDLEY_SHORT = /\bIM\b/;
/** Equipment changes the pace: fins, paddles, pull buoy, kickboard, kick. */
const EQUIPMENT = /\b(?:pinne|palette|pull(?:[\s-]?buoy)?|tavoletta|gambe)\b/i;
const FREESTYLE = /\b(?:stile libero|libero|crawl|freestyle|sl)\b/i;

/**
 * The zone paces hold for freestyle without equipment: the stroke when given, else what the
 * name says; a rep that mentions equipment has no pace.
 */
export function isFreestyleRep(exercise: Pick<CoachWorkoutExercise, "name" | "stroke" | "equipment">): boolean {
  const name = String(exercise.name ?? "");
  if (EQUIPMENT.test(`${name} ${String(exercise.equipment ?? "")}`)) return false;
  const stroke = String(exercise.stroke ?? "").trim();
  const other = (text: string) => OTHER_STROKE.test(text) || MEDLEY_SHORT.test(text);
  if (stroke) return FREESTYLE.test(stroke) && !other(stroke);
  return !other(name);
}
