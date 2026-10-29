/**
 * The user's 400/200 CSS test, kept in swimmer_profiles.preferences.cssTest (no migration).
 */
import { z } from "zod";
import { dayKey } from "@shared/swimMetrics";
import { mergeSwimmerPreferences } from "../lib/preferences";
import type { CssTest } from "./compute";
import { CSS_MAX_PACE, CSS_MIN_PACE, cssFromTest } from "./css";
import { dropCachedSwimMetrics } from "./index";

export const CSS_TEST_LIMITS = {
  t200Seconds: { min: 100, max: 420 },
  t400Seconds: { min: 180, max: 900 },
  /** T400 ≥ 2.02 × T200 keeps the CSS slower than the 400 pace (D′ ≥ 0), with a small margin. */
  ratio: { min: 2.02, max: 2.4 },
  /** The resulting CSS, seconds per 100 m (as for the estimate). */
  pace: { min: CSS_MIN_PACE, max: CSS_MAX_PACE },
} as const;

export const CSS_TEST_MESSAGES = {
  t200: "Il tempo sui 200 m deve essere tra 1:40 e 7:00.",
  t400: "Il tempo sui 400 m deve essere tra 3:00 e 15:00.",
  ratioLow:
    "Il 400 è troppo veloce rispetto al 200: deve durare almeno 2,02 volte il tempo sui 200 m. Controlla i tempi.",
  ratioHigh:
    "Il 400 è troppo lento rispetto al 200: deve durare al massimo 2,4 volte il tempo sui 200 m. Controlla i tempi.",
  pace: "Con questi tempi il passo soglia sarebbe fuori dall'intervallo accettato (tra 1:00 e 3:30 per 100 m): controlla i tempi.",
  dateInvalid: "Data non valida.",
  dateFuture: "La data del test non può essere nel futuro.",
} as const;

export type CssTestField = "t200Seconds" | "t400Seconds" | "date";
export type CssTestError = { field: CssTestField; message: string };

const EPSILON = 1e-9;

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const inRange = (value: number, range: { min: number; max: number }) =>
  Number.isFinite(value) && value >= range.min && value <= range.max;

/**
 * Input of statistics.setCssTest. Every Italian message sits on its field (the issue path), so
 * the client reads `error.data.zodError.fieldErrors[field]`. `today` is the Rome day key.
 */
export function cssTestSchema(today: () => string = () => dayKey(new Date())) {
  const M = CSS_TEST_MESSAGES;
  const L = CSS_TEST_LIMITS;
  return z
    .object({
      t200Seconds: z.number({ error: M.t200 }).min(L.t200Seconds.min, M.t200).max(L.t200Seconds.max, M.t200),
      t400Seconds: z.number({ error: M.t400 }).min(L.t400Seconds.min, M.t400).max(L.t400Seconds.max, M.t400),
      date: z
        .string({ error: M.dateInvalid })
        .refine(isRealDate, { error: M.dateInvalid, abort: true })
        .refine((date) => date <= today(), { error: M.dateFuture }),
    })
    .superRefine((test, ctx) => {
      // Only with both times in range: a wrong 200 must not show up as a 400 error.
      if (!inRange(test.t200Seconds, L.t200Seconds) || !inRange(test.t400Seconds, L.t400Seconds)) return;
      const ratio = test.t400Seconds / test.t200Seconds;
      const path = ["t400Seconds"];
      if (ratio < L.ratio.min - EPSILON) {
        ctx.addIssue({ code: "custom", path, message: M.ratioLow });
        return;
      }
      if (ratio > L.ratio.max + EPSILON) {
        ctx.addIssue({ code: "custom", path, message: M.ratioHigh });
        return;
      }
      const pace = 100 / cssFromTest(test.t200Seconds, test.t400Seconds);
      if (pace < L.pace.min - EPSILON || pace > L.pace.max + EPSILON) {
        ctx.addIssue({ code: "custom", path, message: M.pace });
      }
    });
}

const FIELDS: readonly CssTestField[] = ["t200Seconds", "t400Seconds", "date"];

/** First problem of a test entered by the user, or null; `today` is the Rome day key. */
export function validateCssTest(test: CssTest, today: string = dayKey(new Date())): CssTestError | null {
  const result = cssTestSchema(() => today).safeParse(test);
  if (result.success) return null;
  const issue = result.error.issues[0];
  const field = FIELDS.find((name) => name === issue.path[0]) ?? "t400Seconds";
  return { field, message: issue.message };
}

/**
 * Saves (or with null removes) the test with one SQL merge of preferences.cssTest, keeping every
 * other preference key, and drops the cached metrics (not the Coach insights). False when the
 * user has no profile.
 */
export async function updateCssTest(userId: number, test: CssTest | null): Promise<boolean> {
  const saved = test
    ? await mergeSwimmerPreferences(userId, { cssTest: test })
    : await mergeSwimmerPreferences(userId, {}, ["cssTest"]);
  if (!saved) return false;
  await dropCachedSwimMetrics(userId);
  return true;
}
