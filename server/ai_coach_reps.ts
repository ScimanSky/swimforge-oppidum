/**
 * How many reps and how long each, read from what the model wrote in a pool exercise (numbers,
 * «sets» and «distance», the name), and the same texts rewritten when the server changes a rep.
 * Every field is coerced to text first: the model sometimes writes numbers where the format asks
 * for strings, and nothing here may throw.
 */
import type { CoachWorkoutExercise } from "@shared/coachWorkout";

export type Rep = { repeats: number; repMeters: number };

/** What a generated workout breaks, logged and told to the model when it is asked again. */
export type WorkoutViolation = {
  section: string;
  exercise: string;
  kind:
    | "distance"
    | "unknown_zone"
    | "missing_zone"
    | "rep_mismatch"
    | "safety_volume"
    | "safety_rest"
    | "safety_warmup"
    | "safety_total";
  problem: string;
  /** True when the server fixed it (a rep split). */
  fixed: boolean;
};

/** A rep read from one text, with the words it was read from (to rewrite them). */
type Reading = Rep & {
  text: string;
  /** One distance without a count: it may be the total of the reps. */
  single: boolean;
};

const MAX_REP_METERS = 10_000;
const MAX_REPEATS = 200;

const KM = /(\d+(?:[.,]\d+)?)\s*km\b/i;
/** «2x(4x50)», «2 × (4 × 50 m)». */
const NESTED = /(\d+)\s*[x×]\s*\(\s*(\d+)\s*[x×]\s*(\d+)\s*(?:m\b|metri\b)?\s*\)/i;
/** «2 serie di 4x300», «3 giri da 4×50». */
const GROUPS = /(\d+)\s*(?:serie|giri|blocchi|volte)\s+(?:di|da)\s+(\d+)\s*[x×]\s*(\d+)/i;
const REPS = /(\d+)\s*[x×]\s*(\d+)/i;
const METERS = /(\d+)\s*(?:m|metri)\b/i;
/** A name that starts with its distance: «400 stile libero sciolto» (not «10 minuti», «3 vasche»). */
const LEADING = /^\s*(\d+)(?!\d)(?!\s*(?:[x×:.,'′″"]|min|sec|s\b|vasch|braccia|volt|serie|giri|km))/i;

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

const valid = (rep: Rep) =>
  Number.isInteger(rep.repeats) &&
  Number.isInteger(rep.repMeters) &&
  rep.repeats > 0 &&
  rep.repMeters > 0 &&
  rep.repeats <= MAX_REPEATS &&
  rep.repMeters <= MAX_REP_METERS;

/** A positive whole number, also from «6»; null otherwise. */
function positiveInt(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * The volume a text says: «1,5 km», «2x(4x50)», «2 serie di 4x300», «4x50m», «400 m»; with `bare`
 * also a plain number («400», the distance field), else a leading distance («400 stile»).
 */
function parseVolume(source: string, bare: boolean): Reading | null {
  const candidates: Array<() => Reading | null> = [
    () => {
      const m = source.match(KM);
      return m ? { repeats: 1, repMeters: Math.round(Number(m[1].replace(",", ".")) * 1000), text: m[0], single: true } : null;
    },
    () => {
      const m = source.match(NESTED);
      return m ? { repeats: Number(m[1]) * Number(m[2]), repMeters: Number(m[3]), text: m[0], single: false } : null;
    },
    () => {
      const m = source.match(GROUPS);
      return m ? { repeats: Number(m[1]) * Number(m[2]), repMeters: Number(m[3]), text: m[0], single: false } : null;
    },
    () => {
      const m = source.match(REPS);
      return m ? { repeats: Number(m[1]), repMeters: Number(m[2]), text: m[0], single: false } : null;
    },
    () => {
      const m = source.match(METERS);
      return m ? { repeats: 1, repMeters: Number(m[1]), text: m[0], single: true } : null;
    },
    () => {
      const m = bare ? source.match(/^\s*(\d+)\s*$/) : source.match(LEADING);
      if (!m) return null;
      const meters = Number(m[1]);
      // A leading number in a name is a distance only when it looks like one.
      if (!bare && (meters < 25 || meters % 25 !== 0)) return null;
      return { repeats: 1, repMeters: meters, text: m[1], single: true };
    },
  ];
  for (const candidate of candidates) {
    const reading = candidate();
    if (reading) return valid(reading) ? reading : null;
  }
  return null;
}

/** The numbers «repeats» and «repMeters», when both are there. */
function fromNumbers(exercise: Partial<CoachWorkoutExercise>): Reading | null {
  const repeats = positiveInt(exercise.repeats);
  const repMeters = positiveInt(exercise.repMeters);
  if (!repeats || !repMeters) return null;
  const rep = { repeats, repMeters };
  return valid(rep) ? { ...rep, text: "", single: false } : null;
}

/**
 * «distance» with «sets»: «4x50m» alone, or «300m» with sets «4x» or «4» (the first number of
 * sets, when the distance has no count of its own).
 */
function fromFields(exercise: Partial<CoachWorkoutExercise>): Reading | null {
  const distance = parseVolume(text(exercise.distance), true);
  if (!distance) return null;
  if (!distance.single) return distance;
  const sets = text(exercise.sets).match(/(\d+)/);
  if (!sets) return distance;
  const rep = { repeats: Number(sets[1]), repMeters: distance.repMeters };
  return valid(rep) ? { ...rep, text: distance.text, single: false } : null;
}

const total = (rep: Rep) => rep.repeats * rep.repMeters;
const same = (a: Rep, b: Rep) => a.repeats === b.repeats && a.repMeters === b.repMeters;
/** A single distance names either the rep («100m» of 6×100) or the total («400m» of 4×100). */
const fits = (single: Reading, other: Reading) =>
  single.single && (single.repMeters === other.repMeters || single.repMeters === total(other));
/** Two readings agree when they are the same reps, or one is a single distance that fits the other. */
const agree = (a: Reading, b: Reading) => same(a, b) || fits(a, b) || fits(b, a);

/** «4×100 m», «400 m». */
export const repLabel = (rep: Rep) => (rep.repeats === 1 ? `${rep.repMeters} m` : `${rep.repeats}×${rep.repMeters} m`);

export type RepRead = {
  /** The reps to swim; null without metres (time or dry-land exercises). */
  rep: Rep | null;
  /** What the name says, to rewrite it. */
  named: Reading | null;
  /** When the name and the fields disagree: what each says (in Italian). */
  conflict: string | null;
};

/**
 * How many reps and how long each, from the numbers, from «distance» with «sets», or from the
 * name («8×50 m forte», «2 serie di 4x300», «1,5 km»), in this order. When they disagree (the name
 * says «4x100», the fields 4×400) the reading with fewer metres is kept, the safer one, and the
 * conflict is reported: the server never fixes it silently.
 */
export function readRep(exercise: Partial<CoachWorkoutExercise>): RepRead {
  const name = text(exercise.name);
  const numbers = fromNumbers(exercise);
  const fields = fromFields(exercise);
  // A name with «+» («200 stile + 100 dorso») has several parts: it counts only when it starts
  // with the reps («8×50 (25 m sprint + 25 m facile)»).
  const inName = parseVolume(name, false);
  const named =
    inName && (!name.includes("+") || (!inName.single && name.trimStart().startsWith(inName.text))) ? inName : null;
  const sources: Array<[string, Reading]> = [];
  if (numbers) sources.push(["i numeri", numbers]);
  if (fields) sources.push(["i dettagli", fields]);
  if (named) sources.push(["il nome", named]);
  if (sources.length === 0) return { rep: null, named: null, conflict: null };

  const disagreeing = sources.find(([, reading]) => !agree(reading, sources[0][1]));
  const chosen = disagreeing
    ? sources.reduce((best, current) => (total(current[1]) < total(best[1]) ? current : best))[1]
    : sources[0][1];
  const conflict = disagreeing
    ? `${sources[0][0]} dicono ${repLabel(sources[0][1])}, ${disagreeing[0]} ${disagreeing[0] === "il nome" ? "dice" : "dicono"} ${repLabel(disagreeing[1])}`
    : null;
  return { rep: { repeats: chosen.repeats, repMeters: chosen.repMeters }, named, conflict };
}

/** How many reps and how long each; null without metres. */
export const parseRep = (exercise: Partial<CoachWorkoutExercise>): Rep | null => readRep(exercise).rep;

/**
 * Writes a changed rep into every text of the exercise: the volume in the name («4x300 …» →
 * «8×150 …»), «sets», «distance» and the numbers.
 */
export function writeRep(exercise: CoachWorkoutExercise, to: Rep, named: Reading | null = readRep(exercise).named): void {
  const name = text(exercise.name);
  if (named && named.text && name.includes(named.text)) {
    const unit = /m$|metri$/i.test(named.text.trim()) ? " m" : "";
    const label = to.repeats === 1 ? `${to.repMeters}${unit}` : `${to.repeats}×${to.repMeters}${unit}`;
    exercise.name = name.replace(named.text, label);
  }
  const hasSets = text(exercise.sets).trim() !== "";
  if (hasSets) exercise.sets = `${to.repeats}x`;
  if (text(exercise.distance).trim() !== "") {
    exercise.distance = hasSets || to.repeats === 1 ? `${to.repMeters}m` : `${to.repeats}x${to.repMeters}m`;
  }
  exercise.repeats = to.repeats;
  exercise.repMeters = to.repMeters;
}
