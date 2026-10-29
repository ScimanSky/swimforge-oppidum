/**
 * The user's 400/200 CSS test, kept in swimmer_profiles.preferences.cssTest (no migration).
 */
import { eq } from "drizzle-orm";
import { dayKey } from "@shared/swimMetrics";
import { swimmerProfiles } from "../../drizzle/schema";
import { getDb } from "../db";
import type { CssTest } from "./compute";
import { invalidateSwimMetrics, preferencesObject } from "./index";

export const CSS_TEST_LIMITS = {
  t200Seconds: { min: 90, max: 420 },
  t400Seconds: { min: 180, max: 900 },
  ratio: { min: 1.9, max: 2.4 },
} as const;

export type CssTestError = { field: "t200Seconds" | "t400Seconds" | "date"; message: string };

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** First problem of a test entered by the user, or null; `today` is the Rome day key. */
export function validateCssTest(test: CssTest, today: string = dayKey(new Date())): CssTestError | null {
  const { t200Seconds, t400Seconds, date } = test;
  const t200 = CSS_TEST_LIMITS.t200Seconds;
  const t400 = CSS_TEST_LIMITS.t400Seconds;
  if (!Number.isFinite(t200Seconds) || t200Seconds < t200.min || t200Seconds > t200.max) {
    return { field: "t200Seconds", message: "Il tempo sui 200 m deve essere tra 1:30 e 7:00." };
  }
  if (!Number.isFinite(t400Seconds) || t400Seconds < t400.min || t400Seconds > t400.max) {
    return { field: "t400Seconds", message: "Il tempo sui 400 m deve essere tra 3:00 e 15:00." };
  }
  const ratio = t400Seconds / t200Seconds;
  // Tolerance so that the exact bounds (e.g. 342/180 = 1.9) are accepted.
  if (ratio < CSS_TEST_LIMITS.ratio.min - 1e-9 || ratio > CSS_TEST_LIMITS.ratio.max + 1e-9) {
    return {
      field: "t400Seconds",
      message: "Il tempo sui 400 m deve essere tra 1,9 e 2,4 volte quello sui 200 m: controlla i tempi.",
    };
  }
  if (!isRealDate(date)) return { field: "date", message: "Data non valida." };
  if (date > today) return { field: "date", message: "La data del test non può essere nel futuro." };
  return null;
}

/**
 * Saves (or with null removes) the test, keeping every other preference key, and drops the
 * cached metrics. False when the user has no profile.
 */
export async function updateCssTest(userId: number, test: CssTest | null): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select({ preferences: swimmerProfiles.preferences })
    .from(swimmerProfiles)
    .where(eq(swimmerProfiles.userId, userId))
    .limit(1);
  if (!row) return false;

  const preferences = { ...preferencesObject(row.preferences) };
  if (test) preferences.cssTest = test;
  else delete preferences.cssTest;

  await db
    .update(swimmerProfiles)
    .set({ preferences, updatedAt: new Date() })
    .where(eq(swimmerProfiles.userId, userId));
  await invalidateSwimMetrics(userId);
  return true;
}
