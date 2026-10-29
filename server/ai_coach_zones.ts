/**
 * Pace zones in the generated pool workouts: after the model answers, every rep is checked
 * against the zones A1–C3 (a known code, the maximum rep of C1, C2 and C3). A rep that is too
 * long is split in whole return lengths with the same rest (4×300 C1 → 8×150 C1); an unknown
 * or missing zone asks the model once more. Then the server adds the level and the target pace
 * from the athlete's zones and recomputes the total, which the model cannot be trusted with.
 */
import {
  isPaceZoneCode,
  PACE_ZONE_BY_CODE,
  type PaceZoneCode,
  type SwimZones,
} from "@shared/swimMetrics";
import type { CoachWorkout, CoachWorkoutExercise } from "@shared/coachWorkout";
import { logger } from "./middleware/logger";

export type ZoneViolation = {
  section: string;
  exercise: string;
  kind: "distance" | "unknown_zone" | "missing_zone";
  problem: string;
  /** True when the server fixed it (a rep split). */
  fixed: boolean;
};

type Rep = { repeats: number; repMeters: number };

const REPS = /(\d+)\s*[x×]\s*(\d+)/i;
const SETS = /(\d+)\s*[x×]/i;
const METERS = /(\d+)\s*m\b/i;

const positiveInt = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

/**
 * How many reps and how long each: the numbers when the model gives them, else read from
 * «4x» + «100m», «4x50m» or the name («8×50 m forte»); a single distance is one rep. Null
 * without metres (time or dry-land exercises).
 */
export function parseRep(exercise: Pick<CoachWorkoutExercise, "name" | "sets" | "distance" | "repeats" | "repMeters">): Rep | null {
  const repeats = positiveInt(exercise.repeats);
  const repMeters = positiveInt(exercise.repMeters);
  if (repeats && repMeters) return { repeats, repMeters };
  const distance = exercise.distance ?? "";
  const inDistance = distance.match(REPS);
  if (inDistance) return { repeats: Number(inDistance[1]), repMeters: Number(inDistance[2]) };
  const meters = distance.match(METERS) ?? distance.trim().match(/^(\d+)$/);
  const sets = exercise.sets?.match(SETS);
  if (meters) return { repeats: sets ? Number(sets[1]) : 1, repMeters: Number(meters[1]) };
  const inName = exercise.name?.match(REPS);
  if (inName) return { repeats: Number(inName[1]), repMeters: Number(inName[2]) };
  return null;
}

/**
 * The same metres in shorter reps within `max`: the fewest pieces of whole return lengths (25 m
 * or multiples of 50 m, so each rep ends at the wall it starts from), else of whole lengths
 * (multiples of 25 m). Null when the distance has no such split.
 */
function splitRep(rep: Rep, max: number): Rep | null {
  const fits: Array<(piece: number) => boolean> = [
    (piece) => piece === 25 || piece % 50 === 0,
    (piece) => piece % 25 === 0,
  ];
  for (const fit of fits) {
    for (let pieces = Math.ceil(rep.repMeters / max); pieces <= rep.repMeters / 25; pieces += 1) {
      const piece = rep.repMeters / pieces;
      if (Number.isInteger(piece) && piece <= max && fit(piece)) {
        return { repeats: rep.repeats * pieces, repMeters: piece };
      }
    }
  }
  return null;
}

/** The exercise's texts after a split: «4x300 …» → «8×150 …», sets «8x», distance «150m». */
function applySplit(exercise: CoachWorkoutExercise, from: Rep, to: Rep): void {
  const label = `${to.repeats}×${to.repMeters}`;
  const renamed = exercise.name.replace(REPS, (match, count, meters) =>
    Number(count) === from.repeats && Number(meters) === from.repMeters ? label : match,
  );
  exercise.name =
    renamed !== exercise.name || from.repeats !== 1
      ? renamed
      : exercise.name.replace(new RegExp(`\\b${from.repMeters}(\\s*m)?\\b`), label);
  if (exercise.sets) exercise.sets = `${to.repeats}x`;
  if (exercise.distance) {
    exercise.distance = REPS.test(exercise.distance) ? `${to.repeats}x${to.repMeters}m` : `${to.repMeters}m`;
  }
  exercise.repeats = to.repeats;
  exercise.repMeters = to.repMeters;
}

const NOT_FREESTYLE = /dorso|rana|farfalla|delfino|misti|gambe|tecnica|drill|kick|back|breast|fly|medley/i;

/** The zone paces hold for freestyle: the stroke when given, else what the name says. */
function isFreestyle(exercise: CoachWorkoutExercise): boolean {
  const stroke = exercise.stroke?.trim();
  if (stroke) return /libero|crawl|freestyle/i.test(stroke) && !NOT_FREESTYLE.test(stroke);
  return !NOT_FREESTYLE.test(exercise.name ?? "");
}

/**
 * Checks and completes every rep of a pool workout (a copy): zone code, maximum rep (split when
 * possible), level, target pace from the athlete's zones (freestyle only), total metres.
 */
export function finalizePoolWorkout(
  source: CoachWorkout,
  zones: SwimZones | null,
): { workout: CoachWorkout; violations: ZoneViolation[] } {
  const workout = structuredClone(source);
  const violations: ZoneViolation[] = [];
  let total = 0;
  for (const section of workout.sections ?? []) {
    for (const exercise of section.exercises ?? []) {
      const rep = parseRep(exercise);
      const report = (kind: ZoneViolation["kind"], problem: string, fixed = false) =>
        violations.push({ section: section.title, exercise: exercise.name, kind, problem, fixed });

      const raw = typeof exercise.zone === "string" ? exercise.zone.trim().toUpperCase() : exercise.zone;
      let code: PaceZoneCode | null = null;
      if (isPaceZoneCode(raw)) code = raw;
      else if (raw !== undefined && raw !== null && raw !== "") report("unknown_zone", `zona «${String(exercise.zone)}» sconosciuta`);
      else if (rep) report("missing_zone", "zona mancante");

      let final = rep;
      if (code && rep) {
        const max = PACE_ZONE_BY_CODE[code].maxRepMeters;
        if (max !== null && rep.repMeters > max) {
          const split = splitRep(rep, max);
          report("distance", `${rep.repeats}×${rep.repMeters} m oltre i ${max} m di ${code}`, split !== null);
          if (split) {
            applySplit(exercise, rep, split);
            exercise.zoneNote = `Spezzato in ${split.repeats}×${split.repMeters} m: in ${code} la ripetuta più lunga è ${max} m.`;
            final = split;
          }
        }
      }
      if (final) {
        exercise.repeats = final.repeats;
        exercise.repMeters = final.repMeters;
        total += final.repeats * final.repMeters;
      }

      if (code) {
        exercise.zone = code;
        exercise.level = PACE_ZONE_BY_CODE[code].level;
        const range = zones?.source ? zones.ranges.find((candidate) => candidate.code === code) : undefined;
        exercise.targetPace =
          range && isFreestyle(exercise) ? { fastPace: range.fastPace, slowPace: range.slowPace } : null;
      } else {
        delete exercise.zone;
        delete exercise.level;
        delete exercise.targetPace;
      }
    }
  }
  workout.totalMeters = total;
  workout.zoneSource = zones?.source ?? null;
  return { workout, violations };
}

/** The workout JSON of a model answer (also inside a ```json block); null when it is not one. */
export function parseWorkoutJson(text: string): CoachWorkout | null {
  try {
    const trimmed = text.trim();
    const block = trimmed.match(/```json\s*([\s\S]*?)\s*```/) ?? trimmed.match(/```\s*([\s\S]*?)\s*```/);
    const workout = JSON.parse(block ? block[1] : trimmed.replace(/```(json)?/g, "").trim());
    if (!workout || typeof workout !== "object" || !workout.title || !Array.isArray(workout.sections)) return null;
    return workout as CoachWorkout;
  } catch {
    return null;
  }
}

const describeViolations = (violations: ZoneViolation[]) =>
  violations.map((v) => `- ${v.section}, «${v.exercise}»: ${v.problem}`).join("\n");

const LIMITS = Object.values(PACE_ZONE_BY_CODE)
  .filter((zone) => zone.maxRepMeters !== null)
  .map((zone) => `${zone.code} ${zone.maxRepMeters} m`)
  .join(", ");

/**
 * Generates a pool workout whose reps respect the zones: fixes what can be split, asks the model
 * once more for anything else (with what was wrong), and on a second failure keeps the workout
 * when only zones are missing or falls back when a rep is still too long or the answer is not a
 * workout. Every violation is logged.
 */
export async function generateZonedPoolWorkout({
  prompt,
  generate,
  zones,
  fallback,
}: {
  prompt: string;
  generate: (prompt: string) => Promise<string>;
  zones: SwimZones | null;
  fallback: CoachWorkout;
}): Promise<CoachWorkout> {
  let feedback: string | null = null;
  for (const attempt of [1, 2] as const) {
    const text = await generate(feedback ? `${prompt}\n\n${feedback}` : prompt);
    const parsed = parseWorkoutJson(text);
    if (!parsed) {
      logger.warn("[AI Coach] The model's answer is not a workout", {
        event: "ai_coach:parse_failed",
        attempt,
        rawPreview: text.slice(0, 800),
      });
      feedback = "ATTENZIONE: la risposta precedente non era un JSON valido. Rispondi SOLO con il JSON richiesto.";
      continue;
    }
    const { workout, violations } = finalizePoolWorkout(parsed, zones);
    if (violations.length > 0) {
      logger.warn("[AI Coach] Generated workout broke the zones", {
        event: "ai_coach:zone_violations",
        attempt,
        violations,
      });
    }
    const open = violations.filter((v) => !v.fixed);
    // On the second answer an unknown code is already dropped and a missing zone only hides the chip.
    const blocking = attempt === 1 ? open : open.filter((v) => v.kind === "distance");
    if (blocking.length === 0) return workout;
    if (attempt === 2) {
      logger.warn("[AI Coach] Zones still broken after asking again: fallback workout", {
        event: "ai_coach:zone_rejected",
        violations: blocking,
      });
      break;
    }
    feedback = [
      "ATTENZIONE: la proposta precedente non rispettava le zone:",
      describeViolations(open),
      `Riscrivi l'allenamento: ogni ripetuta ha "zone" tra A1, A2, B1, B2, C1, C2, C3 e nessuna ripetuta supera la distanza massima della sua zona (${LIMITS}).`,
    ].join("\n");
  }
  return finalizePoolWorkout(fallback, zones).workout;
}
