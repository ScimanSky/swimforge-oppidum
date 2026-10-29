import {
  NO_VALUE,
  distanceParts,
  formatDurationParts,
  formatInteger,
  formatPaceValue,
} from "@/lib/format";

/** Labels shared by the challenge list, the create dialog and the challenge detail. */
export const CHALLENGE_TYPE_LABELS: Record<string, string> = {
  pool: "Vasca",
  open_water: "Acque libere",
  both: "Vasca e acque libere",
};

export const CHALLENGE_OBJECTIVE_LABELS: Record<string, string> = {
  total_distance: "Distanza totale",
  total_sessions: "Nuotate totali",
  consistency: "Costanza",
  avg_pace: "Passo medio",
  total_time: "Tempo totale",
  longest_session: "Nuotata più lunga",
};

export const CHALLENGE_DURATION_LABELS: Record<string, string> = {
  "3_days": "3 giorni",
  "1_week": "1 settimana",
  "2_weeks": "2 settimane",
  "1_month": "1 mese",
};

export const challengeObjectiveLabel = (objective: string) =>
  CHALLENGE_OBJECTIVE_LABELS[objective] ?? objective;

/**
 * A challenge progress value split for `<Metric>` / ranking rows, by objective: metres for
 * distances, seconds for time, seconds per 100 m for pace, counts otherwise. Zero is shown as
 * zero (a participant who has not swum yet), a pace without data as «—».
 */
export function challengeProgressParts(
  objective: string,
  raw: number | null | undefined
): { value: string; unit?: string } {
  const value = Number(raw ?? 0);
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  switch (objective) {
    case "total_distance":
    case "longest_session":
      return safe > 0 ? distanceParts(safe) : { value: "0", unit: "km" };
    case "total_time":
      return formatDurationParts(safe) ?? { value: "0", unit: "min" };
    case "avg_pace":
      return safe > 0 ? { value: formatPaceValue(safe), unit: "/100 m" } : { value: NO_VALUE };
    case "total_sessions":
      return { value: formatInteger(safe), unit: Math.round(safe) === 1 ? "nuotata" : "nuotate" };
    case "consistency":
      return { value: formatInteger(safe), unit: Math.round(safe) === 1 ? "giorno" : "giorni" };
    default:
      return { value: formatInteger(safe) };
  }
}


/** For pace (seconds per 100 m) lower is better; for every other objective higher is. */
const isLowerBetter = (objective: string) => objective === "avg_pace";

/** Pace 0 means «no swim yet»: it never counts as a result. */
const withData = (objective: string, values: readonly number[]) =>
  isLowerBetter(objective) ? values.filter((value) => value > 0) : values;

/** Comparator, best first: descending, or ascending pace with the swimmers without data last. */
export const compareChallengeProgress = (objective: string) => (a: number, b: number) => {
  if (!isLowerBetter(objective)) return b - a;
  if (a > 0 && b > 0) return a - b;
  return (b > 0 ? 1 : 0) - (a > 0 ? 1 : 0);
};

/** Best result of the group (the highest, or the lowest pace); 0 without data. */
export function bestChallengeProgress(objective: string, values: readonly number[]): number {
  const valid = withData(objective, values);
  if (valid.length === 0) return 0;
  return isLowerBetter(objective) ? Math.min(...valid) : Math.max(...valid);
}

/** Group average; for pace only over the swimmers with a result. 0 without data. */
export function averageChallengeProgress(objective: string, values: readonly number[]): number {
  const valid = withData(objective, values);
  return valid.length === 0 ? 0 : valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

/** Progress bar 0-100 against the best of the group (inverted for pace: best / mine). */
export function challengeProgressPercent(
  objective: string,
  mine: number,
  values: readonly number[]
): number {
  const best = bestChallengeProgress(objective, values);
  if (!(mine > 0) || !(best > 0)) return 0;
  const ratio = isLowerBetter(objective) ? best / mine : mine / best;
  return Math.min(100, ratio * 100);
}
