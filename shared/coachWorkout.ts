/**
 * The AI coach's generated workouts (pool and dry-land) as the server stores them and the client
 * shows them. Pool reps carry a pace zone A1–C3: the model writes the zone, the server checks the
 * maximum rep, splits a rep that is too long, adds the level and the target pace from the
 * athlete's zones and recomputes the total. Workouts stored before the zones have none of these
 * fields.
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
   * open end of A1, C2 and C3), freestyle only; added by the server.
   */
  targetPace?: { fastPace: number | null; slowPace: number | null } | null;
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
