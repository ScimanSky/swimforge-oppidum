/**
 * Pace zones in the generated pool workouts: after the model answers, every rep is checked
 * against the zones A1–C3 (a known code, the maximum rep of C1, C2 and C3) and the safety limits
 * (ai_coach_safety). A rep that is too long is split in whole lengths with the same rest, a
 * send-off scaled to the shorter rep (4×300 C1 a 5:00 → 8×150 C1 a 2:30); anything else asks the
 * model once more, saying what was wrong. If the second answer still breaks the safety limits,
 * the server trims it and says what changed. Then the server adds the level and the target pace
 * from the athlete's zones and recomputes the total, which the model cannot be trusted with.
 */
import {
  isPaceZoneCode,
  PACE_ZONE_BY_CODE,
  type PaceZoneCode,
  type SwimZones,
} from "@shared/swimMetrics";
import {
  isFreestyleRep,
  parseRest,
  withSendoff,
  type CoachWorkout,
  type CoachWorkoutExercise,
} from "@shared/coachWorkout";
import { logger } from "./middleware/logger";
import { readRep, repLabel, writeRep, type Rep, type WorkoutViolation } from "./ai_coach_reps";
import { checkSafety, enforceSafety, safetyRulesText, type SafetyContext } from "./ai_coach_safety";

export { parseRep } from "./ai_coach_reps";
export type ZoneViolation = WorkoutViolation;

export type FinalizeOptions = {
  /** The athlete's usual pool length (m): splits end at a wall, C3 in a 50 m pool is half a sprint. */
  poolLengthMeters?: number | null;
};

/** 50 for a 50 m pool, else 25 (25 m and 25 yd). */
const poolUnit = (poolLengthMeters?: number | null) => (poolLengthMeters && poolLengthMeters >= 45 ? 50 : 25);

/**
 * The same metres in shorter reps within `max`: the fewest pieces of whole return lengths (in a
 * 25 m pool also one length, the sprint), so each rep ends at the wall it starts from, else of
 * whole lengths. Null when the distance has no such split.
 */
function splitRep(rep: Rep, max: number, unit: number): Rep | null {
  const fits: Array<(piece: number) => boolean> = [
    (piece) => piece % (2 * unit) === 0 || (unit === 25 && piece === 25),
    (piece) => piece % unit === 0,
  ];
  for (const fit of fits) {
    for (let pieces = Math.ceil(rep.repMeters / max); pieces <= rep.repMeters / unit; pieces += 1) {
      const piece = rep.repMeters / pieces;
      if (Number.isInteger(piece) && piece <= max && fit(piece)) {
        return { repeats: rep.repeats * pieces, repMeters: piece };
      }
    }
  }
  return null;
}

const round5 = (seconds: number) => Math.round(seconds / 5) * 5;

/**
 * A rep split in shorter ones keeps a rest («30 sec», «r20», «20″»), but a send-off is the time
 * of rep and rest together: it shrinks with the rep (a 5:00 for 300 m is a 2:30 for 150 m),
 * rounded to 5 s. Returns the new send-off, or null when the rest is not one.
 */
function scaleSendoff(exercise: CoachWorkoutExercise, from: Rep, to: Rep): number | null {
  const spec = parseRest(exercise.rest);
  if (spec?.kind !== "sendoff") return null;
  const seconds = round5((spec.seconds * to.repMeters) / from.repMeters);
  exercise.rest = withSendoff(String(exercise.rest), seconds);
  return seconds;
}

/** «B2», «b2», «B2 · Soglia», «zona C1»; null when there is no code A1–C3. */
function zoneCodeOf(raw: unknown): PaceZoneCode | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  if (isPaceZoneCode(upper)) return upper;
  const inside = upper.match(/\b([ABC][1-3])\b/);
  return inside && isPaceZoneCode(inside[1]) ? inside[1] : null;
}

const addNote = (exercise: CoachWorkoutExercise, note: string) => {
  exercise.zoneNote = [exercise.zoneNote, note].filter(Boolean).join(" ");
};

/**
 * Checks and completes every rep of a pool workout (a copy): reps read from numbers, fields and
 * name (a disagreement is reported and the reading with fewer metres kept), zone code, maximum
 * rep (split when possible, a send-off scaled), C3 in a 50 m pool as 25 m sprint + 25 m easy,
 * level and intensity, target pace from the athlete's zones (freestyle without equipment only),
 * total metres.
 */
export function finalizePoolWorkout(
  source: CoachWorkout,
  zones: SwimZones | null,
  options: FinalizeOptions = {},
): { workout: CoachWorkout; violations: ZoneViolation[] } {
  const workout = structuredClone(source);
  const unit = poolUnit(options.poolLengthMeters);
  const violations: ZoneViolation[] = [];
  let total = 0;
  for (const section of workout.sections ?? []) {
    section.exercises = Array.isArray(section.exercises) ? section.exercises.filter((e) => e && typeof e === "object") : [];
    for (const exercise of section.exercises) {
      exercise.name = String(exercise.name ?? "");
      const reading = readRep(exercise);
      const report = (kind: ZoneViolation["kind"], problem: string, fixed = false) =>
        violations.push({ section: String(section.title ?? ""), exercise: exercise.name, kind, problem, fixed });

      let final = reading.rep;
      if (final && reading.conflict) {
        report("rep_mismatch", `${reading.conflict}: scrivi lo stesso numero di ripetute e di metri nel nome e nei campi`);
        writeRep(exercise, final, reading.named);
        addNote(exercise, `Nome e dettagli non coincidevano (${reading.conflict}): vale ${repLabel(final)}, la lettura con meno metri.`);
      }

      const raw: unknown = exercise.zone;
      const code = zoneCodeOf(raw);
      if (!code && raw !== undefined && raw !== null && String(raw).trim() !== "") {
        report("unknown_zone", `zona «${String(raw)}» sconosciuta`);
      } else if (!code && final) {
        report("missing_zone", "zona mancante");
      }

      if (code === "C3" && final && unit === 50) {
        // A 50 m pool has no 25 m reps: each rep is one length, 25 m sprint and 25 m easy.
        const to = { repeats: final.repeats * Math.max(1, Math.round(final.repMeters / 50)), repMeters: 50 };
        if (to.repeats !== final.repeats || to.repMeters !== final.repMeters) {
          report("distance", `${repLabel(final)} in C3 in vasca da 50 m`, true);
          writeRep(exercise, to, readRep(exercise).named);
          final = to;
        }
        exercise.sprintMeters = 25;
        if (!/25\s*m?\s*sprint/i.test(exercise.name)) exercise.name = `${exercise.name} (25 m sprint + 25 m facile)`;
        addNote(exercise, "In vasca da 50 m il C3 è 25 m sprint + 25 m facile: parti a tutta e finisci la vasca piano.");
      } else if (code && final) {
        delete exercise.sprintMeters;
        const max = PACE_ZONE_BY_CODE[code].maxRepMeters;
        if (max !== null && final.repMeters > max) {
          const split = splitRep(final, max, unit);
          report("distance", `${final.repeats}×${final.repMeters} m oltre i ${max} m di ${code}`, split !== null);
          if (split) {
            writeRep(exercise, split, readRep(exercise).named);
            const sendoff = scaleSendoff(exercise, final, split);
            addNote(
              exercise,
              `Spezzato in ${split.repeats}×${split.repMeters} m: in ${code} la ripetuta più lunga è ${max} m.${
                sendoff !== null ? ` Ripartenza riportata ai ${split.repMeters} m: ${exercise.rest}.` : ""
              }`,
            );
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
        const zone = PACE_ZONE_BY_CODE[code];
        exercise.zone = code;
        exercise.level = zone.level;
        // The level is the plain word for the effort: it replaces what the model wrote.
        exercise.intensity = zone.level;
        const range = zones?.source ? zones.ranges.find((candidate) => candidate.code === code) : undefined;
        exercise.targetPace =
          range && isFreestyleRep(exercise) ? { fastPace: range.fastPace, slowPace: range.slowPace } : null;
      } else {
        delete exercise.zone;
        delete exercise.level;
        delete exercise.targetPace;
        delete exercise.sprintMeters;
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
 * A finalized workout within the safety limits (the fallback and the second answer): trimmed
 * when needed, with what changed logged.
 */
export function safeWorkout(workout: CoachWorkout, safety: SafetyContext, context: Record<string, unknown> = {}): CoachWorkout {
  const violations = checkSafety(workout, safety);
  if (violations.length === 0) return workout;
  const trimmed = enforceSafety(workout, safety);
  logger.warn("[AI Coach] Workout trimmed to the safety limits", {
    event: "ai_coach:safety_trimmed",
    ...context,
    violations,
    changes: trimmed.changes,
  });
  return trimmed.workout;
}

/**
 * Generates a pool workout whose reps respect the zones and the safety limits: fixes what can be
 * split, asks the model once more for anything else (with the list of what was wrong), and on the
 * second answer trims what still breaks the safety limits, keeps it when only zones are missing,
 * or falls back when a rep is still too long or the answer is not a workout (the fallback is
 * trimmed too). Every violation is logged.
 */
export async function generateZonedPoolWorkout({
  prompt,
  generate,
  zones,
  fallback,
  safety = { zones, history: null },
}: {
  prompt: string;
  generate: (prompt: string) => Promise<string>;
  zones: SwimZones | null;
  fallback: CoachWorkout;
  safety?: SafetyContext;
}): Promise<CoachWorkout> {
  const options: FinalizeOptions = { poolLengthMeters: safety.history?.usualPoolLengthMeters ?? null };
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
    const { workout, violations: zoneViolations } = finalizePoolWorkout(parsed, zones, options);
    const violations = [...zoneViolations, ...checkSafety(workout, safety)];
    if (violations.length > 0) {
      logger.warn("[AI Coach] Generated workout broke the zones or the safety limits", {
        event: "ai_coach:zone_violations",
        attempt,
        violations,
      });
    }
    const open = violations.filter((v) => !v.fixed);
    if (open.length === 0) return workout;
    if (attempt === 2) {
      // A rep still too long that cannot be split: the fallback. Anything else is kept: an
      // unknown code is dropped, a missing zone only hides the chip, a name that disagrees with
      // the fields was rewritten, and the safety limits are enforced here.
      const tooLong = open.filter((v) => v.kind === "distance");
      if (tooLong.length === 0) return safeWorkout(workout, safety, { attempt });
      logger.warn("[AI Coach] Zones still broken after asking again: fallback workout", {
        event: "ai_coach:zone_rejected",
        violations: tooLong,
      });
      break;
    }
    feedback = [
      "ATTENZIONE: la proposta precedente non rispettava le zone o i limiti di sicurezza:",
      describeViolations(open),
      `Riscrivi l'allenamento: ogni ripetuta ha "zone" tra A1, A2, B1, B2, C1, C2, C3, nessuna ripetuta supera la distanza massima della sua zona (${LIMITS}), nome e campi dicono le stesse ripetute e gli stessi metri, e rispetti i ${safetyRulesText(safety.history)}.`,
    ].join("\n");
  }
  return safeWorkout(finalizePoolWorkout(fallback, zones, options).workout, safety, { fallback: true });
}
