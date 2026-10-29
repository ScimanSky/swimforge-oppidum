/**
 * Safety limits of the generated pool workouts (WORKOUT_SAFETY_LIMITS, our convention for a
 * recreational swimmer): the metres of C1, C2 and C3 in a session, the shortest rest of C2 and
 * C3 against the rep time, an A1 warm-up of at least 200 m and the total against the median of
 * the last pool swims. `checkSafety` lists what a finalized workout breaks; `enforceSafety` trims
 * it deterministically (fewer reps of the hardest sets, longer rests, a warm-up) and says under
 * each changed rep what changed and why.
 */
import {
  PACE_ZONE_CODES,
  WORKOUT_SAFETY_LIMITS,
  type PaceZoneCode,
  type SwimZones,
} from "@shared/swimMetrics";
import {
  formatRestSeconds,
  parseRest,
  withSendoff,
  formatSendoff,
  type CoachWorkout,
  type CoachWorkoutExercise,
  type CoachWorkoutSection,
} from "@shared/coachWorkout";
import { repLabel, writeRep, type Rep, type WorkoutViolation } from "./ai_coach_reps";

const L = WORKOUT_SAFETY_LIMITS;

export type PoolHistory = {
  /** Median distance of the last pool swims (at most 6), m; null without pool swims. */
  medianMeters: number | null;
  /** How many pool swims the median is on. */
  swims: number;
  /** The most frequent pool length of the last 10 pool swims (m); null when unknown. */
  usualPoolLengthMeters: number | null;
};

export type SafetyContext = {
  zones: SwimZones | null;
  history: PoolHistory | null;
  /** Pace (s/100 m) for the rep times without zones: the recent average pace, else 2:30. */
  referencePace?: number | null;
};

/** The rep time without zones nor an average pace: 2:30/100 m, slow on purpose (longer rests). */
export const DEFAULT_REFERENCE_PACE = 150;
/** An easy length is timed 10% slower than the A1/A2 boundary. */
const EASY_FACTOR = 1.1;

type Swim = { distanceMeters: unknown; isOpenWater?: unknown; poolLengthMeters?: unknown };

/** Median distance of the last 6 pool swims and the usual pool length, from swims newest first. */
export function poolHistoryOf(swims: Swim[]): PoolHistory {
  const pool = swims.filter((swim) => !swim.isOpenWater && Number(swim.distanceMeters) > 0);
  const last = pool.slice(0, L.lastPoolSwims).map((swim) => Number(swim.distanceMeters)).sort((a, b) => a - b);
  const middle = Math.floor(last.length / 2);
  const medianMeters =
    last.length === 0 ? null : last.length % 2 ? last[middle] : Math.round((last[middle - 1] + last[middle]) / 2);
  const counts = new Map<number, number>();
  for (const swim of pool.slice(0, 10)) {
    const length = Number(swim.poolLengthMeters);
    if (length > 0) counts.set(length, (counts.get(length) ?? 0) + 1);
  }
  // The most frequent; on a tie the most recent (Map keeps the first-seen order, newest first).
  let usual: number | null = null;
  for (const [length, count] of Array.from(counts)) if (usual === null || count > counts.get(usual)!) usual = length;
  return { medianMeters, swims: last.length, usualPoolLengthMeters: usual };
}

/** The longest total a workout may have (1.5 × the median, down to 25 m); null without history. */
export function totalCapMeters(history: PoolHistory | null): number | null {
  if (!history?.medianMeters) return null;
  return Math.floor((history.medianMeters * L.totalVsMedian) / 25) * 25;
}

const ceil5 = (seconds: number) => Math.ceil(seconds / 5) * 5;
const round5 = (seconds: number) => Math.round(seconds / 5) * 5;
const zoneIndex = (code: PaceZoneCode | undefined) => (code ? PACE_ZONE_CODES.indexOf(code) : 3.5);

/**
 * The pace (s/100 m) a rep time is computed at: the slower end of the zone (for C2 and C3 the
 * C1/C2 boundary), so the rep time is never shorter than the real one and the rest is on the
 * safe side; without zones the reference pace.
 */
function zonePace(code: PaceZoneCode, ctx: SafetyContext): number {
  const range = ctx.zones?.source ? ctx.zones.ranges.find((candidate) => candidate.code === code) : undefined;
  return range?.slowPace ?? range?.fastPace ?? ctx.referencePace ?? DEFAULT_REFERENCE_PACE;
}

/** Seconds of the hard part of a rep, and of the whole rep (a C3 in a 50 m pool ends easy). */
function repTimes(exercise: CoachWorkoutExercise, code: PaceZoneCode, ctx: SafetyContext) {
  const meters = exercise.repMeters ?? 0;
  const sprint = code === "C3" && exercise.sprintMeters ? Math.min(exercise.sprintMeters, meters) : meters;
  const work = (sprint * zonePace(code, ctx)) / 100;
  const easy = ((meters - sprint) * zonePace("A1", ctx) * EASY_FACTOR) / 100;
  return { work, full: work + easy };
}

/** The shortest rest after a rep of C2 (as long as the rep) or C3 (3 times), in 5 s; null for other zones. */
export function minRestSeconds(code: PaceZoneCode, exercise: CoachWorkoutExercise, ctx: SafetyContext): number | null {
  const ratio = L.restVsRep[code];
  if (!ratio) return null;
  return ceil5(ratio * repTimes(exercise, code, ctx).work);
}

/** The rest a rep leaves: the rest written, or a send-off minus the rep time; null when not written. */
function restAfter(exercise: CoachWorkoutExercise, code: PaceZoneCode, ctx: SafetyContext): number | null {
  const spec = parseRest(exercise.rest);
  if (!spec) return null;
  return spec.kind === "rest" ? spec.seconds : spec.seconds - repTimes(exercise, code, ctx).full;
}

type Entry = { section: CoachWorkoutSection; exercise: CoachWorkoutExercise; code: PaceZoneCode | undefined; rep: Rep };

/** The reps of a finalized workout (exercises with metres), in order. */
function entries(workout: CoachWorkout): Entry[] {
  return (workout.sections ?? []).flatMap((section) =>
    (section.exercises ?? []).flatMap((exercise) =>
      exercise.repeats && exercise.repMeters
        ? [{ section, exercise, code: exercise.zone, rep: { repeats: exercise.repeats, repMeters: exercise.repMeters } }]
        : [],
    ),
  );
}

const totalOf = (workout: CoachWorkout) => entries(workout).reduce((sum, e) => sum + e.rep.repeats * e.rep.repMeters, 0);

/** Metres of a zone in the session (a C3 in a 50 m pool counts its sprint only). */
function zoneMeters(workout: CoachWorkout, code: PaceZoneCode): number {
  return entries(workout)
    .filter((e) => e.code === code)
    .reduce((sum, e) => sum + e.rep.repeats * (code === "C3" && e.exercise.sprintMeters ? e.exercise.sprintMeters : e.rep.repMeters), 0);
}

/** The A1 reps the workout starts with, until the first rep of another zone. */
function warmup(workout: CoachWorkout): { meters: number; exercises: Set<CoachWorkoutExercise> } {
  const exercises = new Set<CoachWorkoutExercise>();
  let meters = 0;
  for (const e of entries(workout)) {
    if (e.code !== "A1") break;
    exercises.add(e.exercise);
    meters += e.rep.repeats * e.rep.repMeters;
  }
  return { meters, exercises };
}

const REST_WHY: Partial<Record<PaceZoneCode, string>> = {
  C2: "in C2 il recupero è almeno lungo quanto la ripetuta",
  C3: "in C3 il recupero è almeno 3 volte la ripetuta",
};

const capText = (history: PoolHistory, cap: number) =>
  `${cap} m, 1,5 volte la mediana delle tue ultime ${history.swims === 1 ? "nuotata" : `${history.swims} nuotate`} in vasca (${history.medianMeters} m)`;

/** What a finalized workout breaks of the safety limits (nothing is changed). */
export function checkSafety(workout: CoachWorkout, ctx: SafetyContext): WorkoutViolation[] {
  const violations: WorkoutViolation[] = [];
  const add = (section: string, exercise: string, kind: WorkoutViolation["kind"], problem: string) =>
    violations.push({ section, exercise, kind, problem, fixed: false });

  for (const code of ["C1", "C2", "C3"] as const) {
    const meters = zoneMeters(workout, code);
    const cap = L.sessionMeters[code]!;
    if (meters > cap) add("Allenamento", code, "safety_volume", `${meters} m in ${code} in tutto: al massimo ${cap} m in un allenamento`);
  }

  for (const e of entries(workout)) {
    if (!e.code || e.rep.repeats < 2) continue;
    const min = minRestSeconds(e.code, e.exercise, ctx);
    if (min === null) continue;
    const rest = restAfter(e.exercise, e.code, ctx);
    if (rest !== null && rest >= min) continue;
    const spec = parseRest(e.exercise.rest);
    const said =
      rest === null
        ? "manca il recupero"
        : spec?.kind === "sendoff"
          ? `la ripartenza «${e.exercise.rest}» lascia circa ${formatRestSeconds(Math.max(0, round5(rest)))} di recupero`
          : `recupero di ${formatRestSeconds(rest)}`;
    add(e.section.title, e.exercise.name, "safety_rest", `${said}: serve almeno ${formatRestSeconds(min)} (${REST_WHY[e.code]})`);
  }

  const start = warmup(workout);
  if (start.meters < L.warmupA1Meters) {
    add(
      workout.sections?.[0]?.title ?? "Riscaldamento",
      "Riscaldamento",
      "safety_warmup",
      `${start.meters} m facili in A1 all'inizio: servono almeno ${L.warmupA1Meters} m di riscaldamento in A1`,
    );
  }

  const cap = totalCapMeters(ctx.history);
  const total = totalOf(workout);
  if (cap !== null && total > cap) {
    add("Allenamento", "Totale", "safety_total", `${total} m in tutto: al massimo ${capText(ctx.history!, cap)}`);
  }
  return violations;
}

/** The safety limits as rules for the model, with the athlete's own total. */
export function safetyRulesText(history: PoolHistory | null): string {
  const cap = totalCapMeters(history);
  const total = cap !== null ? `il totale non supera ${capText(history!, cap)}` : "il totale resta vicino alle nuotate abituali dell'atleta";
  return `limiti di sicurezza (il server li controlla e taglia quello che li supera): in un allenamento al massimo ${L.sessionMeters.C1} m in C1, ${L.sessionMeters.C2} m in C2 e ${L.sessionMeters.C3} m in C3; in C2 il recupero è almeno lungo quanto la ripetuta e in C3 almeno 3 volte (con una ripartenza, conta il recupero che resta al passo della zona); si comincia sempre con almeno ${L.warmupA1Meters} m facili in A1; ${total}`;
}

type Change = { from: Rep; name: string; reasons: Set<string> };

/**
 * The workout within the safety limits (a copy): longer rests in C2 and C3, fewer reps of the
 * hardest sets until the C1/C2/C3 metres and the total fit, an A1 warm-up when missing. Each
 * changed rep says what changed in `zoneNote`; a removed set is told in the coach notes.
 */
export function enforceSafety(source: CoachWorkout, ctx: SafetyContext): { workout: CoachWorkout; changes: string[] } {
  const workout = structuredClone(source);
  const changed = new Map<CoachWorkoutExercise, Change>();
  const restNotes = new Map<CoachWorkoutExercise, string>();
  const removed: string[] = [];
  const notes: string[] = [];

  // 1. Rests of C2 and C3.
  for (const e of entries(workout)) {
    if (!e.code || e.rep.repeats < 2) continue;
    const min = minRestSeconds(e.code, e.exercise, ctx);
    if (min === null) continue;
    const rest = restAfter(e.exercise, e.code, ctx);
    if (rest !== null && rest >= min) continue;
    const spec = parseRest(e.exercise.rest);
    if (spec?.kind === "sendoff") {
      const sendoff = ceil5(repTimes(e.exercise, e.code, ctx).full + min);
      e.exercise.rest = withSendoff(String(e.exercise.rest), sendoff);
      const left = round5(sendoff - repTimes(e.exercise, e.code, ctx).full);
      restNotes.set(e.exercise, `Ripartenza portata ${formatSendoff(sendoff)}, circa ${formatRestSeconds(left)} di recupero: ${REST_WHY[e.code]}.`);
    } else {
      e.exercise.rest = formatRestSeconds(min);
      restNotes.set(e.exercise, `Recupero ${spec ? "portato" : "fissato"} a ${formatRestSeconds(min)}: ${REST_WHY[e.code]}.`);
    }
  }

  /** One rep less, or 100 m less on a single rep, or the whole set out. */
  const reduce = (e: Entry, reason: string) => {
    const change = changed.get(e.exercise) ?? { from: { ...e.rep }, name: e.exercise.name, reasons: new Set<string>() };
    change.reasons.add(reason);
    changed.set(e.exercise, change);
    if (e.rep.repeats > 1) writeRep(e.exercise, { repeats: e.rep.repeats - 1, repMeters: e.rep.repMeters });
    else if (e.rep.repMeters - 100 >= 100) writeRep(e.exercise, { repeats: 1, repMeters: e.rep.repMeters - 100 });
    else {
      e.section.exercises = e.section.exercises.filter((exercise) => exercise !== e.exercise);
      changed.delete(e.exercise);
      restNotes.delete(e.exercise);
      removed.push(`Tolta la serie «${change.name}» (${repLabel(change.from)}): ${reason}.`);
    }
  };
  const hardestFirst = (a: Entry, b: Entry, order: Entry[]) =>
    zoneIndex(b.code) - zoneIndex(a.code) ||
    b.rep.repeats * b.rep.repMeters - a.rep.repeats * a.rep.repMeters ||
    order.indexOf(b) - order.indexOf(a);

  // 2. Metres of C3, C2 and C1: fewer reps of the longest set of the zone.
  for (const code of ["C3", "C2", "C1"] as const) {
    const cap = L.sessionMeters[code]!;
    const reason = `in un allenamento al massimo ${cap} m in ${code}`;
    while (zoneMeters(workout, code) > cap) {
      const all = entries(workout);
      const candidates = all.filter((e) => e.code === code).sort((a, b) => hardestFirst(a, b, all));
      if (candidates.length === 0) break;
      reduce(candidates[0], reason);
    }
  }

  // 3. The A1 warm-up.
  const start = warmup(workout);
  if (start.meters < L.warmupA1Meters) {
    const meters = Math.ceil((L.warmupA1Meters - start.meters) / 50) * 50;
    const range = ctx.zones?.source ? ctx.zones.ranges.find((candidate) => candidate.code === "A1") : undefined;
    const exercise: CoachWorkoutExercise = {
      name: `${meters} stile libero sciolto`,
      repeats: 1,
      repMeters: meters,
      distance: `${meters}m`,
      stroke: "stile libero",
      zone: "A1",
      level: "Facile",
      intensity: "Facile",
      targetPace: range ? { fastPace: range.fastPace, slowPace: range.slowPace } : null,
      zoneNote: `Aggiunto: ogni allenamento comincia con almeno ${L.warmupA1Meters} m facili in A1, per scaldarti.`,
    };
    const first = workout.sections?.[0];
    if (first && /riscald/i.test(first.title)) first.exercises = [exercise, ...(first.exercises ?? [])];
    else workout.sections = [{ title: "Riscaldamento", exercises: [exercise] }, ...(workout.sections ?? [])];
    notes.push(`Aggiunti ${meters} m di riscaldamento in A1.`);
  }

  // 4. The total: fewer reps of the hardest sets, the warm-up last and never under 200 m.
  const cap = totalCapMeters(ctx.history);
  if (cap !== null) {
    const reason = `il totale resta entro ${capText(ctx.history!, cap)}`;
    while (totalOf(workout) > cap) {
      const all = entries(workout);
      const kept = warmup(workout).exercises;
      const candidates = all.filter((e) => !kept.has(e.exercise)).sort((a, b) => hardestFirst(a, b, all));
      if (candidates.length > 0) {
        reduce(candidates[0], reason);
        continue;
      }
      // Only the warm-up is left: shorten it while it keeps its 200 m.
      const last = all.filter((e) => kept.has(e.exercise)).pop();
      if (!last) break;
      const less = last.rep.repeats > 1 ? last.rep.repMeters : last.rep.repMeters - 100 >= 100 ? 100 : last.rep.repMeters;
      if (warmup(workout).meters - less < L.warmupA1Meters) break;
      reduce(last, reason);
    }
  }

  // Notes: what changed under each rep, what was removed in the coach notes.
  for (const [exercise, change] of Array.from(changed)) {
    const now = { repeats: exercise.repeats ?? 0, repMeters: exercise.repMeters ?? 0 };
    const text = `Ridotto da ${repLabel(change.from)} a ${repLabel(now)}: ${Array.from(change.reasons).join("; ")}.`;
    exercise.zoneNote = [exercise.zoneNote, text].filter(Boolean).join(" ");
    notes.push(`«${exercise.name}»: ${text}`);
  }
  for (const [exercise, text] of Array.from(restNotes)) {
    exercise.zoneNote = [exercise.zoneNote, text].filter(Boolean).join(" ");
    notes.push(`«${exercise.name}»: ${text}`);
  }
  notes.push(...removed);
  workout.sections = (workout.sections ?? []).filter((section) => (section.exercises ?? []).length > 0);
  if (notes.length > 0) {
    workout.coachNotes = [
      "Allenamento adattato ai limiti di sicurezza di SwimForge: sotto ogni serie cambiata trovi cosa è cambiato e perché.",
      ...removed,
      ...(workout.coachNotes ?? []),
    ];
  }
  workout.totalMeters = totalOf(workout);
  return { workout, changes: notes };
}
