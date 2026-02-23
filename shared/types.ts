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

export type * from "../drizzle/schema";
export * from "./_core/errors";
