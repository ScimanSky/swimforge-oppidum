/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type MeetStatus = "draft" | "published" | "open" | "closed" | "completed" | "cancelled";
export type EntryStatus = "pending" | "confirmed" | "waitlist" | "rejected" | "withdrawn";
export type ResultImportMode = "csv" | "pdf_manual";
export type HistoricalProvider = "oppidum_html";
export type HistoricalImportStatus = "running" | "success" | "partial" | "failed";
export type HistoricalEntityType = "athlete_profile" | "meet_result";
export type HistoricalImportMode = "oppidum_index_full" | "oppidum_meet_only" | "oppidum_athlete_only";

export type ClubPoolWorkoutStatus = "draft" | "published" | "archived" | "cancelled";
export type ClubPoolWorkoutFocus = "tecnica" | "aerobico" | "soglia" | "velocita" | "recupero";
export type ClubPoolWorkoutStroke = "sl" | "do" | "ra" | "de" | "mx";
export type ClubPoolWorkoutEquipment = "pinne" | "palette" | "pull" | "tavoletta" | "snorkel";
export type ClubPoolWorkoutDirective = {
  focus: ClubPoolWorkoutFocus[];
  volume: "light" | "medium" | "high" | "very_high";
  intensity: "easy" | "mixed" | "hard";
  strokeMix: ClubPoolWorkoutStroke[];
  equipment: ClubPoolWorkoutEquipment[];
  sessionMinutes: 45 | 60 | 75 | 90;
  targetDistanceMeters?: number | null;
  notes?: string | null;
};
export type ClubPoolWorkoutBlock = {
  phase: "warmup" | "activation" | "main" | "cooldown";
  label: string;
  items: Array<{
    label: string;
    stroke?: string;
    distance?: string;
    reps?: string;
    sendoff?: string;
    rest?: string;
    intensity?: string;
    targetPace?: string;
    notes?: string;
  }>;
};
export type ClubPoolWorkoutPlan = {
  title: string;
  description: string;
  totalDistance: string;
  estimatedDuration: string;
  blocks: ClubPoolWorkoutBlock[];
  coachNotes: string[];
};

export type * from "../drizzle/schema";
export * from "./_core/errors";
